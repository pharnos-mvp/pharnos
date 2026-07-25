import { getSupabase } from '@/lib/supabase'
import { syncRefContent } from './ref-sync'

/**
 * Adopte une version du référentiel POUR L'ORGANISATION (P4.2) — consentement tracé.
 *
 * EN LIGNE UNIQUEMENT, volontairement : l'adoption engage l'organisation et s'écrit par le RPC
 * `adopt_ref_version` (migration 0072, security definer) qui vérifie l'ADMIN, refuse un brouillon
 * et journalise l'audit dans la même transaction. Pas d'outbox : une adoption « en attente de
 * synchro » qui échouerait plus tard laisserait l'org croire qu'elle applique une version qu'elle
 * n'applique pas — inacceptable pour un contenu réglementaire.
 *
 * Après succès, on force le pull (le TTL de 15 min ne doit pas retarder l'effet visible).
 */
export async function adoptRefVersion(orgId: string, versionId: string): Promise<void> {
  const supabase = await getSupabase()
  if (!supabase) throw new Error('offline')
  const { error } = await supabase.rpc('adopt_ref_version', {
    p_version: versionId,
    p_org: orgId,
  })
  if (error) throw new Error(error.message)
  await syncRefContent(orgId, { force: true })
}
