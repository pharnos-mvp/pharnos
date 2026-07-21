import type { SupabaseClient } from '@supabase/supabase-js'

import { db, type AuditLogRecord } from '@/lib/db'
import { isPermanentSyncError, withRetry } from '@/lib/retry'
import { reportError } from '@/lib/sentry'
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
    // Retry borné (transitoires only) : une microcoupure ne repousse pas la sync au prochain déclencheur.
    await withRetry(() => pushAudit(supabase))
    await withRetry(() => pullAudit(supabase, orgId))
  } catch (error) {
    console.warn('[sync] audit :', error)
    reportError(error, { op: 'sync', entity: 'audit' })
  } finally {
    syncing = false
  }
}

async function pushAudit(supabase: SupabaseClient): Promise<void> {
  const items = await db.outbox.where('entity').equals('audit').toArray()
  if (items.length === 0) return
  const ids = [...new Set(items.map((i) => i.entityId))]
  const drained = new Set<string>()
  for (const id of ids) {
    const rec = await db.auditLog.get(id)
    // Orphelin (entrée locale disparue) : plus rien à pousser, ne drainerait jamais → on draine.
    if (!rec) {
      drained.add(id)
      continue
    }
    // Pousse pour TOUTES les orgs du user, pas seulement l'active : sans sélecteur d'org, une
    // entrée d'une autre org resterait en file indéfiniment. La RLS (0009) reste la barrière
    // (appartenance à l'org + actor = auth.uid()) ; seule une org à synchro coupée reste en file.
    if (!isSyncEnabled(rec.orgId)) continue
    // Append-only : on insère sans jamais écraser (ignoreDuplicates).
    const { error } = await supabase
      .from('audit_log')
      .upsert(toRow(rec), { onConflict: 'id', ignoreDuplicates: true })
    if (error) {
      if (isPermanentSyncError(error)) {
        // Rejet définitif (RLS/contrainte) : re-tenter rééchouera à l'identique → draine la file
        // (anti-boucle, sinon il bloque aussi le pull). ALCOA++ : l'entrée reste dans le journal
        // LOCAL (db.auditLog) ; remontée Sentry pour tracer toute entrée d'audit non propagée.
        reportError(error, { op: 'sync', entity: 'audit', auditId: id, permanent: true })
        drained.add(id)
        continue
      }
      throw error
    }
    drained.add(id)
  }
  await db.outbox.bulkDelete(items.filter((i) => drained.has(i.entityId)).map((i) => i.id))
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
  if (rows.length === 0) return
  // `bulkPut` idempotent (une seule transaction IDB, un seul re-render du live-query du Dashboard),
  // et non un `add`/`put` par ligne : le journal d'audit est append-only + immuable (même id ⇒ même
  // contenu). IndexedDB est partagé par origine alors que le garde `syncing` est propre à chaque
  // onglet/contexte JS → au changement de compte (re-pull après purge, 2ᵉ onglet, sync résiduelle),
  // l'ancien `add` sur une clé déjà présente levait `ConstraintError` et avortait le lot pour rien.
  // Un upsert ré-écrit à l'identique = no-op sûr, et ne masque aucune divergence : une entrée locale
  // qui n'atteint pas le serveur reste détectée côté PUSH (reportError `permanent`).
  await db.auditLog.bulkPut(rows.map(rowTo))
  // Borne le prochain pull incrémental sur le `at` le plus récent, jamais en deçà du watermark.
  const maxAt = rows.reduce((max, r) => (r.at > max ? r.at : max), since)
  localStorage.setItem(lastPullKey(orgId), maxAt)
}
