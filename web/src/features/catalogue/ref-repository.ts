import { db } from '@/lib/db'
import { getSupabase } from '@/lib/supabase'
import { syncRefContent } from './ref-sync'

/** Motif d'échec d'une adoption — l'UI en tire un message qui dit la VRAIE cause. */
export type AdoptFailure = 'offline' | 'forbidden' | 'version_not_published' | 'unknown'

export class AdoptError extends Error {
  // Champ déclaré puis assigné (pas de `readonly` en paramètre) : `erasableSyntaxOnly` interdit
  // les propriétés de constructeur, qui émettent du JS.
  readonly reason: AdoptFailure

  constructor(reason: AdoptFailure) {
    super(reason)
    this.name = 'AdoptError'
    this.reason = reason
  }
}

/** Traduit le message d'erreur PostgREST du RPC en motif exploitable (codes de 0072/0074). */
function classify(message: string): AdoptFailure {
  if (message.includes('version_not_published')) return 'version_not_published'
  if (message.includes('forbidden') || message.includes('no_org')) return 'forbidden'
  return 'unknown'
}

/**
 * Adopte une version du référentiel POUR L'ORGANISATION (P4.2) — consentement tracé.
 *
 * EN LIGNE UNIQUEMENT, volontairement : l'adoption engage l'organisation et s'écrit par le RPC
 * `adopt_ref_version` (migration 0072/0074, security definer) qui vérifie l'ADMIN d'une org active
 * et non scopée, refuse une version non publiée et journalise l'audit dans la même transaction.
 * Pas d'outbox : une adoption « en attente de synchro » qui échouerait plus tard laisserait l'org
 * croire qu'elle applique une version qu'elle n'applique pas — inacceptable pour du réglementaire.
 */
export async function adoptRefVersion(orgId: string, versionId: string): Promise<void> {
  const supabase = await getSupabase()
  if (!supabase) throw new AdoptError('offline')
  const { error } = await supabase.rpc('adopt_ref_version', {
    p_version: versionId,
    p_org: orgId,
  })
  if (error) throw new AdoptError(classify(error.message))

  // Écriture locale OPTIMISTE avant le pull : `syncRefContent` peut être court-circuité (verrou
  // `syncing` d'un pull en vol, synchro cloud désactivée) et avale ses erreurs — sans ça, l'org
  // voyait « adopté » tout en gardant la bannière et l'ancien contenu. Idempotent et
  // auto-cicatrisant : le pull remplace ensuite toutes les lignes de l'org par celles du serveur.
  await db.orgRefAdoptions.put({
    id: `local:${orgId}:${versionId}`,
    orgId,
    versionId,
    adoptedAt: new Date().toISOString(),
    adoptedByEmail: '',
  })
  await syncRefContent(orgId, { force: true })
}
