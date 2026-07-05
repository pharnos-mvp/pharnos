// Cœur PARTAGÉ de la purge d'un dossier de corbeille (LOT 9) — consommé par :
//   • `retention-purge`  : purge AUTOMATIQUE nocturne (fenêtre de grâce échue, actor 'system') ;
//   • `purge-dossier`    : purge IMMÉDIATE demandée par un membre (« Supprimer définitivement »,
//                          clin d'œil corbeille Windows — actor = l'utilisateur, ALCOA attribuable).
// Séquence idempotente / crash-safe (l'ordre fait qu'un run interrompu se rejoue sans effet de bord) :
//   1. fichiers Storage du préfixe `{org}/dossiers/{id}/` via l'API Storage (JAMAIS de DELETE SQL
//      sur storage.objects — orphelinerait les octets) ;
//   2. lignes enfants (dossier_attachments, generated_docs, lifecycle_events) ;
//   3. squelette tombstone : ligne `dossiers` vidée, `purged_at` posé, `updated_at` bumpé →
//      la sync propage la purge aux appareils hors-ligne, le squelette = preuve d'audit ;
//   4. entrée `audit_log` org-scopée (acteur + libellé fournis par l'appelant).
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'

/** Fenêtre de grâce (jours) — DOIT rester alignée avec TRASH_RETENTION_DAYS côté front. */
export const RETENTION_DAYS = 30
export const BUCKET = 'documents'
/** Taille de page des listings (scan dossiers + list Storage). */
export const PAGE_SIZE = 500
const REMOVE_CHUNK = 100
/** Profondeur max du walk Storage sous le préfixe dossier (réel : 2 niveaux, marge ×2). */
const MAX_LIST_DEPTH = 4

export interface PurgeTarget {
  id: string
  org_id: string
  product_name: string
}

export interface PurgeAudit {
  /** 'system' (cron) ou l'UUID de l'utilisateur (purge immédiate). */
  actorId: string
  actorEmail: string
  label: string
}

const chunk = <T>(arr: T[], size: number): T[][] => {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

/**
 * Efface récursivement tous les objets Storage sous un préfixe (l'API `list` n'est pas récursive :
 * les « dossiers » sont des entrées sans `id`). Profondeur bornée. Retourne le nombre de fichiers
 * supprimés ; préfixe absent = 0 (idempotent).
 */
export async function removeStoragePrefix(
  supabase: SupabaseClient,
  prefix: string,
): Promise<number> {
  const files: string[] = []
  const walk = async (dir: string, depth: number): Promise<void> => {
    if (depth > MAX_LIST_DEPTH) return
    for (let offset = 0; ; offset += PAGE_SIZE) {
      const { data, error } = await supabase.storage
        .from(BUCKET)
        .list(dir, { limit: PAGE_SIZE, offset })
      if (error) throw error
      const entries = data ?? []
      for (const entry of entries) {
        if (entry.id === null) await walk(`${dir}/${entry.name}`, depth + 1)
        else files.push(`${dir}/${entry.name}`)
      }
      if (entries.length < PAGE_SIZE) break
    }
  }
  await walk(prefix, 0)
  for (const part of chunk(files, REMOVE_CHUNK)) {
    const { error } = await supabase.storage.from(BUCKET).remove(part)
    if (error) throw error
  }
  return files.length
}

/**
 * Purge DÉFINITIVE d'un dossier de corbeille (fichiers + enfants + squelette tombstone + audit).
 * L'appelant a DÉJÀ vérifié l'éligibilité (deleted_at posé, purged_at null, archived_at null,
 * aucune correspondance — garde GxP). Retourne le nombre de fichiers Storage supprimés.
 */
export async function purgeDossier(
  supabase: SupabaseClient,
  dossier: PurgeTarget,
  audit: PurgeAudit,
): Promise<number> {
  const filesRemoved = await removeStoragePrefix(
    supabase,
    `${dossier.org_id}/dossiers/${dossier.id}`,
  )

  for (const table of ['dossier_attachments', 'generated_docs', 'lifecycle_events']) {
    const { error } = await supabase.from(table).delete().eq('dossier_id', dossier.id)
    if (error) throw error
  }

  // Squelette tombstone EN DERNIER (marqueur d'achèvement) : contenu vidé, identité conservée
  // (product_name = trace lisible), updated_at bumpé → propagation sync.
  const nowIso = new Date().toISOString()
  const { error: updErr } = await supabase
    .from('dossiers')
    .update({
      tree: [],
      excluded_doc_ids: [],
      variations: null,
      variation_items: null,
      purged_at: nowIso,
      updated_at: nowIso,
    })
    .eq('id', dossier.id)
  if (updErr) throw updErr

  const { error: auditErr } = await supabase.from('audit_log').insert({
    id: crypto.randomUUID(),
    org_id: dossier.org_id,
    actor_id: audit.actorId,
    actor_email: audit.actorEmail,
    entity: 'dossier',
    entity_id: dossier.id,
    action: 'purge',
    label: audit.label,
  })
  if (auditErr) throw auditErr

  return filesRemoved
}
