import type { SupabaseClient } from '@supabase/supabase-js'

import { db, type PghtEntry, type ProductRecord } from '@/lib/db'
import { isPermanentSyncError, withRetry } from '@/lib/retry'
import { isSyncEnabled } from '@/lib/sync-prefs'
import { reportError } from '@/lib/sentry'
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
  titulaire: string
  titulaire_adresse: string
  fabricant: string
  fabricant_adresse: string
  // Liens vers `parties` (additif `0045`) : dérivés du free-text à l'enregistrement (M4). null sinon.
  titulaire_id: string | null
  fabricant_id: string | null
  // Table PGHT multi-pays (jsonb, additif `0065`). Défaut serveur '[]' → anciens produits = [].
  pght: PghtEntry[]
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
    titulaire: p.titulaire,
    titulaire_adresse: p.titulaireAdresse ?? '',
    fabricant: p.fabricant,
    fabricant_adresse: p.fabricantAdresse ?? '',
    titulaire_id: p.titulaireId ?? null,
    fabricant_id: p.fabricantId ?? null,
    pght: p.pght ?? [],
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
    titulaire: r.titulaire ?? '',
    titulaireAdresse: r.titulaire_adresse ?? '',
    fabricant: r.fabricant ?? '',
    fabricantAdresse: r.fabricant_adresse ?? '',
    titulaireId: r.titulaire_id ?? null,
    fabricantId: r.fabricant_id ?? null,
    // jsonb → déjà parsé par supabase-js ; défensif si null/forme inattendue.
    pght: Array.isArray(r.pght) ? r.pght : [],
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
  if (syncing || !navigator.onLine || !isSyncEnabled(orgId)) return
  const supabase = await getSupabase()
  if (!supabase) return
  syncing = true
  try {
    // Retry borné (transitoires only) : une microcoupure ne repousse pas la sync au prochain déclencheur.
    await withRetry(() => pushOutbox(supabase, orgId))
    await withRetry(() => pullProducts(supabase, orgId))
  } catch (error) {
    // On réessaiera au prochain déclencheur (montage / reconnexion / mutation).
    console.warn('[sync] produits :', error)
    reportError(error, { op: 'sync', entity: 'products' })
  } finally {
    syncing = false
  }
}

async function pushOutbox(supabase: SupabaseClient, orgId: string): Promise<void> {
  const items = await db.outbox.where('entity').equals('product').toArray()
  if (items.length === 0) return

  // FK products.titulaire_id / fabricant_id → parties : le parent doit être EN BASE avant l'enfant.
  // `syncCatalogue` pousse les parties en premier, mais l'ordre des appelants ne suffit pas à le
  // GARANTIR (un cycle déjà en vol rend `syncParties` no-op) → on tient l'invariant ici : tant que
  // la partie référencée est en file, le produit attend le cycle suivant. Sans ça : 23503.
  const pendingParties = new Set(
    (await db.outbox.where('entity').equals('party').toArray()).map((i) => i.entityId),
  )

  // Drain PAR ITEM traité (cf. parties-sync) : un bulkDelete global supprimerait aussi les ops
  // SAUTÉES ci-dessous — celles d'une AUTRE org (membre multi-orgs) ou en attente de leur parent —
  // sans les avoir poussées. Elles ne seraient jamais reprises : divergence silencieuse.
  const ids = [...new Set(items.map((i) => i.entityId))]
  const drain = new Set<string>()
  for (const id of ids) {
    const rec = await db.products.get(id)
    if (!rec) {
      drain.add(id) // plus rien à pousser localement
      continue
    }
    if (rec.orgId !== orgId) continue // autre org → reste en file pour son propre cycle
    const parents = [rec.titulaireId, rec.fabricantId].filter((p): p is string => !!p)
    if (parents.some((p) => pendingParties.has(p))) continue // parent en file → cycle suivant
    // On pousse l'état Dexie courant (upsert, soft-delete inclus).
    const { error } = await supabase.from('products').upsert(productToRow(rec))
    if (error) {
      if (isPermanentSyncError(error)) {
        // Rejet définitif : draine (anti-boucle) + trace Sentry (divergence local/serveur).
        reportError(error, { op: 'sync', entity: 'products', id, permanent: true })
        drain.add(id)
        continue
      }
      throw error // transitoire (FK pas encore satisfaite incluse) → conservé, retenté
    }
    drain.add(id)
  }
  await db.outbox.bulkDelete(items.filter((i) => drain.has(i.entityId)).map((i) => i.id))
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
