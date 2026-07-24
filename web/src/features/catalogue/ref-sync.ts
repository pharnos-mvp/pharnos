import type { SupabaseClient } from '@supabase/supabase-js'

import { db, type RefEntryRecord, type RefVersionRecord } from '@/lib/db'
import { withRetry } from '@/lib/retry'
import { isSyncEnabled } from '@/lib/sync-prefs'
import { reportError } from '@/lib/sentry'
import { getSupabase } from '@/lib/supabase'

/** Ligne Postgres (snake_case) de `ref_versions` (migration 0071). */
export interface RefVersionRow {
  id: string
  label: string
  status: string
  effective_date: string | null
  release_note: string
  published_at: string | null
  created_at: string
}

/** Ligne Postgres (snake_case) de `ref_entries`. */
export interface RefEntryRow {
  id: string
  version_id: string
  country: string
  section: string
  payload: unknown
  provenance: unknown
  created_at: string
}

export function rowToRefVersion(r: RefVersionRow): RefVersionRecord {
  return {
    id: r.id,
    label: r.label,
    status: r.status,
    effectiveDate: r.effective_date,
    releaseNote: r.release_note ?? '',
    publishedAt: r.published_at,
    createdAt: r.created_at,
  }
}

export function rowToRefEntry(r: RefEntryRow): RefEntryRecord {
  return {
    id: r.id,
    versionId: r.version_id,
    country: r.country,
    section: r.section,
    payload: r.payload,
    provenance: r.provenance ?? {},
    createdAt: r.created_at,
  }
}

let syncing = false

/**
 * Réplique locale du référentiel réglementaire versionné — PULL SEUL (le client ne peut rien
 * écrire : aucune policy insert/update, publication réservée au God dashboard/service role).
 * No-op hors-ligne / Supabase absent (mode local/tests) / synchro désactivée pour l'org.
 */
export async function syncRefContent(orgId: string): Promise<void> {
  if (syncing || !navigator.onLine || !isSyncEnabled(orgId)) return
  const supabase = await getSupabase()
  if (!supabase) return
  syncing = true
  try {
    await withRetry(() => pullRefContent(supabase))
  } catch (error) {
    console.warn('[sync] référentiel :', error)
    reportError(error, { op: 'sync', entity: 'ref' })
  } finally {
    syncing = false
  }
}

/**
 * Remplacement ATOMIQUE des deux tables : le contenu est global et minuscule (quelques dizaines
 * de lignes), pas de curseur incrémental — une version dépubliée/archivée côté serveur disparaît
 * aussi localement au cycle suivant. Idempotent (`bulkPut`) ; hors-ligne, la réplique reste
 * intacte et le résolveur (`ref-content`) garde son repli sur le socle code.
 */
export async function pullRefContent(supabase: SupabaseClient): Promise<void> {
  const [vRes, eRes] = await Promise.all([
    supabase.from('ref_versions').select('*'),
    supabase.from('ref_entries').select('*'),
  ])
  if (vRes.error) throw vRes.error
  if (eRes.error) throw eRes.error
  const versions = ((vRes.data ?? []) as unknown as RefVersionRow[]).map(rowToRefVersion)
  const entries = ((eRes.data ?? []) as unknown as RefEntryRow[]).map(rowToRefEntry)
  await db.transaction('rw', db.refVersions, db.refEntries, async () => {
    await db.refVersions.clear()
    await db.refEntries.clear()
    await db.refVersions.bulkPut(versions)
    await db.refEntries.bulkPut(entries)
  })
}
