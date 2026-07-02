import { beforeEach, describe, expect, it, vi } from 'vitest'

import { recordAudit, setAuditActor } from '@/lib/audit'
import { db } from '@/lib/db'
import { enqueueOutbox } from '@/lib/outbox'
import { reportError } from '@/lib/sentry'
import { setSyncEnabledCache } from '@/lib/sync-prefs'
import { syncAudit } from './audit-sync'

// --- Mock Supabase : upsert (push) configurable + chaîne select (pull) vide ---
interface UpsertCall {
  table: string
  row: Record<string, unknown>
  options: Record<string, unknown>
}
const upsertCalls: UpsertCall[] = []
let upsertResult: { error: unknown } = { error: null }
let pullCount = 0

const supabaseMock = {
  from: (table: string) => ({
    upsert: (row: Record<string, unknown>, options: Record<string, unknown>) => {
      upsertCalls.push({ table, row, options })
      return Promise.resolve(upsertResult)
    },
    select: () => {
      pullCount++
      return {
        eq: () => ({
          gt: () => ({
            order: () => ({ limit: () => Promise.resolve({ data: [], error: null }) }),
          }),
        }),
      }
    },
  }),
}

vi.mock('@/lib/supabase', () => ({ getSupabase: vi.fn(async () => supabaseMock) }))
vi.mock('@/lib/sentry', () => ({ reportError: vi.fn() }))

/** Exécute syncAudit en avançant les backoffs de withRetry (timers factices, IDB réelle). */
async function runSync(orgId: string): Promise<void> {
  vi.useFakeTimers({ toFake: ['setTimeout'] })
  try {
    let settled = false
    const done = syncAudit(orgId).finally(() => {
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

beforeEach(async () => {
  await db.auditLog.clear()
  await db.outbox.clear()
  localStorage.clear()
  vi.clearAllMocks()
  upsertCalls.length = 0
  upsertResult = { error: null }
  pullCount = 0
  setAuditActor({ id: 'u1', email: 'ra@labo.com' })
})

describe('syncAudit — drainage de la file (anti-accumulation)', () => {
  it("pousse puis draine une entrée de l'org active (nominal)", async () => {
    await recordAudit('org-1', 'product', 'p1', 'create', 'Doliprane')

    await runSync('org-1')

    expect(upsertCalls).toHaveLength(1)
    expect(upsertCalls[0]?.table).toBe('audit_log')
    expect(upsertCalls[0]?.row.org_id).toBe('org-1')
    expect(upsertCalls[0]?.row.actor_id).toBe('u1')
    // Append-only : jamais d'écrasement.
    expect(upsertCalls[0]?.options).toEqual({ onConflict: 'id', ignoreDuplicates: true })
    expect(await db.outbox.count()).toBe(0)
    // Le journal local reste intact (seule la file est drainée).
    expect(await db.auditLog.count()).toBe(1)
  })

  it("pousse et draine une entrée d'une AUTRE org (régression : items coincés 10 jours)", async () => {
    // Entrée enregistrée sous org-2 (multi-appartenance) alors que la sync tourne pour org-1 :
    // avant le fix, elle restait en file indéfiniment (aucun sélecteur d'org pour la drainer).
    await recordAudit('org-2', 'dossier', 'd1', 'update', 'Statut')

    await runSync('org-1')

    expect(upsertCalls).toHaveLength(1)
    expect(upsertCalls[0]?.row.org_id).toBe('org-2')
    expect(await db.outbox.count()).toBe(0)
  })

  it('draine un item orphelin (entrée locale disparue) sans rien pousser', async () => {
    await enqueueOutbox('audit', 'ghost-id', 'create', {})

    await runSync('org-1')

    expect(upsertCalls).toHaveLength(0)
    expect(await db.outbox.count()).toBe(0)
  })

  it("laisse en file l'entrée d'une org à synchro explicitement coupée", async () => {
    await recordAudit('org-2', 'product', 'p1', 'create', 'X')
    setSyncEnabledCache('org-2', false)

    await runSync('org-1')

    expect(upsertCalls).toHaveLength(0)
    expect(await db.outbox.count()).toBe(1)
  })
})

describe('syncAudit — anti-boucle sur rejet permanent (RLS/contrainte)', () => {
  it('draine la file, PRÉSERVE le journal local (ALCOA++) et remonte à Sentry', async () => {
    await recordAudit('org-1', 'product', 'p1', 'create', 'Doliprane')
    upsertResult = { error: { code: '42501', message: 'row-level security' } }

    await runSync('org-1')

    // Anti-boucle : l'item ne reste pas en file à rééchouer à l'identique…
    expect(await db.outbox.count()).toBe(0)
    // …mais l'entrée d'audit locale n'est JAMAIS perdue…
    expect(await db.auditLog.count()).toBe(1)
    // …et la non-propagation laisse une trace (observabilité ALCOA++).
    expect(reportError).toHaveBeenCalledWith(
      expect.objectContaining({ code: '42501' }),
      expect.objectContaining({ entity: 'audit', permanent: true }),
    )
    // Le rejet permanent ne bloque plus le pull du journal.
    expect(pullCount).toBe(1)
  })

  it('conserve en file sur erreur TRANSITOIRE (503) — aucune perte, retenté au prochain cycle', async () => {
    await recordAudit('org-1', 'product', 'p1', 'create', 'Doliprane')
    upsertResult = { error: { status: 503 } }

    await runSync('org-1')

    expect(await db.outbox.count()).toBe(1)
    expect(await db.auditLog.count()).toBe(1)
    // withRetry a borné les tentatives (3) puis rendu la main sans drainer.
    expect(upsertCalls.length).toBe(3)
  })
})
