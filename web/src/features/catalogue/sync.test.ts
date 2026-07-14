import { beforeEach, describe, expect, it, vi } from 'vitest'

import { db, type ProductRecord } from '@/lib/db'
import { enqueueOutbox } from '@/lib/outbox'
import { productToRow, rowToProduct, syncProducts } from './sync'

const rec: ProductRecord = {
  id: 'p1',
  orgId: 'org-1',
  nomCommercial: 'Doliprane',
  dci: 'Paracétamol',
  dosage: '500 mg',
  forme: 'Comprimé',
  presentation: 'Boîte de 16',
  classeTherapeutique: 'Antalgique',
  codeAtc: 'N02BE01',
  titulaire: 'Laboratoire X',
  titulaireAdresse: '12 rue de la Santé, Cotonou',
  fabricant: 'Usine Y',
  fabricantAdresse: 'Zone industrielle, Casablanca',
  titulaireId: 'party-titulaire-1',
  fabricantId: 'party-fabricant-1',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-02T00:00:00.000Z',
  deletedAt: null,
}

// --- Mock Supabase : upsert (push) tracé + chaîne select (pull) vide ---
const upsertCalls: { table: string; row: Record<string, unknown> }[] = []

const supabaseMock = {
  from: (table: string) => ({
    upsert: (row: Record<string, unknown>) => {
      upsertCalls.push({ table, row })
      return Promise.resolve({ error: null })
    },
    select: () => ({
      eq: () => ({ gt: () => ({ order: () => Promise.resolve({ data: [], error: null }) }) }),
    }),
  }),
}

vi.mock('@/lib/supabase', () => ({ getSupabase: vi.fn(async () => supabaseMock) }))
vi.mock('@/lib/sentry', () => ({ reportError: vi.fn() }))

/** Exécute syncProducts en avançant les backoffs de withRetry (timers factices, IDB réelle). */
async function runSync(orgId: string): Promise<void> {
  vi.useFakeTimers({ toFake: ['setTimeout'] })
  try {
    let settled = false
    const done = syncProducts(orgId).finally(() => {
      settled = true
    })
    while (!settled) {
      // setImmediate RÉEL : laisse fake-indexeddb progresser entre deux avances d'horloge.
      await new Promise((r) => setImmediate(r))
      await vi.advanceTimersByTimeAsync(5000)
    }
    await done
  } finally {
    vi.useRealTimers()
  }
}

/** Produit en base locale + son op en file, comme après une mutation. */
async function enfile(patch: Partial<ProductRecord> & { id: string }): Promise<void> {
  const full: ProductRecord = { ...rec, ...patch }
  await db.products.add(full)
  await enqueueOutbox('product', full.id, 'create', full)
}

const pousses = () => upsertCalls.filter((c) => c.table === 'products')
const enFile = () => db.outbox.where('entity').equals('product').count()

describe('sync mapping produits', () => {
  it('round-trip ProductRecord <-> ProductRow', () => {
    expect(rowToProduct(productToRow(rec))).toEqual(rec)
  })

  it('mappe correctement les colonnes snake_case', () => {
    const row = productToRow(rec)
    expect(row.org_id).toBe('org-1')
    expect(row.nom_commercial).toBe('Doliprane')
    expect(row.classe_therapeutique).toBe('Antalgique')
    expect(row.code_atc).toBe('N02BE01')
  })
})

describe('syncProducts — push', () => {
  beforeEach(async () => {
    await db.products.clear()
    await db.outbox.clear()
    localStorage.clear()
    vi.clearAllMocks()
    upsertCalls.length = 0
  })

  it('pousse et draine un produit dont les parties sont déjà en base (nominal)', async () => {
    await enfile({ id: 'p1' })

    await runSync('org-1')

    expect(pousses()).toHaveLength(1)
    expect(pousses()[0]?.row.id).toBe('p1')
    expect(await enFile()).toBe(0)
  })

  it('RETIENT le produit tant que son TITULAIRE est en file (régression 23503, Sentry JAVASCRIPT-REACT-9)', async () => {
    // `createProduct` dérive les parties du texte libre : elles sont en file AVEC le produit. Poussé
    // seul, le produit violait products_titulaire_id_fkey (« Key is not present in table parties »).
    await enfile({ id: 'p1', titulaireId: 'party-1', fabricantId: null })
    await enqueueOutbox('party', 'party-1', 'create', {})

    await runSync('org-1')

    expect(pousses()).toHaveLength(0)
    // Conservé, jamais drainé en silence : repris au cycle suivant, une fois la partie en base.
    expect(await enFile()).toBe(1)
  })

  it('RETIENT le produit tant que son FABRICANT est en file', async () => {
    await enfile({ id: 'p1', titulaireId: null, fabricantId: 'party-2' })
    await enqueueOutbox('party', 'party-2', 'create', {})

    await runSync('org-1')

    expect(pousses()).toHaveLength(0)
    expect(await enFile()).toBe(1)
  })

  it("ne draine PAS l'op d'une AUTRE org (régression : écriture perdue en silence)", async () => {
    // Membre multi-orgs (CS1) : un bulkDelete global supprimait l'op d'org-2 pendant le cycle
    // d'org-1 SANS l'avoir poussée — le produit ne remontait jamais au serveur.
    await enfile({ id: 'p2', orgId: 'org-2' })

    await runSync('org-1')

    expect(pousses()).toHaveLength(0)
    expect(await enFile()).toBe(1)
  })

  it('draine un item orphelin (produit local disparu) sans rien pousser', async () => {
    await enqueueOutbox('product', 'fantome', 'create', {})

    await runSync('org-1')

    expect(pousses()).toHaveLength(0)
    expect(await db.outbox.count()).toBe(0)
  })
})
