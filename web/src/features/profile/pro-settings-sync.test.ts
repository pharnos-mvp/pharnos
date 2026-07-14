import { beforeEach, describe, expect, it, vi } from 'vitest'

import { db, type ProSettingRecord } from '@/lib/db'
import { enqueueOutbox } from '@/lib/outbox'
import { syncProSettings } from './pro-settings-sync'

const rec: ProSettingRecord = {
  id: 'org-branding-1',
  orgId: 'org-1',
  kind: 'orgBranding',
  entreprise: 'Labo X',
  poste: 'Responsable AR',
  signataire: 'A. Dupont',
  pays: 'CI',
  headerImage: null,
  footerImage: null,
  logoImage: null,
  signatureImage: null,
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

/** Exécute la sync en avançant les backoffs de withRetry (timers factices, IDB réelle). */
async function runSync(orgId: string): Promise<void> {
  vi.useFakeTimers({ toFake: ['setTimeout'] })
  try {
    let settled = false
    const done = syncProSettings(orgId).finally(() => {
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

const enFile = () => db.outbox.where('entity').equals('pro_setting').count()

beforeEach(async () => {
  await db.proSettings.clear()
  await db.outbox.clear()
  localStorage.clear()
  vi.clearAllMocks()
  upsertCalls.length = 0
})

describe('syncProSettings — push (drainage multi-org)', () => {
  it('pousse et draine un réglage de l’org active (nominal)', async () => {
    await db.proSettings.add(rec)
    await enqueueOutbox('pro_setting', 'org-branding-1', 'create', {})

    await runSync('org-1')

    expect(upsertCalls).toHaveLength(1)
    expect(upsertCalls[0]?.table).toBe('pro_settings')
    expect(await enFile()).toBe(0)
  })

  it("ne draine PAS l'op d'une AUTRE org (régression : branding/signature jamais remontés)", async () => {
    await db.proSettings.add({ ...rec, id: 'org-branding-2', orgId: 'org-2' })
    await enqueueOutbox('pro_setting', 'org-branding-2', 'create', {})

    await runSync('org-1')

    expect(upsertCalls).toHaveLength(0)
    expect(await enFile()).toBe(1)
  })

  it('draine un item orphelin (réglage local disparu) sans rien pousser', async () => {
    await enqueueOutbox('pro_setting', 'fantome', 'create', {})

    await runSync('org-1')

    expect(upsertCalls).toHaveLength(0)
    expect(await enFile()).toBe(0)
  })
})
