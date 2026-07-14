import { beforeEach, describe, expect, it, vi } from 'vitest'

import { db, type DocumentRecord } from '@/lib/db'
import { enqueueOutbox } from '@/lib/outbox'
import { documentToRow, rowToDocument, syncDocuments } from './documents-sync'

const rec: DocumentRecord = {
  id: 'd1',
  orgId: 'org-1',
  productId: 'prod-1',
  category: 'admin',
  docType: 'gmp',
  fileName: 'gmp.pdf',
  mimeType: 'application/pdf',
  size: 10,
  language: 'fr',
  expiryDate: '2027-01-01',
  status: 'active',
  filePath: 'org-1/prod-1/d1/gmp.pdf',
  uploaded: true,
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

/** Exécute syncDocuments en avançant les backoffs de withRetry (timers factices, IDB réelle). */
async function runSync(orgId: string): Promise<void> {
  vi.useFakeTimers({ toFake: ['setTimeout'] })
  try {
    let settled = false
    const done = syncDocuments(orgId).finally(() => {
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

/** Document en base locale + son op en file. Déjà `uploaded` et sans chemin : aucun accès Storage. */
async function enfile(patch: Partial<DocumentRecord> & { id: string }): Promise<void> {
  const full: DocumentRecord = { ...rec, uploaded: true, filePath: null, ...patch }
  await db.documents.add(full)
  await enqueueOutbox('document', full.id, 'create', full)
}

const pousses = () => upsertCalls.filter((c) => c.table === 'documents')
const enFile = () => db.outbox.where('entity').equals('document').count()

describe('documents sync mapping', () => {
  it('documentToRow → colonnes snake_case', () => {
    const row = documentToRow(rec)
    expect(row.org_id).toBe('org-1')
    expect(row.product_id).toBe('prod-1')
    expect(row.doc_type).toBe('gmp')
    expect(row.expiry_date).toBe('2027-01-01')
    expect(row.file_path).toBe('org-1/prod-1/d1/gmp.pdf')
  })

  it('rowToDocument dérive le fileName du file_path et marque uploaded', () => {
    const doc = rowToDocument(documentToRow(rec))
    expect(doc.fileName).toBe('gmp.pdf')
    expect(doc.uploaded).toBe(true)
    expect(doc.orgId).toBe('org-1')
    expect(doc.category).toBe('admin')
  })

  it('mappe issue_date / reference (pièce AMM, `0042`) en round-trip', () => {
    const amm: DocumentRecord = {
      ...rec,
      docType: 'amm',
      issueDate: '2021-03-17',
      reference: 'AMM_2015_7457',
    }
    const row = documentToRow(amm)
    expect(row.issue_date).toBe('2021-03-17')
    expect(row.reference).toBe('AMM_2015_7457')
    const back = rowToDocument(row)
    expect(back.issueDate).toBe('2021-03-17')
    expect(back.reference).toBe('AMM_2015_7457')
  })

  it('pièce sans AMM : issue_date / reference nuls côté row', () => {
    const row = documentToRow(rec)
    expect(row.issue_date).toBeNull()
    expect(row.reference).toBeNull()
  })
})

describe('syncDocuments — push', () => {
  beforeEach(async () => {
    await db.documents.clear()
    await db.outbox.clear()
    localStorage.clear()
    vi.clearAllMocks()
    upsertCalls.length = 0
  })

  it('pousse et draine un document dont le produit est déjà en base (nominal)', async () => {
    await enfile({ id: 'd1' })

    await runSync('org-1')

    expect(pousses()).toHaveLength(1)
    expect(pousses()[0]?.row.id).toBe('d1')
    expect(await enFile()).toBe(0)
  })

  it('RETIENT le document tant que son PRODUIT est en file (FK documents.product_id → products)', async () => {
    await enfile({ id: 'd1', productId: 'prod-1' })
    await enqueueOutbox('product', 'prod-1', 'create', {})

    await runSync('org-1')

    // Ni upsert de métadonnées, ni upload Storage pour un parent absent : on attend le cycle suivant.
    expect(pousses()).toHaveLength(0)
    expect(await enFile()).toBe(1)
  })

  it("ne draine PAS l'op d'une AUTRE org (régression : écriture perdue en silence)", async () => {
    // Membre multi-orgs (CS1) : un bulkDelete global supprimait l'op d'org-2 pendant le cycle
    // d'org-1 SANS l'avoir poussée — le document ne remontait jamais au serveur.
    await enfile({ id: 'd2', orgId: 'org-2' })

    await runSync('org-1')

    expect(pousses()).toHaveLength(0)
    expect(await enFile()).toBe(1)
  })
})
