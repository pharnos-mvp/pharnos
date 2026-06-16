import { useCallback, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'

import { useAuth } from '@/features/auth/auth-context'
import { canManageSubmission } from '@/features/team/team-api'
import { fetchMyMemberships, type OrgMembership } from './org-repository'

const ORG_STORAGE_KEY = 'pharnos.orgId'

interface CurrentOrgState {
  loading: boolean
  orgId: string | null
  memberships: OrgMembership[]
  refresh: () => Promise<void>
}

/**
 * Organisation courante de l'utilisateur authentifié (via TanStack Query).
 *
 * L'org choisie est mise en cache (localStorage) pour rester disponible **hors-ligne** :
 * si le fetch échoue (offline), on retombe sur l'org en cache plutôt que de bloquer l'app.
 */
export function useCurrentOrg(): CurrentOrgState {
  const { session } = useAuth()
  const cachedOrgId = localStorage.getItem(ORG_STORAGE_KEY)

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['memberships', session?.user.id ?? 'anon'],
    queryFn: fetchMyMemberships,
    enabled: Boolean(session),
  })

  const memberships = data ?? []
  const matchedOrgId = memberships.find((m) => m.orgId === cachedOrgId)?.orgId ?? null
  const firstOrgId = memberships[0]?.orgId ?? null
  const orgId = matchedOrgId ?? firstOrgId ?? cachedOrgId

  // Effet « système externe » uniquement (localStorage) — pas de setState.
  useEffect(() => {
    if (orgId) localStorage.setItem(ORG_STORAGE_KEY, orgId)
  }, [orgId])

  const refresh = useCallback(async () => {
    await refetch()
  }, [refetch])

  // On ne bloque pas si une org est déjà en cache (affichage optimiste, refetch en fond).
  const loading = Boolean(session) && isLoading && !cachedOrgId

  return { loading, orgId, memberships, refresh }
}

/** L'utilisateur courant peut-il GÉRER LES SOUMISSIONS (envoi du dossier, réponses, décisions)
 *  dans son org ? Miroir UI de la RLS `current_user_submission_org_ids` (0028) — la RLS reste la
 *  vraie barrière ; ce gating évite seulement d'afficher une action qui renverrait 42501. */
export function useCanManageSubmission(): boolean {
  const { orgId, memberships } = useCurrentOrg()
  return canManageSubmission(memberships.find((m) => m.orgId === orgId)?.role)
}
