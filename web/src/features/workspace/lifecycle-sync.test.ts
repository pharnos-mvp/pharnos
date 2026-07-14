import { beforeEach, describe, expect, it, vi } from 'vitest'

import { db, type LifecycleEventRecord } from '@/lib/db'
import { enqueueOutbox } from '@/lib/outbox'
import { syncLifecycle } from './lifecycle-sync'

const rec: LifecycleEventRecord = {
  id: '9e107d9d-2d3a-4b8e-8f5e-000000000001',
  orgId: 'org-1',
  dossierId: 'd1',
  type: 'submitted' as LifecycleEventRecord['type'],
  actorId: 'u1',
  actorEmail: 'ra@labo.com',
  occurredAt: '2026-01-01T00:00:00.000Z',
  payload: {},
  docRefs: [],
  createdAt: '2026-01-01T00:00:00.000Z',
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

/** Exécute la sync en avançant les backoffs de withRetry (timers factices, IDB réelle). */
async function runSync(orgId: string): Promise<void> {
  vi.useFakeTimers({ toFake: ['setTimeout'] })
  try {
    let settled = false
    const done = syncLifecycle(orgId).finally(() => {
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

const enFile = () => db.outbox.where('entity').equals('lifecycle_event').count()

beforeEach(async () => {
  await db.lifecycleEvents.clear()
  await db.outbox.clear()
  localStorage.clear()
  vi.clearAllMocks()
  upsertCalls.length = 0
})

describe('syncLifecycle — push (drainage multi-org)', () => {
  it('pousse et draine un événement de l’org active (nominal, append-only)', async () => {
    await db.lifecycleEvents.add(rec)
    await enqueueOutbox('lifecycle_event', rec.id, 'create', {})

    await runSync('org-1')

    expect(upsertCalls).toHaveLength(1)
    expect(upsertCalls[0]?.table).toBe('lifecycle_events')
    expect(await enFile()).toBe(0)
  })

  it("ne draine PAS l'op d'une AUTRE org (multi-org : conservée pour son propre cycle)", async () => {
    await db.lifecycleEvents.add({
      ...rec,
      id: '9e107d9d-2d3a-4b8e-8f5e-000000000002',
      orgId: 'org-2',
    })
    await enqueueOutbox('lifecycle_event', '9e107d9d-2d3a-4b8e-8f5e-000000000002', 'create', {})

    await runSync('org-1')

    expect(upsertCalls).toHaveLength(0)
    expect(await enFile()).toBe(1)
  })

  it('draine un item orphelin (événement local disparu, ex. purge) — fin de la fuite en file', async () => {
    // Avant le fix, un `!rec` était sauté SANS être drainé : l'item restait en file pour toujours.
    await enqueueOutbox('lifecycle_event', 'fantome', 'create', {})

    await runSync('org-1')

    expect(upsertCalls).toHaveLength(0)
    expect(await enFile()).toBe(0)
  })
})
