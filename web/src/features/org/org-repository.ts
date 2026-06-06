import { getSupabase } from '@/lib/supabase'

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
