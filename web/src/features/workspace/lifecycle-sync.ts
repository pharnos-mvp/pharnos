import type { SupabaseClient } from '@supabase/supabase-js'

import { db, type LifecycleEventRecord, type LifecycleEventType } from '@/lib/db'
import { withRetry } from '@/lib/retry'
import { isSyncEnabled } from '@/lib/sync-prefs'
import { reportError } from '@/lib/sentry'
import { getSupabase } from '@/lib/supabase'

/**
 * Sync « cycle de vie » (jalon M0) — journal `lifecycle_events` APPEND-ONLY : push outbox (toujours
 * `create`, upsert idempotent `ignoreDuplicates`) + pull incrémental paginé par `created_at`. Source
 * de vérité = le pull ; AUCUN LWW (lignes immuables). Calque de l'append-only `correspondence-sync`.
 */

export interface LifecycleEventRow {
  id: string
  org_id: string
  dossier_id: string
  type: string
  actor_id: string
  actor_email: string
  occurred_at: string
  payload: Record<string, unknown>
  doc_refs: { path: string; name: string; size: number; mime: string }[]
  created_at: string
}

export function eventToRow(e: LifecycleEventRecord): LifecycleEventRow {
  return {
    id: e.id,
    org_id: e.orgId,
    dossier_id: e.dossierId,
    type: e.type,
    actor_id: e.actorId,
    actor_email: e.actorEmail,
    occurred_at: e.occurredAt,
    payload: e.payload,
    doc_refs: e.docRefs,
    created_at: e.createdAt,
  }
}

export function rowToEvent(r: LifecycleEventRow): LifecycleEventRecord {
  return {
    id: r.id,
    orgId: r.org_id,
    dossierId: r.dossier_id,
    type: r.type as LifecycleEventType,
    actorId: r.actor_id,
    actorEmail: r.actor_email ?? '',
    occurredAt: r.occurred_at,
    payload: (r.payload ?? {}) as Record<string, unknown>,
    docRefs: (r.doc_refs ?? []) as LifecycleEventRecord['docRefs'],
    createdAt: r.created_at,
  }
}

const lastPullKey = (orgId: string) => `pharnos.lastPull.lifecycleEvents.${orgId}`
const PAGE = 500
let syncing = false

/**
 * Curseur de pagination COMPOSITE `ts|id` (cf. `correspondence-sync`) : un curseur sur timestamp seul
 * boucle si ≥ PAGE lignes partagent le même horodatage (inserts en rafale) ; le tie-break par id rend
 * la progression strictement monotone. Rétro-compatible : un ancien curseur ISO pur = id vide.
 */
const EPOCH = '1970-01-01T00:00:00.000Z'
const TS_RE = /^[0-9T:.+-]+Z?$/
const ID_RE = /^[0-9a-fA-F-]*$/

function parseCursor(raw: string | null): { ts: string; id: string } {
  if (!raw) return { ts: EPOCH, id: '' }
  const i = raw.indexOf('|')
  const ts = i === -1 ? raw : raw.slice(0, i)
  const id = i === -1 ? '' : raw.slice(i + 1)
  return TS_RE.test(ts) && ID_RE.test(id) ? { ts, id } : { ts: EPOCH, id: '' }
}

const afterCursor = (column: string, c: { ts: string; id: string }) =>
  `${column}.gt.${c.ts},and(${column}.eq.${c.ts},id.gt.${c.id || '00000000-0000-0000-0000-000000000000'})`

/** Réconcilie le journal du cycle de vie (Dexie ⇄ Postgres). No-op hors-ligne. */
export async function syncLifecycle(orgId: string): Promise<void> {
  if (syncing || !navigator.onLine || !isSyncEnabled(orgId)) return
  const supabase = await getSupabase()
  if (!supabase) return
  syncing = true
  try {
    await withRetry(() => pushLifecycleEvents(supabase, orgId))
    await withRetry(() => pullLifecycleEvents(supabase, orgId))
  } catch (error) {
    console.warn('[sync] lifecycle :', error)
    reportError(error, { op: 'sync', entity: 'lifecycle_events' })
  } finally {
    syncing = false
  }
}

async function pushLifecycleEvents(supabase: SupabaseClient, orgId: string): Promise<void> {
  const items = await db.outbox.where('entity').equals('lifecycle_event').toArray()
  if (items.length === 0) return
  const pushed: string[] = []
  for (const item of items.sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
    const rec = await db.lifecycleEvents.get(item.entityId)
    if (!rec || rec.orgId !== orgId) continue // file d'une autre org : conservée (multi-org)
    // Append-only : insert idempotent (ON CONFLICT DO NOTHING — pas de policy UPDATE, par design).
    const { error } = await supabase
      .from('lifecycle_events')
      .upsert(eventToRow(rec), { ignoreDuplicates: true })
    if (error) throw error
    pushed.push(item.id)
  }
  if (pushed.length > 0) await db.outbox.bulkDelete(pushed)
}

async function pullLifecycleEvents(supabase: SupabaseClient, orgId: string): Promise<void> {
  let cursor = parseCursor(localStorage.getItem(lastPullKey(orgId)))
  for (;;) {
    const { data, error } = await supabase
      .from('lifecycle_events')
      .select('*')
      .eq('org_id', orgId)
      .or(afterCursor('created_at', cursor))
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .limit(PAGE)
    if (error) throw error
    const rows = (data ?? []) as unknown as LifecycleEventRow[]
    const last = rows.at(-1)
    if (!last) break
    // Append-only : put = idempotent (local et serveur portent le même contenu immuable).
    await db.lifecycleEvents.bulkPut(rows.map(rowToEvent))
    cursor = { ts: last.created_at, id: last.id }
    localStorage.setItem(lastPullKey(orgId), `${cursor.ts}|${cursor.id}`)
    if (rows.length < PAGE) break
  }
}
