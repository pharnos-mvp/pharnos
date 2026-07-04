import { beforeEach, describe, expect, it } from 'vitest'

import { db } from './db'
import { clearLocalData, localDataOwner, reconcileLocalDataOwner } from './local-data'

async function seed() {
  const ts = '2026-07-04T00:00:00.000Z'
  await db.dossiers.add({
    id: 'd1',
    orgId: 'org-a',
    productId: 'p1',
    productName: 'KV-10D',
    format: 'ctd',
    activity: 'new_ma',
    country: 'BJ',
    status: 'draft',
    tree: [],
    excludedDocIds: [],
    createdAt: ts,
    updatedAt: ts,
    deletedAt: null,
    archivedAt: null,
  })
  await db.lifecycleEvents.add({
    id: 'e1',
    orgId: 'org-a',
    dossierId: 'd1',
    type: 'submitted',
    actorId: 'u1',
    actorEmail: 'a@ex.com',
    occurredAt: ts,
    payload: {},
    docRefs: [],
    createdAt: ts,
  })
  await db.products.add({
    id: 'p1',
    orgId: 'org-a',
    nomCommercial: 'KV-10D',
    dci: 'x',
    dosage: '',
    forme: '',
    presentation: '',
    classeTherapeutique: '',
    codeAtc: '',
    titulaire: '',
    fabricant: '',
    createdAt: ts,
    updatedAt: ts,
    deletedAt: null,
  })
  localStorage.setItem('pharnos.lastPull.dossiers.org-a', ts)
  localStorage.setItem('pharnos.orgId', 'org-a')
}

beforeEach(async () => {
  await db.delete()
  await db.open()
  localStorage.clear()
})

describe('clearLocalData — purge complète du cache local partagé', () => {
  it('vide TOUTES les tables porteuses de données (dont lifecycleEvents, oublié par l’ancien purge)', async () => {
    await seed()
    expect(await db.dossiers.count()).toBe(1)
    expect(await db.lifecycleEvents.count()).toBe(1)

    await clearLocalData()

    for (const table of db.tables) {
      expect(await table.count(), `table ${table.name} doit être vide`).toBe(0)
    }
  })

  it('efface les curseurs de sync + l’org active, garde les préférences d’UI', async () => {
    await seed()
    localStorage.setItem('pharnos.sidebarCollapsed', '1')
    localStorage.setItem('theme', 'dark')

    await clearLocalData()

    expect(localStorage.getItem('pharnos.lastPull.dossiers.org-a')).toBeNull()
    expect(localStorage.getItem('pharnos.orgId')).toBeNull()
    // Préférences d'UI conservées (ce ne sont pas des données).
    expect(localStorage.getItem('pharnos.sidebarCollapsed')).toBe('1')
    expect(localStorage.getItem('theme')).toBe('dark')
  })
})

describe('reconcileLocalDataOwner — garde de changement de compte', () => {
  it('1er login (aucun propriétaire) : pose le propriétaire, NE purge PAS', async () => {
    await seed()
    const purged = await reconcileLocalDataOwner('user-a')
    expect(purged).toBe(false)
    expect(localDataOwner()).toBe('user-a')
    expect(await db.dossiers.count()).toBe(1) // données conservées
  })

  it('même utilisateur (re-login / refresh) : NE purge PAS', async () => {
    await seed()
    await reconcileLocalDataOwner('user-a')
    const purged = await reconcileLocalDataOwner('user-a')
    expect(purged).toBe(false)
    expect(await db.dossiers.count()).toBe(1)
  })

  it('AUTRE utilisateur (swap de session, même navigateur) : PURGE avant exposition', async () => {
    await seed()
    await reconcileLocalDataOwner('user-a')
    expect(await db.dossiers.count()).toBe(1)

    const purged = await reconcileLocalDataOwner('user-b')

    expect(purged).toBe(true)
    expect(localDataOwner()).toBe('user-b')
    expect(await db.dossiers.count()).toBe(0)
    expect(await db.lifecycleEvents.count()).toBe(0)
    expect(await db.products.count()).toBe(0)
  })
})
