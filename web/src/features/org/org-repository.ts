import { getSupabase } from '@/lib/supabase'
import { getActiveOrgId } from './active-org'
import type { PlanTier } from './use-org-plan'

export interface OrgMembership {
  orgId: string
  role: string
  orgName: string
  /** Périmètre CS1 : null = toute l'org (défaut) ; sinon la liste des dossiers grantés. */
  scopedDossierIds: string[] | null
}

interface MembershipRow {
  org_id: string
  role: string
  orgs: { name: string } | null
}

interface ScopeRow {
  org_id: string
  dossier_ids: string[]
}

/** Appartenances (organisations) de l'utilisateur courant + périmètre CS1 éventuel. */
export async function fetchMyMemberships(): Promise<OrgMembership[]> {
  const supabase = await getSupabase()
  if (!supabase) return []
  // Filtre user_id EXPLICITE : la RLS montre aussi les lignes des collègues de l'org — sans
  // filtre, `find(m => m.orgId === orgId)` pouvait lire le RÔLE d'un autre membre (gating UI faux).
  const uid = (await supabase.auth.getSession()).data.session?.user.id
  if (!uid) return []
  const [membershipsRes, scopesRes] = await Promise.all([
    supabase.from('memberships').select('org_id, role, orgs(name)').eq('user_id', uid),
    supabase.from('membership_scopes').select('org_id, dossier_ids').eq('user_id', uid),
  ])
  if (membershipsRes.error) throw membershipsRes.error
  // Périmètre illisible ≠ bloquant : on retombe sur null (la RLS serveur reste la barrière).
  const scopes = (scopesRes.error ? [] : (scopesRes.data ?? [])) as unknown as ScopeRow[]
  const scopeByOrg = new Map(scopes.map((s) => [s.org_id, s.dossier_ids ?? []]))
  const rows = (membershipsRes.data ?? []) as unknown as MembershipRow[]
  return rows.map((r) => ({
    orgId: r.org_id,
    role: r.role,
    orgName: r.orgs?.name ?? '',
    scopedDossierIds: scopeByOrg.get(r.org_id) ?? null,
  }))
}

/**
 * Onboarding : crée l'org avec le plan choisi (octroi immédiat, mode pilote) + admin.
 * Accès sur invitation (0063) : le code d'invitation est validé côté serveur (quota, révocation,
 * expiration) et l'inscription est attribuée à l'expert du code.
 * Les infos pro (entreprise/poste/pays) sont écrites séparément côté client (pro_settings).
 */
export async function createOrgOnboarding(
  name: string,
  plan: PlanTier,
  inviteCode: string,
): Promise<string> {
  const supabase = await getSupabase()
  if (!supabase) throw new Error('Supabase non configuré')
  const { data, error } = await supabase.rpc('create_org_onboarding', {
    p_name: name,
    p_plan: plan,
    p_invite_code: inviteCode,
  })
  if (error) throw error
  return data as string
}

/** Mise à niveau self-serve : l'admin change le plan de son org (mode pilote, sans paiement). */
export async function choosePlan(plan: PlanTier): Promise<void> {
  const supabase = await getSupabase()
  if (!supabase) throw new Error('Supabase non configuré')
  const { error } = await supabase.rpc('choose_plan', { p_plan: plan, p_org: getActiveOrgId() })
  if (error) throw error
}
