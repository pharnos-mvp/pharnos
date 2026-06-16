import { getSupabase } from '@/lib/supabase'
import type { PlanTier } from './use-org-plan'

export interface OrgMembership {
  orgId: string
  role: string
  orgName: string
}

interface MembershipRow {
  org_id: string
  role: string
  orgs: { name: string } | null
}

/** Appartenances (organisations) de l'utilisateur courant. */
export async function fetchMyMemberships(): Promise<OrgMembership[]> {
  const supabase = await getSupabase()
  if (!supabase) return []
  const { data, error } = await supabase.from('memberships').select('org_id, role, orgs(name)')
  if (error) throw error
  const rows = (data ?? []) as unknown as MembershipRow[]
  return rows.map((r) => ({ orgId: r.org_id, role: r.role, orgName: r.orgs?.name ?? '' }))
}

/** Crée une organisation et rattache l'utilisateur courant comme admin (RPC SECURITY DEFINER). */
export async function createOrg(name: string): Promise<string> {
  const supabase = await getSupabase()
  if (!supabase) throw new Error('Supabase non configuré')
  const { data, error } = await supabase.rpc('create_org', { org_name: name })
  if (error) throw error
  return data as string
}

/**
 * Onboarding : crée l'org avec le plan choisi (octroi immédiat, mode pilote) + admin.
 * Les infos pro (entreprise/poste/pays) sont écrites séparément côté client (pro_settings).
 */
export async function createOrgOnboarding(name: string, plan: PlanTier): Promise<string> {
  const supabase = await getSupabase()
  if (!supabase) throw new Error('Supabase non configuré')
  const { data, error } = await supabase.rpc('create_org_onboarding', {
    p_name: name,
    p_plan: plan,
  })
  if (error) throw error
  return data as string
}

/** Mise à niveau self-serve : l'admin change le plan de son org (mode pilote, sans paiement). */
export async function choosePlan(plan: PlanTier): Promise<void> {
  const supabase = await getSupabase()
  if (!supabase) throw new Error('Supabase non configuré')
  const { error } = await supabase.rpc('choose_plan', { p_plan: plan })
  if (error) throw error
}
