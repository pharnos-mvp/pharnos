import { useQuery } from '@tanstack/react-query'

import { getSupabase } from '@/lib/supabase'
import type { Translatable } from '@/lib/i18n-context'
import type { FeatureMap } from './feature-state'

/** Paliers Pharnos (jalon O — 5 plans). */
export type PlanTier = 'free' | 'pro' | 'team' | 'business' | 'enterprise'

/** Plan effectif de l'org (sortie du RPC `my_org_plan`, migration 0026). */
export interface OrgPlan {
  plan: PlanTier
  billing_period: string | null
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

/** Résultat de la garde de quota au DÉPÔT (RPC `record_compilation`). */
export interface CompileGate {
  allowed: boolean
  reason?: 'no_org' | 'org_disabled' | 'quota_exceeded'
  cap?: number | null
  used?: number
  remaining?: number | null
}

/**
 * Garde ATOMIQUE de compilation (dépôt) : vérifie le quota ET enregistre au serveur (fail-closed serveur).
 * Hors-ligne / Supabase non configuré → `{ allowed: true }` (on ne bloque pas le travail ; le serveur reste
 * l'autorité au prochain dépôt en ligne). Une erreur réseau ne bloque pas non plus (fail-open client : c'est
 * une garde de quota, pas de sécurité ; le ledger serveur reste la vérité).
 */
export async function recordCompilation(
  dossierId: string | null,
  kind = 'm1_pdf',
): Promise<CompileGate> {
  const supabase = await getSupabase()
  if (!supabase) return { allowed: true }
  const { data, error } = await supabase.rpc('record_compilation', {
    p_dossier_id: dossierId,
    p_kind: kind,
  })
  if (error || !data) return { allowed: true }
  return data as CompileGate
}

/** Bascule la synchro cloud de l'org du caller (admin-only côté serveur). Lève en cas d'échec. */
export async function setOrgSync(enabled: boolean): Promise<void> {
  const supabase = await getSupabase()
  if (!supabase) throw new Error('offline')
  const { error } = await supabase.rpc('set_org_sync', { p_enabled: enabled })
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

/** Plan effectif de l'org du caller (RPC `my_org_plan`) — caché 5 min, lecture seule. */
export function useOrgPlan() {
  return useQuery<OrgPlan | null>({
    queryKey: ['my-org-plan'],
    queryFn: async () => {
      const supabase = await getSupabase()
      if (!supabase) return null
      const { data, error } = await supabase.rpc('my_org_plan')
      if (error || !data) return null
      return data as OrgPlan
    },
    staleTime: 5 * 60_000,
  })
}
