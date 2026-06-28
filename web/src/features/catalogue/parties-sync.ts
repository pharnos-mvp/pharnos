import type { SupabaseClient } from '@supabase/supabase-js'

import { db, type PartyRecord, type PartyRole } from '@/lib/db'
import { isPermanentSyncError, withRetry } from '@/lib/retry'
import { isSyncEnabled } from '@/lib/sync-prefs'
import { reportError } from '@/lib/sentry'
import { getSupabase } from '@/lib/supabase'

/** Ligne Postgres (snake_case) de la table `parties`. */
export interface PartyRow {
  id: string
  org_id: string
  nom: string
  roles: string[]
  pays: string
  adresse: string
  gmp_certificat: string
  gmp_expiry: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export function partyToRow(p: PartyRecord): PartyRow {
  return {
    id: p.id,
    org_id: p.orgId,
    nom: p.nom,
    roles: p.roles,
    pays: p.pays,
    adresse: p.adresse,
    gmp_certificat: p.gmpCertificat,
    gmp_expiry: p.gmpExpiry,
    created_at: p.createdAt,
    updated_at: p.updatedAt,
    deleted_at: p.deletedAt,
  }
}

export function rowToParty(r: PartyRow): PartyRecord {
  return {
    id: r.id,
    orgId: r.org_id,
    nom: r.nom,
    roles: (r.roles ?? []) as PartyRole[],
    pays: r.pays ?? '',
    adresse: r.adresse ?? '',
    gmpCertificat: r.gmp_certificat ?? '',
    gmpExpiry: r.gmp_expiry,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    deletedAt: r.deleted_at,
  }
}

const lastPullKey = (orgId: string) => `pharnos.lastPull.parties.${orgId}`
let syncing = false

/**
 * Réconcilie les organisations (`parties`) locales avec Postgres : push de l'outbox puis pull
 * incrémental. No-op hors-ligne / si Supabase n'est pas configuré (mode local/tests) / si la synchro
 * cloud est désactivée pour l'org. À pousser AVANT les produits (FK products.titulaire_id → parties).
 */
export async function syncParties(orgId: string): Promise<void> {
  if (syncing || !navigator.onLine || !isSyncEnabled(orgId)) return
  const supabase = await getSupabase()
  if (!supabase) return
  syncing = true
  try {
    await withRetry(() => pushOutbox(supabase, orgId))
    await withRetry(() => pullParties(supabase, orgId))
  } catch (error) {
    console.warn('[sync] organisations :', error)
    reportError(error, { op: 'sync', entity: 'parties' })
  } finally {
    syncing = false
  }
}

async function pushOutbox(supabase: SupabaseClient, orgId: string): Promise<void> {
  const items = await db.outbox.where('entity').equals('party').toArray()
  if (items.length === 0) return

  const ids = [...new Set(items.map((i) => i.entityId))]
  for (const id of ids) {
    const rec = await db.parties.get(id)
    if (!rec || rec.orgId !== orgId) continue
    const { error } = await supabase.from('parties').upsert(partyToRow(rec))
    if (error) {
      if (isPermanentSyncError(error)) continue // rejet permanent : drainé par le bulkDelete final
      throw error
    }
  }
  await db.outbox.bulkDelete(items.map((i) => i.id))
}

async function pullParties(supabase: SupabaseClient, orgId: string): Promise<void> {
  const since = localStorage.getItem(lastPullKey(orgId)) ?? '1970-01-01T00:00:00.000Z'
  const { data, error } = await supabase
    .from('parties')
    .select('*')
    .eq('org_id', orgId)
    .gt('updated_at', since)
    .order('updated_at', { ascending: true })
  if (error) throw error

  const rows = (data ?? []) as unknown as PartyRow[]
  let maxUpdated = since
  for (const row of rows) {
    const incoming = rowToParty(row)
    const local = await db.parties.get(incoming.id)
    // Server-authoritative LWW : on écrit si pas de local ou si le serveur est plus récent/égal.
    if (!local || incoming.updatedAt >= local.updatedAt) {
      await db.parties.put(incoming)
    }
    if (incoming.updatedAt > maxUpdated) maxUpdated = incoming.updatedAt
  }
  if (rows.length > 0) localStorage.setItem(lastPullKey(orgId), maxUpdated)
}
