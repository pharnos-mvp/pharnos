import { beforeEach, describe, expect, it } from 'vitest'

import { db } from '@/lib/db'
import {
  archiveDossier,
  createDossier,
  deleteDossier,
  getDossier,
  listArchivedDossiers,
  listDossiers,
  restoreDossier,
} from './dossier-repository'

const ORG = 'org-1'

beforeEach(async () => {
  await db.dossiers.clear()
  await db.outbox.clear()
  await db.auditLog.clear()
})

const seed = (name = 'X') =>
  createDossier(ORG, {
    productId: 'p1',
    productName: name,
    format: 'ctd',
    activity: 'new_ma',
    country: 'SN',
  })

describe('dossier repository (offline-first)', () => {
  it('crée un dossier CTD avec une copie indépendante de l’arborescence UEMOA', async () => {
    const d = await createDossier(ORG, {
      productId: 'p1',
      productName: 'Doliprane',
      format: 'ctd',
      activity: 'new_ma',
      country: 'CI',
    })

    expect(d.id).toBeTruthy()
    expect(d.format).toBe('ctd')
    expect(d.tree.length).toBeGreaterThan(0)
    // 1.1.2 = Lettre de PGHT (personnalisation UEMOA)
    const corr = d.tree.find((n) => n.number === '1.1')
    expect(corr?.children?.find((c) => c.number === '1.1.2')?.label).toContain('PGHT')

    expect(await listDossiers(ORG)).toHaveLength(1)
    const outbox = await db.outbox.where('entity').equals('dossier').toArray()
    expect(outbox[0]?.op).toBe('create')
  })

  it('crée un dossier eCTD avec l’arborescence ECOWAS (1.0 Correspondance)', async () => {
    const d = await createDossier(ORG, {
      productId: 'p1',
      productName: 'Doliprane',
      format: 'ectd',
      activity: 'new_ma',
      country: 'NG',
    })
    expect(d.tree.find((n) => n.number === '1.0')?.label).toBe('Correspondance')
  })

  it('supprime (soft delete) un dossier', async () => {
    const d = await createDossier(ORG, {
      productId: 'p1',
      productName: 'X',
      format: 'ctd',
      activity: 'new_ma',
      country: 'SN',
    })
    await deleteDossier(d.id)
    expect(await listDossiers(ORG)).toHaveLength(0)
    expect(await getDossier(d.id)).toBeUndefined()
  })
})

describe('rétention réglementaire : archive / restore / motif', () => {
  it('archive un dossier (hors actif, présent en archivés, audit « archive » + motif)', async () => {
    const d = await seed()
    await archiveDossier(d.id, 'soumis à la DPM')
    expect(await listDossiers(ORG)).toHaveLength(0)
    const arch = await listArchivedDossiers(ORG)
    expect(arch).toHaveLength(1)
    expect(arch[0]?.archivedAt).toBeTruthy()
    const ev = (await db.auditLog.toArray()).find((a) => a.action === 'archive')
    expect(ev?.label).toContain('motif : soumis à la DPM')
  })

  it('restaure un dossier archivé dans l’actif (audit « restore »)', async () => {
    const d = await seed()
    await archiveDossier(d.id)
    await restoreDossier(d.id)
    expect(await listArchivedDossiers(ORG)).toHaveLength(0)
    expect(await listDossiers(ORG)).toHaveLength(1)
    expect((await db.auditLog.toArray()).some((a) => a.action === 'restore')).toBe(true)
  })

  it('la suppression d’un brouillon trace le motif à l’audit', async () => {
    const d = await seed()
    await deleteDossier(d.id, 'doublon')
    const ev = (await db.auditLog.toArray()).find((a) => a.action === 'delete')
    expect(ev?.label).toContain('motif : doublon')
  })

  it('archiver deux fois est un no-op (idempotent)', async () => {
    const d = await seed()
    await archiveDossier(d.id)
    await archiveDossier(d.id)
    expect(await listArchivedDossiers(ORG)).toHaveLength(1)
  })
})
