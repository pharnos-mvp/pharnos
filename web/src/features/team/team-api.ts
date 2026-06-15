import type { Translatable } from '@/lib/i18n-context'
import { getSupabase } from '@/lib/supabase'

// Gestion d'équipe (jalon M4). Lecture/mutations via RPC self-gated ; l'envoi d'e-mail
// d'invitation via l'Edge `team` (qui crée l'invitation par la même RPC gated puis poste à Resend).

export type OrgRole = 'admin' | 'ra_officer' | 'reviewer'

export interface TeamMember {
  user_id: string
  email: string
  role: OrgRole
  is_you: boolean
  joined_at: string
}

export interface PendingInvite {
  id: string
  email: string
  role: OrgRole
  expires_at: string
  created_at: string
}

export interface TeamData {
  members: TeamMember[]
  pending: PendingInvite[]
}

export interface AcceptResult {
  ok: boolean
  reason?: string
  org_id?: string
  role?: OrgRole
  invited_email?: string
}

export const ROLE_LABEL: Record<OrgRole, Translatable> = {
  admin: { fr: 'Administrateur', en: 'Administrator' },
  ra_officer: { fr: 'Éditeur', en: 'Editor' },
  reviewer: { fr: 'Lecteur', en: 'Reader' },
}

export const ROLE_HINT: Record<OrgRole, Translatable> = {
  admin: { fr: 'Gère l’équipe et tout le contenu', en: 'Manages the team and all content' },
  ra_officer: { fr: 'Crée et modifie le contenu', en: 'Creates and edits content' },
  reviewer: { fr: 'Lecture seule', en: 'Read-only' },
}

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const supabase = await getSupabase()
  if (!supabase) throw new Error('connexion requise')
  const { data, error } = await supabase.rpc(fn, args)
  if (error) throw new Error(error.message)
  return data as T
}

export const teamApi = {
  list: (orgId: string) => rpc<TeamData>('team_list', { p_org: orgId }),
  setRole: (orgId: string, userId: string, role: OrgRole) =>
    rpc<{ ok: boolean; reason?: string }>('team_set_role', {
      p_org: orgId,
      p_user: userId,
      p_role: role,
    }),
  removeMember: (orgId: string, userId: string) =>
    rpc<{ ok: boolean; reason?: string }>('team_remove_member', { p_org: orgId, p_user: userId }),
  revokeInvite: (id: string) =>
    rpc<{ ok: boolean; reason?: string }>('team_revoke_invitation', { p_id: id }),
  accept: (token: string) => rpc<AcceptResult>('accept_invitation', { p_token: token }),
  invite: async (orgId: string, email: string, role: OrgRole) => {
    const supabase = await getSupabase()
    if (!supabase) throw new Error('connexion requise')
    const { data, error } = await supabase.functions.invoke('team', {
      body: { orgId, email, role },
    })
    if (error) {
      const status = (error as { context?: Response }).context?.status
      if (status === 403) throw new Error('forbidden')
      throw new Error((error as Error).message)
    }
    return data as { ok: boolean; emailSent: boolean }
  },
}
