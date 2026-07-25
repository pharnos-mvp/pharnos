import { beforeEach, describe, expect, it } from 'vitest'

import { db } from '@/lib/db'
import {
  archiveDossier,
  createDossier,
  deleteDossier,
  getDossier,
  listArchivedDossiers,
  listDossiers,
  listTrashedDossiers,
  restoreDossier,
  restoreTrashedDossier,
  switchDossierRefVersion,
  TRASH_RETENTION_DAYS,
  trashDaysLeft,
  trashPurgeAt,
} from './dossier-repository'

const ORG = 'org-1'

beforeEach(async () => {
  await db.dossiers.clear()
  await db.outbox.clear()
  await db.auditLog.clear()
  await db.refVersions.clear()
  await db.orgRefAdoptions.clear()
})

/** Deux versions publiées ; l'org adopte (ou non) la plus récente. */
async function seedRefVersions(adopted?: 'v-1' | 'v-2') {
  await db.refVersions.bulkPut([
    {
      id: 'v-1',
      label: 'v2026.1',
      status: 'published',
      effectiveDate: null,
      releaseNote: '',
      publishedAt: '2026-03-01T00:00:00.000Z',
      createdAt: '2026-03-01T00:00:00.000Z',
    },
    {
      id: 'v-2',
      label: 'v2026.2',
      status: 'published',
      effectiveDate: null,
      releaseNote: '',
      publishedAt: '2026-07-15T00:00:00.000Z',
      createdAt: '2026-07-15T00:00:00.000Z',
    },
  ])
  if (adopted) {
    await db.orgRefAdoptions.put({
      id: `a-${adopted}`,
      orgId: ORG,
      versionId: adopted,
      adoptedAt: '2026-07-16T00:00:00.000Z',
      adoptedByEmail: 'admin@ex.com',
    })
  }
}

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

describe('corbeille : brouillons supprimés restaurables, purge après fenêtre de grâce', () => {
  it('un brouillon supprimé va en corbeille (hors actif) et se restaure dans l’actif', async () => {
    const d = await seed()
    await deleteDossier(d.id, 'doublon')
    expect(await listDossiers(ORG)).toHaveLength(0)
    const trash = await listTrashedDossiers(ORG)
    expect(trash).toHaveLength(1)
    expect(trash[0]?.deletedAt).toBeTruthy()

    await restoreTrashedDossier(d.id)
    expect(await listTrashedDossiers(ORG)).toHaveLength(0)
    expect(await listDossiers(ORG)).toHaveLength(1)
    expect((await db.auditLog.toArray()).some((a) => a.action === 'restore')).toBe(true)
  })

  it('restaurer un dossier NON supprimé est un no-op', async () => {
    const d = await seed()
    await restoreTrashedDossier(d.id)
    expect(await listDossiers(ORG)).toHaveLength(1)
    expect((await db.auditLog.toArray()).some((a) => a.action === 'restore')).toBe(false)
  })

  it('un élément PURGÉ (squelette tombstone serveur) sort de la corbeille et est irrécupérable', async () => {
    const d = await seed()
    await deleteDossier(d.id)
    const trashed = await db.dossiers.get(d.id)
    await db.dossiers.put({ ...trashed!, purgedAt: '2026-08-01T05:37:00.000Z' })
    expect(await listTrashedDossiers(ORG)).toHaveLength(0)
    await restoreTrashedDossier(d.id) // refusé : purgé
    expect(await listDossiers(ORG)).toHaveLength(0)
  })

  it('échéance de purge = suppression + fenêtre de grâce ; jours restants bornés à [0, fenêtre]', () => {
    expect(TRASH_RETENTION_DAYS).toBe(30)
    expect(trashPurgeAt('2026-07-01T10:00:00.000Z')).toBe('2026-07-31T10:00:00.000Z')
    // Reste 1 jour à J−1, 30 (arrondi sup.) juste après la suppression, 0 une fois échu.
    expect(trashDaysLeft('2026-07-01T10:00:00.000Z', new Date('2026-07-30T10:00:00.000Z'))).toBe(1)
    expect(trashDaysLeft('2026-07-01T10:00:00.000Z', new Date('2026-07-01T10:00:01.000Z'))).toBe(30)
    expect(trashDaysLeft('2026-07-01T10:00:00.000Z', new Date('2026-09-01T00:00:00.000Z'))).toBe(0)
    // `now` d'affichage figé AVANT deletedAt (page déjà montée) : jamais « 31 j » — borné à la fenêtre.
    expect(trashDaysLeft('2026-07-01T10:00:00.000Z', new Date('2026-07-01T09:59:00.000Z'))).toBe(30)
  })

  it('zombie interdit : purgedAt posé + deletedAt null (écriture retardataire) reste invisible partout', async () => {
    // Course restaurer/purger (jour 30) : si une vieille copie remettait deletedAt à null alors
    // que la purge est passée, le squelette ne doit réapparaître dans AUCUNE vue (GxP).
    const d = await seed()
    const rec = await db.dossiers.get(d.id)
    await db.dossiers.put({ ...rec!, deletedAt: null, purgedAt: '2026-08-01T05:37:00.000Z' })
    expect(await listDossiers(ORG)).toHaveLength(0)
    expect(await listArchivedDossiers(ORG)).toHaveLength(0)
    expect(await listTrashedDossiers(ORG)).toHaveLength(0)
    expect(await getDossier(d.id)).toBeUndefined()
  })
})

describe('épinglage du référentiel (P4.2b)', () => {
  it('épingle le dossier sur la version APPLIQUÉE par l’org à sa création', async () => {
    await seedRefVersions('v-2')

    const d = await seed()

    expect(d.refVersionId).toBe('v-2')
    expect((await getDossier(d.id))?.refVersionId).toBe('v-2')
  })

  it('sans adoption : épinglé sur le SOCLE, pas sur la dernière publiée', async () => {
    await seedRefVersions()

    expect((await seed()).refVersionId).toBe('v-1')
  })

  it('réplique vide (1re session / hors-ligne) : création OK, épinglage null', async () => {
    const d = await seed()

    expect(d.refVersionId).toBe(null)
    expect(await listDossiers(ORG)).toHaveLength(1)
  })

  it('bascule volontaire : met à jour, met en file de synchro et TRACE l’audit vX → vY', async () => {
    await seedRefVersions('v-1')
    const d = await seed()
    await db.outbox.clear()
    await db.auditLog.clear()

    await switchDossierRefVersion(d.id, 'v-2', { from: 'v2026.1', to: 'v2026.2' })

    expect((await getDossier(d.id))?.refVersionId).toBe('v-2')
    expect(await db.outbox.where('entity').equals('dossier').count()).toBe(1)
    const audit = await db.auditLog.toArray()
    expect(audit[0]?.label).toContain('référentiel v2026.1 → v2026.2')
  })

  it('bascule idempotente (double clic) : aucune écriture, aucune trace en double', async () => {
    await seedRefVersions('v-1')
    const d = await seed()
    await switchDossierRefVersion(d.id, 'v-2', { from: 'v2026.1', to: 'v2026.2' })
    await db.outbox.clear()
    await db.auditLog.clear()

    await switchDossierRefVersion(d.id, 'v-2', { from: 'v2026.1', to: 'v2026.2' })

    expect(await db.outbox.count()).toBe(0)
    expect(await db.auditLog.count()).toBe(0)
  })

  it('un dossier supprimé ne bascule pas', async () => {
    await seedRefVersions('v-1')
    const d = await seed()
    await deleteDossier(d.id, 'test')

    await switchDossierRefVersion(d.id, 'v-2', { from: 'v2026.1', to: 'v2026.2' })

    expect((await db.dossiers.get(d.id))?.refVersionId).toBe('v-1')
  })
})
