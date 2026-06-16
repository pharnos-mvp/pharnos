import { useQuery } from '@tanstack/react-query'

import { getSupabase } from '@/lib/supabase'
import type { Translatable } from '@/lib/i18n-context'

/** Paliers Pharnos (jalon O — 5 plans). */
export type PlanTier = 'free' | 'pro' | 'team' | 'business' | 'enterprise'

/** Plan effectif de l'org (sortie du RPC `my_org_plan`, migration 0026). */
export interface OrgPlan {
  plan: PlanTier
  billing_period: string | null
  disabled: boolean
  max_dossiers: number | null
  dossiers_period: 'lifetime' | 'month'
  monthly_ai_tokens: number | null
  max_seats: number | null
  features: Record<string, boolean>
  tokens_used: number
  dossiers_used: number
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
