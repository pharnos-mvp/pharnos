import { beforeEach, describe, expect, it } from 'vitest'

import { db } from '@/lib/db'
import { createDossier, deleteDossier, listTrashedDossiers } from './dossier-repository'
import { purgeTrashedDossier } from './dossier-purge'

const ORG = 'org-1'

beforeEach(async () => {
  await db.dossiers.clear()
  await db.dossierAttachments.clear()
  await db.documentBlobs.clear()
  await db.generatedDocs.clear()
  await db.lifecycleEvents.clear()
  await db.outbox.clear()
  await db.auditLog.clear()
})

const seed = () =>
  createDossier(ORG, {
    productId: 'p1',
    productName: 'Purge X',
    format: 'ctd',
    activity: 'new_ma',
    country: 'SN',
  })

describe('purge immédiate (mode local : Supabase non configuré → purge locale pure)', () => {
  it('purge un brouillon de corbeille : squelette tombstone + enfants/blobs effacés + audit « purge »', async () => {
    const d = await seed()
    const ts = new Date().toISOString()
    await db.dossierAttachments.add({
      id: 'att-p1',
      orgId: ORG,
      dossierId: d.id,
      nodeNumber: '1.2',
      fileName: 'gmp.pdf',
      mimeType: 'application/pdf',
      size: 3,
      filePath: null,
      uploaded: false,
      createdAt: ts,
      updatedAt: ts,
      deletedAt: null,
    })
    await db.documentBlobs.add({ id: 'att-p1', blob: new Blob(['pdf']) })
    await deleteDossier(d.id, 'doublon')

    await purgeTrashedDossier(ORG, d.id, 'recette')

    // Squelette tombstone local : purgé, vidé, plus dans la corbeille, irrécupérable.
    const rec = await db.dossiers.get(d.id)
    expect(rec?.purgedAt).toBeTruthy()
    expect(rec?.tree).toEqual([])
    expect(await listTrashedDossiers(ORG)).toHaveLength(0)
    // Enfants + octets effacés.
    expect(await db.dossierAttachments.where('dossierId').equals(d.id).count()).toBe(0)
    expect(await db.documentBlobs.get('att-p1')).toBeUndefined()
    // ALCOA : l'acte est tracé avec le motif.
    const ev = (await db.auditLog.toArray()).find((a) => a.action === 'purge')
    expect(ev?.label).toContain('suppression définitive')
    expect(ev?.label).toContain('motif : recette')
  })

  it('no-op si le dossier n’est PAS en corbeille (actif) ou déjà purgé', async () => {
    const d = await seed()
    await purgeTrashedDossier(ORG, d.id) // actif → refus silencieux
    expect((await db.dossiers.get(d.id))?.purgedAt ?? null).toBeNull()

    await deleteDossier(d.id)
    await purgeTrashedDossier(ORG, d.id)
    const purgedAt = (await db.dossiers.get(d.id))?.purgedAt
    await purgeTrashedDossier(ORG, d.id) // déjà purgé → idempotent
    expect((await db.dossiers.get(d.id))?.purgedAt).toBe(purgedAt)
  })
})
