import { useLiveQuery } from 'dexie-react-hooks'

import { agencyFor, officialLanguage, type AgencyInfo } from '@/features/workspace/roadmap-data'
import { useOrgId } from '@/features/org/org-context'
import {
  agencyBlockKey,
  loadRefCountryLookup,
  resolvedAgencyBlock,
  type ResolvedAgencyBlock,
} from './ref-content'

/**
 * Bloc « agence destinataire » résolu pour UN pays (P4.4-pré) : plafond adopté de l'org, ou
 * version ÉPINGLÉE du dossier quand `refVersionId` est passé (`null` ≡ omis : dossier non
 * épinglé → plafond). `undefined` pendant le chargement / sans pays — les appelants gardent
 * alors leur chemin socle code.
 *
 * GARDE-CLÉ (revue #416, M1) : `useLiveQuery` CONSERVE le résultat précédent quand ses deps
 * changent — au changement de pays/version, le bloc du pays PRÉCÉDENT serait servi pendant un
 * aller-retour IDB et pourrait entrer dans une lettre PERSISTÉE. Tout bloc dont la clé ne
 * correspond plus à (pays, version) est rejeté → repli socle code, jamais un autre pays.
 */
export function useRefAgency(
  country: string | undefined,
  refVersionId?: string | null,
): ResolvedAgencyBlock | undefined {
  const orgId = useOrgId()
  const block = useLiveQuery(
    () =>
      country ? resolvedAgencyBlock(country, orgId, refVersionId) : Promise.resolve(undefined),
    [country, orgId, refVersionId],
  )
  if (!country || !block) return undefined
  return block.key === agencyBlockKey(country, refVersionId) ? block : undefined
}

/** Repli STABLE (identité de module) : un repli recréé à chaque render relancerait les useMemo
 *  et effets qui en dépendent pendant toute la fenêtre de chargement (revue #416, m1). */
const CODE_LOOKUP = (country: string): { agency: AgencyInfo; officialLang: string } => ({
  agency: agencyFor(country),
  officialLang: officialLanguage(country),
})

/**
 * Lookup pays → { agence, langue } au PLAFOND de l'org — pour les surfaces LISTE (boîte de
 * réception, recherche) où un hook par ligne serait N abonnements pour la même donnée. Repli
 * code tant que la réplique n'a pas répondu.
 */
export function useRefCountryLookup(): (country: string) => {
  agency: AgencyInfo
  officialLang: string
} {
  const orgId = useOrgId()
  const lookup = useLiveQuery(() => loadRefCountryLookup(orgId), [orgId])
  return lookup ?? CODE_LOOKUP
}
