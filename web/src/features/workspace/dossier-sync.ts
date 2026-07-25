import type { SupabaseClient } from '@supabase/supabase-js'

import { db, type DossierRecord } from '@/lib/db'
import { isPermanentSyncError, withRetry } from '@/lib/retry'
import { isSyncEnabled } from '@/lib/sync-prefs'
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
  // Variation (moteur de variation, additif `0042`) — null pour les dossiers non-variation.
  variations: number[] | null
  variation_items: unknown
  amm_numero: string | null
  amm_date: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
  archived_at: string | null
  // Version du référentiel réglementaire sous laquelle le dossier est monté (0073) — épinglée à la
  // création, changée seulement par une bascule VOLONTAIRE. null = dossier antérieur à P4.2b.
  ref_version_id?: string | null
  // N° d'opération attribué CÔTÉ SERVEUR (0046) : descend au pull, JAMAIS poussé par le client
  // (absent de `dossierToRow` → l'upsert ne les écrase pas, le trigger les attribue à l'insert).
  op_year?: number | null
  op_number?: number | null
  // Purge de rétention posée CÔTÉ SERVEUR (0054, Edge retention-purge) : descend au pull, JAMAIS
  // poussée par le client (même pattern que op_year/op_number — un push d'appareil retardataire
  // ne peut pas « dé-purger » un squelette tombstone).
  purged_at?: string | null
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
    variations: d.variations ?? null,
    variation_items: d.variationItems ?? null,
    amm_numero: d.ammNumero ?? null,
    amm_date: d.ammDate ?? null,
    created_at: d.createdAt,
    updated_at: d.updatedAt,
    deleted_at: d.deletedAt,
    archived_at: d.archivedAt ?? null,
    ref_version_id: d.refVersionId ?? null,
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
    variations: r.variations ?? undefined,
    variationItems: r.variation_items ?? undefined,
    ammNumero: r.amm_numero ?? undefined,
    ammDate: r.amm_date ?? undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    deletedAt: r.deleted_at,
    archivedAt: r.archived_at ?? null,
    opYear: r.op_year ?? null,
    opNumber: r.op_number ?? null,
    purgedAt: r.purged_at ?? null,
    refVersionId: r.ref_version_id ?? null,
  }
}

const lastPullKey = (orgId: string) => `pharnos.lastPull.dossiers.${orgId}`
let syncing = false
// Une création survenue PENDANT une sync (ex. `void syncDossiers` juste après createDossier) se
// heurtait au garde-fou `syncing` et était SILENCIEUSEMENT ignorée → son n° d'opération (attribué
// côté serveur au push) ne descendait qu'au prochain déclencheur (montage/refresh), d'où le « n° en
// attente » qui ne se résolvait qu'après un refresh manuel. On COALESCE : toute demande arrivée
// pendant une sync programme UN 2ᵉ passage, qui draine le dernier outbox et pull le n° tout de suite.
let rerunRequested = false

/** Réconcilie les dossiers (Dexie ⇄ Postgres). No-op hors-ligne / Supabase non configuré. */
export async function syncDossiers(orgId: string): Promise<void> {
  if (!navigator.onLine || !isSyncEnabled(orgId)) return
  if (syncing) {
    // Une sync est déjà en cours (même org, appli mono-org active) → demande un passage
    // supplémentaire à sa boucle plutôt que d'abandonner cette demande.
    rerunRequested = true
    return
  }
  const supabase = await getSupabase()
  if (!supabase) return
  syncing = true
  try {
    do {
      rerunRequested = false
      // Retry borné (transitoires only) : une microcoupure ne repousse pas la sync au prochain déclencheur.
      await withRetry(() => pushDossiers(supabase, orgId))
      await withRetry(() => pullDossiers(supabase, orgId))
    } while (rerunRequested) // une création arrivée pendant ce cycle est prise en compte immédiatement
  } catch (error) {
    console.warn('[sync] dossiers :', error)
    reportError(error, { op: 'sync', entity: 'dossiers' })
  } finally {
    syncing = false
    rerunRequested = false
  }
}

async function pushDossiers(supabase: SupabaseClient, orgId: string): Promise<void> {
  const items = await db.outbox.where('entity').equals('dossier').toArray()
  if (items.length === 0) return
  // Drain PAR ITEM traité : un bulkDelete global supprimerait aussi les ops SAUTÉES juste en
  // dessous — celles d'une AUTRE org (membre multi-orgs, CS1) — sans les avoir poussées. Rien ne
  // les réenfilerait : le dossier ne remonterait JAMAIS au serveur (divergence silencieuse).
  const ids = [...new Set(items.map((i) => i.entityId))]
  const drain = new Set<string>()
  for (const id of ids) {
    const rec = await db.dossiers.get(id)
    if (!rec) {
      drain.add(id) // plus rien à pousser localement
      continue
    }
    if (rec.orgId !== orgId) continue // autre org → reste en file pour son propre cycle
    const { error } = await supabase.from('dossiers').upsert(dossierToRow(rec))
    if (error) {
      if (isPermanentSyncError(error)) {
        // Rejet définitif (RLS/contrainte) : re-tenter rééchouera à l'identique → draine (anti-
        // boucle) + trace Sentry : le dossier local n'atteindra JAMAIS le serveur (divergence).
        reportError(error, { op: 'sync', entity: 'dossiers', id, permanent: true })
        drain.add(id)
        continue
      }
      throw error
    }
    drain.add(id)
  }
  await db.outbox.bulkDelete(items.filter((i) => drain.has(i.entityId)).map((i) => i.id))
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
    // Un squelette tombstone purgé (0054) l'emporte TOUJOURS, même sur un état local plus récent :
    // la purge est terminale et le serveur neutralise toute écriture retardataire (trigger 0054) —
    // sans cette priorité, l'appareil qui a « restauré » pendant la nuit de purge garderait à vie
    // un zombie local que le LWW ne réconcilierait jamais.
    if (!local || incoming.updatedAt >= local.updatedAt || incoming.purgedAt) {
      await db.dossiers.put(incoming)
      // Purge de rétention descendue du serveur : miroir local — on efface les enfants (pièces
      // jointes ET leurs blobs, documents générés, journal du cycle de vie) pour libérer
      // IndexedDB, comme le serveur a effacé lignes + fichiers Storage. Idempotent.
      if (incoming.purgedAt && !local?.purgedAt) await purgeLocalChildren(incoming.id)
    }
    if (incoming.updatedAt > maxUpdated) maxUpdated = incoming.updatedAt
  }
  if (rows.length > 0) localStorage.setItem(lastPullKey(orgId), maxUpdated)
}

/**
 * Efface les données locales d'un dossier purgé (squelette tombstone conservé dans `dossiers`).
 * Exporté pour le test unitaire (appelé par le pull quand `purged_at` descend du serveur).
 */
export async function purgeLocalChildren(dossierId: string): Promise<void> {
  await db.transaction(
    'rw',
    [db.dossierAttachments, db.documentBlobs, db.generatedDocs, db.lifecycleEvents],
    async () => {
      // Les octets lourds des pièces jointes vivent dans `documentBlobs` (clé = id de pièce) :
      // les purger AVEC les lignes, sinon l'espace IndexedDB n'est jamais rendu.
      const attachmentIds = await db.dossierAttachments
        .where('dossierId')
        .equals(dossierId)
        .primaryKeys()
      if (attachmentIds.length > 0) await db.documentBlobs.bulkDelete(attachmentIds)
      await db.dossierAttachments.where('dossierId').equals(dossierId).delete()
      await db.generatedDocs.where('dossierId').equals(dossierId).delete()
      await db.lifecycleEvents.where('dossierId').equals(dossierId).delete()
    },
  )
}
