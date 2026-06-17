import type { SupabaseClient } from '@supabase/supabase-js'

import { db, type DossierRecord } from '@/lib/db'
import { isPermanentSyncError, withRetry } from '@/lib/retry'
import { reportError } from '@/lib/sentry'
import { getSupabase } from '@/lib/supabase'
import type { CtdNodeDef, DossierFormat } from './module1-tree'

export interface DossierRow {
  id: string
  org_id: string
  product_id: string | null
  product_name: string
  format: string
  activity: string
  country: string
  status: string
  tree: CtdNodeDef[]
  excluded_doc_ids: string[]
  created_at: string
  updated_at: string
  deleted_at: string | null
  archived_at: string | null
}

export function dossierToRow(d: DossierRecord): DossierRow {
  return {
    id: d.id,
    org_id: d.orgId,
    product_id: d.productId,
    product_name: d.productName,
    format: d.format,
    activity: d.activity,
    country: d.country,
    status: d.status,
    tree: d.tree,
    excluded_doc_ids: d.excludedDocIds ?? [],
    created_at: d.createdAt,
    updated_at: d.updatedAt,
    deleted_at: d.deletedAt,
    archived_at: d.archivedAt ?? null,
  }
}

export function rowToDossier(r: DossierRow): DossierRecord {
  return {
    id: r.id,
    orgId: r.org_id,
    productId: r.product_id ?? '',
    productName: r.product_name,
    format: r.format as DossierFormat,
    activity: r.activity,
    country: r.country,
    status: r.status,
    tree: (r.tree ?? []) as CtdNodeDef[],
    excludedDocIds: (r.excluded_doc_ids ?? []) as string[],
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    deletedAt: r.deleted_at,
    archivedAt: r.archived_at ?? null,
  }
}

const lastPullKey = (orgId: string) => `pharnos.lastPull.dossiers.${orgId}`
let syncing = false

/** Réconcilie les dossiers (Dexie ⇄ Postgres). No-op hors-ligne / Supabase non configuré. */
export async function syncDossiers(orgId: string): Promise<void> {
  if (syncing || !navigator.onLine) return
  const supabase = await getSupabase()
  if (!supabase) return
  syncing = true
  try {
    // Retry borné (transitoires only) : une microcoupure ne repousse pas la sync au prochain déclencheur.
    await withRetry(() => pushDossiers(supabase, orgId))
    await withRetry(() => pullDossiers(supabase, orgId))
  } catch (error) {
    console.warn('[sync] dossiers :', error)
    reportError(error, { op: 'sync', entity: 'dossiers' })
  } finally {
    syncing = false
  }
}

async function pushDossiers(supabase: SupabaseClient, orgId: string): Promise<void> {
  const items = await db.outbox.where('entity').equals('dossier').toArray()
  if (items.length === 0) return
  const ids = [...new Set(items.map((i) => i.entityId))]
  for (const id of ids) {
    const rec = await db.dossiers.get(id)
    if (!rec || rec.orgId !== orgId) continue
    const { error } = await supabase.from('dossiers').upsert(dossierToRow(rec))
    if (error) {
      if (isPermanentSyncError(error)) continue // rejet permanent : drainé par le bulkDelete final (anti-boucle/Sentry)
      throw error
    }
  }
  await db.outbox.bulkDelete(items.map((i) => i.id))
}

async function pullDossiers(supabase: SupabaseClient, orgId: string): Promise<void> {
  const since = localStorage.getItem(lastPullKey(orgId)) ?? '1970-01-01T00:00:00.000Z'
  const { data, error } = await supabase
    .from('dossiers')
    .select('*')
    .eq('org_id', orgId)
    .gt('updated_at', since)
    .order('updated_at', { ascending: true })
  if (error) throw error

  const rows = (data ?? []) as unknown as DossierRow[]
  let maxUpdated = since
  for (const row of rows) {
    const incoming = rowToDossier(row)
    const local = await db.dossiers.get(incoming.id)
    if (!local || incoming.updatedAt >= local.updatedAt) {
      await db.dossiers.put(incoming)
    }
    if (incoming.updatedAt > maxUpdated) maxUpdated = incoming.updatedAt
  }
  if (rows.length > 0) localStorage.setItem(lastPullKey(orgId), maxUpdated)
}
