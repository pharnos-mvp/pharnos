import { recordAudit } from '@/lib/audit'
import { db, type DossierRecord } from '@/lib/db'
import { getSupabase } from '@/lib/supabase'
import { purgeLocalChildren } from './dossier-sync'

/**
 * Purge IMMÉDIATE d'un brouillon de la corbeille (« Supprimer définitivement », LOT 9) — sans
 * attendre la purge automatique à 30 j.
 *
 * - Mode connecté : l'Edge `purge-dossier` fait foi (fichiers Storage + enfants DB + squelette
 *   tombstone + audit attribuable, gardes GxP re-vérifiées serveur). Le local est ensuite mis en
 *   miroir immédiatement (sans attendre le pull). EXIGE d'être en ligne : pas de purge « promise »
 *   depuis l'outbox — une destruction définitive ne se met pas en file d'attente.
 * - Mode local (Supabase non configuré) : purge locale pure — enfants + blobs + la ligne dossier
 *   passe en squelette tombstone local (cohérent avec le serveur), audit local tracé.
 */
export async function purgeTrashedDossier(
  orgId: string,
  id: string,
  reason?: string,
): Promise<void> {
  const existing = await db.dossiers.get(id)
  if (!existing || existing.deletedAt === null || existing.purgedAt) return

  const supabase = await getSupabase()
  if (supabase) {
    if (!navigator.onLine) throw new Error('offline')
    const { data, error } = await supabase.functions.invoke('purge-dossier', {
      body: { orgId, dossierId: id, reason: reason?.trim() || undefined },
    })
    // Non-2xx : remonter le CODE serveur (submitted/archived/too_many…) — l'UI adapte son message
    // (un refus GxP n'est pas un transitoire, « réessayez » serait un mensonge).
    if (error) throw new Error(await invokeErrorCode(error))
    const res = (data ?? {}) as { purged?: boolean; error?: string }
    if (!res.purged) throw new Error(res.error ?? 'purge_failed')
    // Miroir local immédiat (le pull confirmera avec l'updated_at serveur) : squelette + enfants.
    await applyLocalTombstone(existing)
    // Défense en profondeur : draine l'outbox du dossier purgé (le serveur est devenu autoritaire ;
    // sans ça, le prochain sync re-pousserait une ligne complète — neutralisée par le trigger 0054,
    // mais autant ne pas dépendre du seul trigger).
    const stale = await db.outbox.where('entity').equals('dossier').toArray()
    await db.outbox.bulkDelete(stale.filter((i) => i.entityId === id).map((i) => i.id))
    return
  }

  // Mode local : même sémantique, en local uniquement (audit compris — ALCOA).
  await applyLocalTombstone(existing)
  await recordAudit(
    orgId,
    'dossier',
    id,
    'purge',
    `${existing.productName} · suppression définitive (corbeille)${
      reason?.trim() ? ` · motif : ${reason.trim()}` : ''
    }`,
  )
}

/** Extrait le code d'erreur JSON d'un échec `functions.invoke` (FunctionsHttpError.context). */
async function invokeErrorCode(error: unknown): Promise<string> {
  try {
    const ctx = (error as { context?: Response }).context
    const body = (await ctx?.clone().json()) as { error?: string } | undefined
    if (body?.error) return String(body.error)
  } catch {
    // corps illisible → code générique
  }
  return 'purge_failed'
}

/** Squelette tombstone local + effacement des enfants (pièces, blobs, docs générés, journal). */
async function applyLocalTombstone(existing: DossierRecord): Promise<void> {
  const ts = new Date().toISOString()
  await db.dossiers.put({
    ...existing,
    tree: [],
    excludedDocIds: [],
    variations: undefined,
    variationItems: undefined,
    purgedAt: ts,
    updatedAt: ts,
  })
  await purgeLocalChildren(existing.id)
}
