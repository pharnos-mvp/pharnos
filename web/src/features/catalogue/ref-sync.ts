import type { SupabaseClient } from '@supabase/supabase-js'

import { db, type OrgRefAdoptionRecord, type RefEntryRecord, type RefVersionRecord } from '@/lib/db'
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

/** Ligne Postgres (snake_case) de `org_ref_adoptions` (migration 0072). */
export interface OrgRefAdoptionRow {
  id: string
  org_id: string
  version_id: string
  adopted_at: string
  adopted_by_email: string
}

// Colonnes EXPLICITES (pas de `*`) : une colonne future (auteur de brouillon, note interne…)
// ne doit jamais partir chez tous les authentifiés par simple oubli.
const VERSION_COLUMNS = 'id,label,status,effective_date,release_note,published_at,created_at'
const ENTRY_COLUMNS = 'id,version_id,country,section,payload,provenance,created_at'
const ADOPTION_COLUMNS = 'id,org_id,version_id,adopted_at,adopted_by_email'

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

export function rowToOrgRefAdoption(r: OrgRefAdoptionRow): OrgRefAdoptionRecord {
  return {
    id: r.id,
    orgId: r.org_id,
    versionId: r.version_id,
    adoptedAt: r.adopted_at,
    adoptedByEmail: r.adopted_by_email ?? '',
  }
}

// Throttle : contenu quasi-statique (quelques publications par an) — un pull toutes les 15 min
// suffit, pas à CHAQUE cycle catalogue (montage, mutation, reconnexion…). La clé partage le
// préfixe `pharnos.lastPull` → purgée par `clearLocalData` comme les autres curseurs.
const LAST_PULL_KEY = 'pharnos.lastPull.ref'
const PULL_TTL_MS = 15 * 60 * 1000

function isStale(): boolean {
  try {
    return Date.now() - Number(localStorage.getItem(LAST_PULL_KEY) ?? 0) >= PULL_TTL_MS
  } catch {
    return true // stockage indisponible → on tente le pull (idempotent)
  }
}

function markPulled(): void {
  try {
    localStorage.setItem(LAST_PULL_KEY, String(Date.now()))
  } catch {
    /* non bloquant */
  }
}

let syncing = false

/**
 * Réplique locale du référentiel réglementaire versionné + des adoptions de l'org — PULL SEUL
 * (le client ne peut rien écrire : aucune policy insert/update ; publication = service role,
 * adoption = RPC `adopt_ref_version`). Volontairement HORS chaîne `syncCatalogue` sérialisée
 * (appelé en fire-and-forget) : aucune FK avec les données utilisateur, il ne doit ni retarder un
 * push ni consommer la fenêtre du flush de déconnexion. No-op hors-ligne / Supabase absent /
 * synchro désactivée / TTL non écoulé — sauf `force` (après une adoption : on veut l'état frais).
 */
export async function syncRefContent(orgId: string, opts?: { force?: boolean }): Promise<void> {
  if (syncing || !navigator.onLine || !isSyncEnabled(orgId)) return
  if (!opts?.force && !isStale()) return
  const supabase = await getSupabase()
  if (!supabase) return
  syncing = true
  try {
    await withRetry(() => pullRefContent(supabase, orgId))
    markPulled() // uniquement après un pull COMMITTÉ — un échec re-tentera au prochain cycle
  } catch (error) {
    console.warn('[sync] référentiel :', error)
    reportError(error, { op: 'sync', entity: 'ref' })
  } finally {
    syncing = false
  }
}

/**
 * Remplacement ATOMIQUE de la réplique, PULL BORNÉ : versions PUBLIÉES les plus récentes
 * (limit 50), leurs entrées PAGINÉES par `range`, et les adoptions de l'org — jamais de
 * troncature PostgREST silencieuse (le « Max rows » serveur coupe un `select` nu sans erreur :
 * un référentiel partiel afficherait des montants périmés SOURCÉS — pire mode de défaillance
 * possible). Idempotent (`bulkPut`) ; en panne, on `throw` AVANT la transaction : réplique
 * intacte, le résolveur garde son repli sur le socle code (offline-first).
 */
export async function pullRefContent(supabase: SupabaseClient, orgId: string): Promise<void> {
  const vRes = await supabase
    .from('ref_versions')
    .select(VERSION_COLUMNS)
    .eq('status', 'published')
    .order('published_at', { ascending: false })
    .limit(50)
  if (vRes.error) throw vRes.error
  const versions = ((vRes.data ?? []) as unknown as RefVersionRow[]).map(rowToRefVersion)
  if (versions.length === 50) {
    // Cap volontaire : le résolveur ne sert que la version la plus récente par section, les
    // 50 dernières couvrent des années de publications. Tracé pour ne pas tronquer en silence.
    reportError(new Error('ref_versions : cap de 50 versions publiées atteint'), {
      op: 'sync',
      entity: 'ref',
    })
  }

  const entries: RefEntryRecord[] = []
  if (versions.length > 0) {
    const ids = versions.map((v) => v.id)
    const PAGE = 1000
    for (let from = 0; ; from += PAGE) {
      const eRes = await supabase
        .from('ref_entries')
        .select(ENTRY_COLUMNS)
        .in('version_id', ids)
        .order('id', { ascending: true })
        .range(from, from + PAGE - 1)
      if (eRes.error) throw eRes.error
      const rows = (eRes.data ?? []) as unknown as RefEntryRow[]
      entries.push(...rows.map(rowToRefEntry))
      if (rows.length < PAGE) break
    }
  }

  // Adoptions de CETTE org (0072) — donnée tenant : on ne remplace que ses lignes (un membre
  // multi-orgs garde celles de ses autres orgs, cf. drain par item des autres syncs).
  const aRes = await supabase.from('org_ref_adoptions').select(ADOPTION_COLUMNS).eq('org_id', orgId)
  if (aRes.error) throw aRes.error
  const adoptions = ((aRes.data ?? []) as unknown as OrgRefAdoptionRow[]).map(rowToOrgRefAdoption)

  await db.transaction('rw', db.refVersions, db.refEntries, db.orgRefAdoptions, async () => {
    await db.refVersions.clear()
    await db.refEntries.clear()
    await db.orgRefAdoptions.where('orgId').equals(orgId).delete()
    await db.refVersions.bulkPut(versions)
    await db.refEntries.bulkPut(entries)
    await db.orgRefAdoptions.bulkPut(adoptions)
  })
}
