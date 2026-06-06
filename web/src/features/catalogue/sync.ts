import type { SupabaseClient } from '@supabase/supabase-js'

import { db, type ProductRecord } from '@/lib/db'
import { getSupabase } from '@/lib/supabase'

/** Ligne Postgres (snake_case) de la table `products`. */
export interface ProductRow {
  id: string
  org_id: string
  nom_commercial: string
  dci: string
  dosage: string
  forme: string
  presentation: string
  classe_therapeutique: string
  code_atc: string
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export function productToRow(p: ProductRecord): ProductRow {
  return {
    id: p.id,
    org_id: p.orgId,
    nom_commercial: p.nomCommercial,
    dci: p.dci,
    dosage: p.dosage,
    forme: p.forme,
    presentation: p.presentation,
    classe_therapeutique: p.classeTherapeutique,
    code_atc: p.codeAtc,
    created_at: p.createdAt,
    updated_at: p.updatedAt,
    deleted_at: p.deletedAt,
  }
}

export function rowToProduct(r: ProductRow): ProductRecord {
  return {
    id: r.id,
    orgId: r.org_id,
    nomCommercial: r.nom_commercial,
    dci: r.dci,
    dosage: r.dosage,
    forme: r.forme,
    presentation: r.presentation,
    classeTherapeutique: r.classe_therapeutique,
    codeAtc: r.code_atc,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    deletedAt: r.deleted_at,
  }
}

const lastPullKey = (orgId: string) => `pharnos.lastPull.products.${orgId}`
let syncing = false

/**
 * Réconcilie les produits locaux (Dexie) avec Postgres : push de l'outbox puis pull
 * incrémental. No-op hors-ligne ou si Supabase n'est pas configuré (mode local/tests).
 */
export async function syncProducts(orgId: string): Promise<void> {
  if (syncing || !navigator.onLine) return
  const supabase = await getSupabase()
  if (!supabase) return
  syncing = true
  try {
    await pushOutbox(supabase, orgId)
    await pullProducts(supabase, orgId)
  } catch (error) {
    // On réessaiera au prochain déclencheur (montage / reconnexion / mutation).
    console.warn('[sync] produits :', error)
  } finally {
    syncing = false
  }
}

async function pushOutbox(supabase: SupabaseClient, orgId: string): Promise<void> {
  const items = await db.outbox.where('entity').equals('product').toArray()
  if (items.length === 0) return

  // Pour chaque produit en attente, on pousse son état Dexie courant (upsert, soft-delete inclus).
  const ids = [...new Set(items.map((i) => i.entityId))]
  for (const id of ids) {
    const rec = await db.products.get(id)
    if (!rec || rec.orgId !== orgId) continue
    const { error } = await supabase.from('products').upsert(productToRow(rec))
    if (error) throw error
  }
  await db.outbox.bulkDelete(items.map((i) => i.id))
}

async function pullProducts(supabase: SupabaseClient, orgId: string): Promise<void> {
  const since = localStorage.getItem(lastPullKey(orgId)) ?? '1970-01-01T00:00:00.000Z'
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .eq('org_id', orgId)
    .gt('updated_at', since)
    .order('updated_at', { ascending: true })
  if (error) throw error

  const rows = (data ?? []) as unknown as ProductRow[]
  let maxUpdated = since
  for (const row of rows) {
    const incoming = rowToProduct(row)
    const local = await db.products.get(incoming.id)
    // Server-authoritative LWW : on écrit si pas de local ou si le serveur est plus récent/égal.
    if (!local || incoming.updatedAt >= local.updatedAt) {
      await db.products.put(incoming)
    }
    if (incoming.updatedAt > maxUpdated) maxUpdated = incoming.updatedAt
  }
  if (rows.length > 0) localStorage.setItem(lastPullKey(orgId), maxUpdated)
}
