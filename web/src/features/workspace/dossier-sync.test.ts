import { describe, expect, it } from 'vitest'

import { db, type DossierRecord } from '@/lib/db'
import { dossierToRow, purgeLocalChildren, rowToDossier } from './dossier-sync'

const rec: DossierRecord = {
  id: 'd1',
  orgId: 'org-1',
  productId: 'p1',
  productName: 'Doliprane',
  format: 'ctd',
  activity: 'new_ma',
  country: 'CI',
  status: 'draft',
  tree: [{ id: 'n1', number: '1.0', label: 'TdM' }],
  excludedDocIds: [],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-02T00:00:00.000Z',
  deletedAt: null,
  archivedAt: null,
  opYear: null,
  opNumber: null,
  purgedAt: null,
}

describe('dossier sync mapping', () => {
  it('round-trip DossierRecord <-> row (arbre préservé)', () => {
    const back = rowToDossier(dossierToRow(rec))
    expect(back).toEqual(rec)
    expect(back.tree[0]?.label).toBe('TdM')
  })

  it('mappe en snake_case', () => {
    const row = dossierToRow(rec)
    expect(row.org_id).toBe('org-1')
    expect(row.product_name).toBe('Doliprane')
    expect(row.product_id).toBe('p1')
  })

  it('round-trip des champs variation (variations / items / AMM, `0042`)', () => {
    const variation: DossierRecord = {
      ...rec,
      activity: 'variation',
      variations: [3, 13],
      variationItems: [{ ref: 3, nature: 'Changement de nom', before: 'A', after: 'B' }],
      ammNumero: 'AMM_2015_7457',
      ammDate: '2021-03-17',
    }
    const row = dossierToRow(variation)
    expect(row.variations).toEqual([3, 13])
    expect(row.amm_numero).toBe('AMM_2015_7457')
    expect(row.amm_date).toBe('2021-03-17')
    expect(rowToDossier(row)).toEqual(variation)
  })

  it('dossier non-variation : champs variation nuls côté row', () => {
    const row = dossierToRow(rec)
    expect(row.variations).toBeNull()
    expect(row.variation_items).toBeNull()
    expect(row.amm_numero).toBeNull()
  })

  it("n° d'opération (0046) : JAMAIS poussé par le client, mais mappé au pull", () => {
    // Le push omet op_year/op_number → l'upsert ne les écrase pas (trigger serveur seul juge).
    const row = dossierToRow(rec)
    expect('op_year' in row).toBe(false)
    expect('op_number' in row).toBe(false)
    // Le pull (row serveur numérotée) descend le n° dans Dexie.
    const numbered = rowToDossier({ ...dossierToRow(rec), op_year: 2026, op_number: 7 })
    expect(numbered.opYear).toBe(2026)
    expect(numbered.opNumber).toBe(7)
  })

  it('purge de rétention (0054) : JAMAIS poussée par le client, mais mappée au pull', () => {
    // Un appareil retardataire qui re-pousse un dossier purgé ne doit pas « dé-purger » le
    // squelette tombstone serveur → purged_at est absent du push (pattern op_year/op_number).
    const row = dossierToRow({ ...rec, purgedAt: '2026-08-01T05:37:00.000Z' })
    expect('purged_at' in row).toBe(false)
    // Le pull descend la purge dans Dexie (déclenche le miroir local des enfants).
    const purged = rowToDossier({ ...dossierToRow(rec), purged_at: '2026-08-01T05:37:00.000Z' })
    expect(purged.purgedAt).toBe('2026-08-01T05:37:00.000Z')
  })

  it('miroir local de purge : enfants effacés, BLOBS de pièces jointes inclus (espace rendu)', async () => {
    const now = '2026-08-01T00:00:00.000Z'
    await db.dossierAttachments.add({
      id: 'att-1',
      orgId: 'org-1',
      dossierId: 'd1',
      nodeNumber: '1.2',
      fileName: 'gmp.pdf',
      mimeType: 'application/pdf',
      size: 3,
      filePath: null,
      uploaded: false,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    })
    await db.documentBlobs.add({ id: 'att-1', blob: new Blob(['pdf']) })
    await db.generatedDocs.add({
      id: 'gen-1',
      orgId: 'org-1',
      dossierId: 'd1',
      nodeNumber: '1.0',
      templateKey: 'cover',
      title: 'Cover',
      content: {},
      status: 'draft',
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    })
    await db.lifecycleEvents.add({
      id: 'ev-1',
      orgId: 'org-1',
      dossierId: 'd1',
      type: 'submitted',
      actorId: 'u1',
      actorEmail: '',
      occurredAt: now,
      payload: {},
      docRefs: [],
      createdAt: now,
    })
    // Un autre dossier n'est PAS touché (l'effacement est ciblé).
    await db.documentBlobs.add({ id: 'att-other', blob: new Blob(['x']) })

    await purgeLocalChildren('d1')

    expect(await db.dossierAttachments.where('dossierId').equals('d1').count()).toBe(0)
    expect(await db.generatedDocs.where('dossierId').equals('d1').count()).toBe(0)
    expect(await db.lifecycleEvents.where('dossierId').equals('d1').count()).toBe(0)
    expect(await db.documentBlobs.get('att-1')).toBeUndefined()
    expect(await db.documentBlobs.get('att-other')).toBeDefined()

    await db.documentBlobs.clear()
  })
})
