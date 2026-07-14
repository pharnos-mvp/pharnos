import { beforeEach, describe, expect, it, vi } from 'vitest'

import { db, type GeneratedDocRecord } from '@/lib/db'
import { enqueueOutbox } from '@/lib/outbox'
import { syncGeneratedDocs } from './generated-docs-sync'

const rec: GeneratedDocRecord = {
  id: 'g1',
  orgId: 'org-1',
  dossierId: 'd1',
  nodeNumber: '1.2.1',
  templateKey: 'cover',
  title: 'Lettre de couverture',
  content: { type: 'doc' },
  status: 'draft',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-02T00:00:00.000Z',
  deletedAt: null,
}

// --- Mock Supabase : upsert (push) tracé + chaîne select (pull) vide, quel que soit son shape ---
const upsertCalls: { table: string; row: Record<string, unknown> }[] = []

interface SelectChain {
  eq: () => SelectChain
  gt: () => SelectChain
  or: () => SelectChain
  order: () => SelectChain
  limit: () => SelectChain
  then: (onfulfilled: (value: { data: unknown[]; error: null }) => unknown) => Promise<unknown>
}
function selectChain(): SelectChain {
  const chain: SelectChain = {
    eq: () => chain,
    gt: () => chain,
    or: () => chain,
    order: () => chain,
    limit: () => chain,
    then: (onfulfilled) => Promise.resolve({ data: [], error: null }).then(onfulfilled),
  }
  return chain
}

const supabaseMock = {
  from: (table: string) => ({
    upsert: (row: Record<string, unknown>) => {
      upsertCalls.push({ table, row })
      return Promise.resolve({ error: null })
    },
    select: () => selectChain(),
  }),
}

vi.mock('@/lib/supabase', () => ({ getSupabase: vi.fn(async () => supabaseMock) }))
vi.mock('@/lib/sentry', () => ({ reportError: vi.fn() }))

/** Exécute syncGeneratedDocs en avançant les backoffs de withRetry (timers factices, IDB réelle). */
async function runSync(orgId: string): Promise<void> {
  vi.useFakeTimers({ toFake: ['setTimeout'] })
  try {
    let settled = false
    const done = syncGeneratedDocs(orgId).finally(() => {
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

const enFile = () => db.outbox.where('entity').equals('generated_doc').count()

beforeEach(async () => {
  await db.generatedDocs.clear()
  await db.outbox.clear()
  localStorage.clear()
  vi.clearAllMocks()
  upsertCalls.length = 0
})

describe('syncGeneratedDocs — push (drainage multi-org)', () => {
  it('pousse et draine un document généré de l’org active (nominal)', async () => {
    await db.generatedDocs.add(rec)
    await enqueueOutbox('generated_doc', 'g1', 'create', {})

    await runSync('org-1')

    expect(upsertCalls).toHaveLength(1)
    expect(upsertCalls[0]?.table).toBe('generated_docs')
    expect(await enFile()).toBe(0)
  })

  it("ne draine PAS l'op d'une AUTRE org (régression : écriture perdue en silence)", async () => {
    // Membre multi-orgs (CS1) : un bulkDelete global supprimait l'op d'org-2 pendant le cycle
    // d'org-1 SANS l'avoir poussée — le document généré ne remontait jamais au serveur.
    await db.generatedDocs.add({ ...rec, id: 'g2', orgId: 'org-2' })
    await enqueueOutbox('generated_doc', 'g2', 'create', {})

    await runSync('org-1')

    expect(upsertCalls).toHaveLength(0)
    expect(await enFile()).toBe(1)
  })

  it('draine un item orphelin (document local disparu, ex. purge) sans rien pousser', async () => {
    await enqueueOutbox('generated_doc', 'fantome', 'create', {})

    await runSync('org-1')

    expect(upsertCalls).toHaveLength(0)
    expect(await enFile()).toBe(0)
  })
})
