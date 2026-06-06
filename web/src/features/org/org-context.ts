import { createContext, useContext } from 'react'

/** Identifiant de l'organisation courante (tenant) fourni à l'arbre applicatif. */
export const OrgContext = createContext<string | null>(null)

export function useOrgId(): string {
  const orgId = useContext(OrgContext)
  if (!orgId) {
    throw new Error('useOrgId doit être utilisé à l’intérieur de <OrgContext.Provider>')
  }
  return orgId
}
