import { useLiveQuery } from 'dexie-react-hooks'

import { agencyFor, officialLanguage, type AgencyInfo } from '@/features/workspace/roadmap-data'
import { useOrgId } from '@/features/org/org-context'
import { loadRefCountryLookup, resolvedAgencyBlock, type ResolvedAgencyBlock } from './ref-content'

/**
 * Bloc « agence destinataire » résolu pour UN pays (P4.4-pré) : plafond adopté de l'org, ou
 * version ÉPINGLÉE du dossier quand `refVersionId` est passé (`null` = dossier non épinglé →
 * plafond). `undefined` pendant le chargement / sans pays — les appelants gardent alors leur
 * chemin socle code (même contenu tant que la parité seed==code tient : aucun flash).
 */
export function useRefAgency(
  country: string | undefined,
  refVersionId?: string | null,
): ResolvedAgencyBlock | undefined {
  const orgId = useOrgId()
  return useLiveQuery(
    () =>
      country ? resolvedAgencyBlock(country, orgId, refVersionId) : Promise.resolve(undefined),
    [country, orgId, refVersionId],
  )
}

/**
 * Lookup pays → { agence, langue } au PLAFOND de l'org — pour les surfaces LISTE (boîte de
 * réception, recherche) où un hook par ligne est impossible. Repli code tant que la réplique
 * n'a pas répondu.
 */
export function useRefCountryLookup(): (country: string) => {
  agency: AgencyInfo
  officialLang: string
} {
  const orgId = useOrgId()
  const lookup = useLiveQuery(() => loadRefCountryLookup(orgId), [orgId])
  return (
    lookup ??
    ((country: string) => ({ agency: agencyFor(country), officialLang: officialLanguage(country) }))
  )
}
