import { beforeEach, describe, expect, it, vi } from 'vitest'

import { db, type DossierAttachmentRecord } from '@/lib/db'
import { enqueueOutbox } from '@/lib/outbox'
import { syncDossierAttachments } from './dossier-attachments-sync'

// `uploaded: true` + `deletedAt: null` : le push ne touche PAS Storage (métadonnées seules).
const rec: DossierAttachmentRecord = {
  id: 'att-1',
  orgId: 'org-1',
  dossierId: 'd1',
  nodeNumber: '1.2',
  fileName: 'gmp.pdf',
  mimeType: 'application/pdf',
  size: 3,
  filePath: 'org-1/dossiers/d1/att-1/gmp.pdf',
  uploaded: true,
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

/** Exécute la sync en avançant les backoffs de withRetry (timers factices, IDB réelle). */
async function runSync(orgId: string): Promise<void> {
  vi.useFakeTimers({ toFake: ['setTimeout'] })
  try {
    let settled = false
    const done = syncDossierAttachments(orgId).finally(() => {
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

const enFile = () => db.outbox.where('entity').equals('dossier_attachment').count()

beforeEach(async () => {
  await db.dossierAttachments.clear()
  await db.outbox.clear()
  localStorage.clear()
  vi.clearAllMocks()
  upsertCalls.length = 0
})

describe('syncDossierAttachments — push (drainage multi-org)', () => {
  it('pousse et draine une pièce jointe de l’org active (nominal)', async () => {
    await db.dossierAttachments.add(rec)
    await enqueueOutbox('dossier_attachment', 'att-1', 'create', {})

    await runSync('org-1')

    expect(upsertCalls).toHaveLength(1)
    expect(upsertCalls[0]?.table).toBe('dossier_attachments')
    expect(await enFile()).toBe(0)
  })

  it("ne draine PAS l'op d'une AUTRE org (régression : pièce jointe jamais remontée)", async () => {
    await db.dossierAttachments.add({ ...rec, id: 'att-2', orgId: 'org-2' })
    await enqueueOutbox('dossier_attachment', 'att-2', 'create', {})

    await runSync('org-1')

    expect(upsertCalls).toHaveLength(0)
    expect(await enFile()).toBe(1)
  })

  it('draine un item orphelin (pièce locale disparue, ex. purge) sans rien pousser', async () => {
    await enqueueOutbox('dossier_attachment', 'fantome', 'create', {})

    await runSync('org-1')

    expect(upsertCalls).toHaveLength(0)
    expect(await enFile()).toBe(0)
  })
})
