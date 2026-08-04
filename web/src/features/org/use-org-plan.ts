import { useQuery } from '@tanstack/react-query'

import { getSupabase } from '@/lib/supabase'
import type { Translatable } from '@/lib/i18n-context'
import { getActiveOrgId } from './active-org'
import type { FeatureMap } from './feature-state'

/** Paliers Pharnos (jalon O — 5 plans). */
export type PlanTier = 'free' | 'pro' | 'team' | 'business' | 'enterprise'

/** Plan effectif de l'org (sortie du RPC `my_org_plan`, migration 0026). */
export interface OrgPlan {
  plan: PlanTier
  billing_period: string | null
  /** Client PAYANT (défaut false). NON payant → filigrane « Made with Pharnos » sur les couvertures. */
  is_paying: boolean
  disabled: boolean
  /** Synchro cloud activée pour l'org (choix opt-in ; enforcement des syncs = M3). */
  sync_enabled: boolean
  /** Création de dossiers — déprécié (la création est désormais illimitée ; le quota porte sur la compilation). */
  max_dossiers: number | null
  dossiers_period: 'lifetime' | 'month'
  /** Quota de DÉPÔTS (compilations) — le livrable métré. NULL = illimité. */
  max_compilations: number | null
  compilations_period: 'lifetime' | 'month'
  monthly_ai_tokens: number | null
  max_seats: number | null
  max_storage_bytes: number | null
  features: FeatureMap
  tokens_used: number
  dossiers_used: number
  compilations_used: number
  storage_used: number
}

/** Résultat de la garde de quota au DÉPÔT (RPC `record_compilation` / `compilation_quota`). */
export interface CompileGate {
  allowed: boolean
  reason?: 'no_org' | 'org_disabled' | 'quota_exceeded'
  /**
   * `false` = la livraison ne consomme aucun crédit, et reste autorisée même au plafond (migration
   * 0082). Absent hors ligne. `free_reason` dit laquelle des deux gratuités s'applique.
   */
  billed?: boolean
  /** `recovery` = mêmes octets déjà payés ; `grace` = correction dans les 24 h. */
  free_reason?: 'recovery' | 'grace'
  cap?: number | null
  used?: number
  remaining?: number | null
}

/**
 * PRÉFLIGHT en lecture seule (RPC `compilation_quota`) : « ai-je le droit de compiler, et est-ce
 * que ça coûte un crédit ? ». N'enregistre RIEN — il existe pour ne pas faire fabriquer un PDF de
 * plusieurs dizaines de Mo à quelqu'un qui est déjà au plafond. L'autorité reste
 * `recordCompilation`, appelée après succès.
 */
export async function checkCompilationQuota(
  dossierId: string | null,
  sha: string | null = null,
): Promise<CompileGate> {
  const supabase = await getSupabase()
  if (!supabase) return { allowed: true }
  const { data, error } = await supabase.rpc('compilation_quota', {
    p_dossier_id: dossierId,
    p_org: getActiveOrgId(),
    p_sha: sha,
  })
  if (error || !data) return { allowed: true }
  return data as CompileGate
}

/**
 * Garde ATOMIQUE de compilation (dépôt) : vérifie le quota ET enregistre au serveur (fail-closed serveur,
 * sérialisé par org depuis 0082). **À appeler APRÈS la fabrication** — un crédit ne doit jamais être
 * brûlé sans livrable.
 *
 * Hors-ligne / Supabase non configuré → `{ allowed: true }` : on ne bloque pas le travail.
 *
 * ⚠️ Une erreur RPC vaut aussi `{ allowed: true }` (fail-open : c'est une garde de quota, pas de
 * sécurité). Depuis que l'appel a lieu APRÈS la fabrication, ce fail-open a changé de poids : une
 * erreur ici livre le paquet sans rien décompter. On ne le referme pas — refuser un livrable déjà
 * fabriqué pour une panne réseau serait pire — mais on **réessaie une fois** et on **remonte la
 * fuite**, sans quoi personne ne saurait jamais qu'elle existe.
 */
export async function recordCompilation(
  dossierId: string | null,
  kind = 'm1_pdf',
  sha: string | null = null,
): Promise<CompileGate> {
  const supabase = await getSupabase()
  if (!supabase) return { allowed: true }
  const args = { p_dossier_id: dossierId, p_kind: kind, p_org: getActiveOrgId(), p_sha: sha }
  // ⚠️ On ne réessaie QUE si l'empreinte est là. `record_compilation` INSÈRE : une réponse perdue
  // après commit ferait une seconde ligne. Avec l'empreinte, ce doublon retombe en récupération et
  // ne coûte rien ; sans elle, il double-facturerait en silence. Un appelant qui n'a pas
  // d'empreinte à donner n'a donc droit qu'à une seule tentative.
  const attempts = sha ? 2 : 1
  let last: unknown = null
  for (let attempt = 0; attempt < attempts; attempt++) {
    // Une seconde tentative dans la même milliseconde ne rattrape qu'une erreur ponctuelle ;
    // la vraie panne d'un instant a besoin qu'on la laisse passer.
    if (attempt > 0) await new Promise((r) => setTimeout(r, 500))
    const { data, error } = await supabase.rpc('record_compilation', args)
    if (!error && data) return data as CompileGate
    last = error ?? new Error('record_compilation: réponse vide')
  }
  const { reportError } = await import('@/lib/sentry')
  reportError(last, {
    where: 'recordCompilation',
    detail: 'compilation livrée SANS être décomptée (deux tentatives en échec)',
    dossierId,
    kind,
  })
  return { allowed: true }
}

/** Bascule la synchro cloud de l'org du caller (admin-only côté serveur). Lève en cas d'échec. */
export async function setOrgSync(enabled: boolean): Promise<void> {
  const supabase = await getSupabase()
  if (!supabase) throw new Error('offline')
  const { error } = await supabase.rpc('set_org_sync', {
    p_enabled: enabled,
    p_org: getActiveOrgId(),
  })
  if (error) throw new Error((error as { message?: string }).message || 'failed')
}

export const PLAN_LABEL: Record<PlanTier, Translatable> = {
  free: { fr: 'Free', en: 'Free' },
  pro: { fr: 'Pro', en: 'Pro' },
  team: { fr: 'Team', en: 'Team' },
  business: { fr: 'Business', en: 'Business' },
  enterprise: { fr: 'Entreprise', en: 'Enterprise' },
}

/** Ordre des plans pour les comparaisons d'upgrade. */
export const PLAN_ORDER: PlanTier[] = ['free', 'pro', 'team', 'business', 'enterprise']

/**
 * Nombre de MAH (parties rôle titulaire) inclus avant l'upsell « mode agence ». Free/Pro/Team = 1
 * (un labo/consultant gère son propre titulaire) ; Business/Entreprise = illimité (agence
 * multi-clients). Gate d'UPSELL côté client (les parties sont offline-first, sans RPC serveur à leur
 * création — cohérent avec la philosophie « display only » du catalogue de plans) ; l'existant est
 * grandfathered (le gate ne bloque QUE la création d'un NOUVEAU MAH au-delà du plafond). PURE.
 */
export function mahPartyLimit(plan: PlanTier): number {
  return plan === 'business' || plan === 'enterprise' ? Infinity : 1
}

/** Plan effectif de l'org ACTIVE (RPC `my_org_plan`, org explicite CS1) — caché 5 min, lecture seule. */
export function useOrgPlan() {
  // La bascule d'org recharge l'app (switchActiveOrg) : lire l'org active au montage suffit,
  // et la clé de cache par org évite de servir le plan d'une autre org après bascule.
  const orgId = getActiveOrgId()
  return useQuery<OrgPlan | null>({
    queryKey: ['my-org-plan', orgId],
    queryFn: async () => {
      const supabase = await getSupabase()
      if (!supabase) return null
      const { data, error } = await supabase.rpc('my_org_plan', { p_org: orgId })
      if (error || !data) return null
      return data as OrgPlan
    },
    staleTime: 5 * 60_000,
  })
}
