import type { SupabaseClient } from '@supabase/supabase-js'

import { db, type AuditLogRecord } from '@/lib/db'
import { getSupabase } from '@/lib/supabase'
import { isSyncEnabled } from '@/lib/sync-prefs'

interface AuditRow {
  id: string
  org_id: string
  actor_id: string
  actor_email: string
  entity: string
  entity_id: string
  action: string
  label: string
  at: string
}

function toRow(a: AuditLogRecord): AuditRow {
  return {
    id: a.id,
    org_id: a.orgId,
    actor_id: a.actorId,
    actor_email: a.actorEmail,
    entity: a.entity,
    entity_id: a.entityId,
    action: a.action,
    label: a.label,
    at: a.at,
  }
}

function rowTo(r: AuditRow): AuditLogRecord {
  return {
    id: r.id,
    orgId: r.org_id,
    actorId: r.actor_id,
    actorEmail: r.actor_email,
    entity: r.entity,
    entityId: r.entity_id,
    action: r.action,
    label: r.label,
    at: r.at,
  }
}

const lastPullKey = (orgId: string) => `pharnos.lastPull.audit.${orgId}`
let syncing = false

/** Réconcilie le journal d'audit (append-only). No-op hors-ligne / Supabase non configuré. */
export async function syncAudit(orgId: string): Promise<void> {
  if (syncing || !navigator.onLine || !isSyncEnabled(orgId)) return
  const supabase = await getSupabase()
  if (!supabase) return
  syncing = true
  try {
    await pushAudit(supabase, orgId)
    await pullAudit(supabase, orgId)
  } catch (error) {
    console.warn('[sync] audit :', error)
  } finally {
    syncing = false
  }
}

async function pushAudit(supabase: SupabaseClient, orgId: string): Promise<void> {
  const items = await db.outbox.where('entity').equals('audit').toArray()
  if (items.length === 0) return
  const ids = [...new Set(items.map((i) => i.entityId))]
  const pushed = new Set<string>()
  for (const id of ids) {
    const rec = await db.auditLog.get(id)
    if (!rec || rec.orgId !== orgId) continue
    // Append-only : on insère sans jamais écraser (ignoreDuplicates).
    const { error } = await supabase
      .from('audit_log')
      .upsert(toRow(rec), { onConflict: 'id', ignoreDuplicates: true })
    if (error) throw error
    pushed.add(id)
  }
  // Ne supprime QUE les entrées effectivement poussées (les autres org restent en file).
  await db.outbox.bulkDelete(items.filter((i) => pushed.has(i.entityId)).map((i) => i.id))
}

async function pullAudit(supabase: SupabaseClient, orgId: string): Promise<void> {
  const since = localStorage.getItem(lastPullKey(orgId)) ?? '1970-01-01T00:00:00.000Z'
  const { data, error } = await supabase
    .from('audit_log')
    .select('*')
    .eq('org_id', orgId)
    .gt('at', since)
    .order('at', { ascending: true })
    .limit(500)
  if (error) throw error

  const rows = (data ?? []) as unknown as AuditRow[]
  let maxAt = since
  for (const row of rows) {
    const incoming = rowTo(row)
    const local = await db.auditLog.get(incoming.id)
    if (!local) await db.auditLog.add(incoming)
    if (incoming.at > maxAt) maxAt = incoming.at
  }
  if (rows.length > 0) localStorage.setItem(lastPullKey(orgId), maxAt)
}
