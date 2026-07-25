import { beforeEach, describe, expect, it } from 'vitest'

import { db } from './db'
import {
  clearLocalData,
  localDataOwner,
  purgeAllLocalData,
  reconcileLocalDataOwner,
} from './local-data'

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
  // Référentiel réglementaire (0071) : peuplé pour que la garde « TOUTES les tables vides »
  // ci-dessous couvre réellement les nouvelles tables (sinon un oubli passerait faux-vert).
  await db.refVersions.add({
    id: 'v1',
    label: 'v2026.1',
    status: 'published',
    effectiveDate: null,
    releaseNote: '',
    publishedAt: ts,
    createdAt: ts,
  })
  await db.refEntries.add({
    id: 're1',
    versionId: 'v1',
    country: 'SN',
    section: 'fees',
    payload: {},
    provenance: {},
    createdAt: ts,
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

  it('efface curseurs + org + marqueurs scopés (sync/backfill/autostruct), garde les prefs d’UI', async () => {
    await seed()
    localStorage.setItem('pharnos.sync.org-a', '1')
    localStorage.setItem('pharnos.parties.backfilled.org-a', '1')
    localStorage.setItem('pharnos.autostruct.d1', '1')
    localStorage.setItem('pharnos.sidebarCollapsed', '1')
    localStorage.setItem('theme', 'dark')

    await clearLocalData()

    expect(localStorage.getItem('pharnos.lastPull.dossiers.org-a')).toBeNull()
    expect(localStorage.getItem('pharnos.orgId')).toBeNull()
    expect(localStorage.getItem('pharnos.sync.org-a')).toBeNull()
    expect(localStorage.getItem('pharnos.parties.backfilled.org-a')).toBeNull()
    expect(localStorage.getItem('pharnos.autostruct.d1')).toBeNull()
    // Préférences d'UI conservées (ce ne sont pas des données).
    expect(localStorage.getItem('pharnos.sidebarCollapsed')).toBe('1')
    expect(localStorage.getItem('theme')).toBe('dark')
  })

  it('CONSERVE le marqueur de propriétaire (garde de swap robuste même après purge partielle)', async () => {
    localStorage.setItem('pharnos.localDataOwner', 'user-a')
    await clearLocalData()
    expect(localStorage.getItem('pharnos.localDataOwner')).toBe('user-a')
  })

  it('déconnexion (preserveNotifReads) : CONSERVE le marqueur de lecture de la cloche, vide le reste', async () => {
    await seed()
    await db.notificationReads.put({
      id: 'recu',
      lastSeenAt: '2026-07-04T00:00:00.000Z',
      seenIds: ['doc:1'],
    })

    await clearLocalData({ preserveNotifReads: true })

    // La cloche garde ses acquittements (re-login même compte ne rejoue pas en « non lu »)…
    expect(await db.notificationReads.count()).toBe(1)
    // … mais toutes les autres tables de données sont bien vidées.
    expect(await db.dossiers.count()).toBe(0)
    expect(await db.lifecycleEvents.count()).toBe(0)
  })

  it('déconnexion par défaut (sans option) : vide AUSSI le marqueur de lecture', async () => {
    await db.notificationReads.put({ id: 'recu', lastSeenAt: 't', seenIds: [] })
    await clearLocalData()
    expect(await db.notificationReads.count()).toBe(0)
  })

  it('purgeAllLocalData (suppression de compte) retire AUSSI le marqueur de propriétaire', async () => {
    localStorage.setItem('pharnos.localDataOwner', 'user-a')
    await seed()
    await purgeAllLocalData()
    expect(localStorage.getItem('pharnos.localDataOwner')).toBeNull()
    expect(await db.dossiers.count()).toBe(0)
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

  it('ancre absente + marqueur cloche orphelin : purge le SEUL marqueur (jamais d’héritage), garde les données hors-ligne', async () => {
    // localStorage évincé indépendamment d'IndexedDB : `localDataOwner` = null mais un marqueur de
    // cloche conservé (déconnexion) subsiste. Un login ne doit pas l'exposer au nouveau compte…
    await seed()
    localStorage.removeItem('pharnos.orgId') // simule une éviction partielle de localStorage
    await db.notificationReads.put({ id: 'recu', lastSeenAt: 't', seenIds: ['doc:1'] })

    const purged = await reconcileLocalDataOwner('user-b')

    expect(purged).toBe(false) // pas un swap (prev null) → pas de purge totale
    expect(await db.notificationReads.count()).toBe(0) // marqueur orphelin purgé
    expect(await db.dossiers.count()).toBe(1) // …mais le travail hors-ligne pré-existant est conservé
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
    await db.notificationReads.put({ id: 'recu', lastSeenAt: 't', seenIds: ['doc:1'] })
    await reconcileLocalDataOwner('user-a')
    expect(await db.dossiers.count()).toBe(1)

    const purged = await reconcileLocalDataOwner('user-b')

    expect(purged).toBe(true)
    expect(localDataOwner()).toBe('user-b')
    expect(await db.dossiers.count()).toBe(0)
    expect(await db.lifecycleEvents.count()).toBe(0)
    expect(await db.products.count()).toBe(0)
    // Invariant de confidentialité : le swap purge AUSSI le marqueur de la cloche (contrairement à la
    // déconnexion) — user-b ne doit jamais hériter des acquittements de user-a.
    expect(await db.notificationReads.count()).toBe(0)
  })

  it('appels CONCURRENTS pour le MÊME nouvel utilisateur (boot getSession + onAuthStateChange) : jamais de purge', async () => {
    // Invariant de sûreté : au démarrage, Supabase déclenche getSession ET INITIAL_SESSION → 2
    // publish() concurrents pour le même uid. Aucun ne doit purger ni faire osciller le propriétaire.
    await seed()
    const [a, b] = await Promise.all([
      reconcileLocalDataOwner('user-a'),
      reconcileLocalDataOwner('user-a'),
    ])
    expect(a).toBe(false)
    expect(b).toBe(false)
    expect(localDataOwner()).toBe('user-a')
    expect(await db.dossiers.count()).toBe(1) // données du 1er login conservées
  })
})
