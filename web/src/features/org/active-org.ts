// Org ACTIVE de la session (CS1) — source unique partagée entre le hook React
// (`useCurrentOrg`) et les utilitaires hors React (RPC self-scopées, header Edge).
// La valeur est entretenue par `useCurrentOrg` (résolution appartenances + cache offline) ;
// ici on ne fait que la LIRE de façon synchrone. La vérification d'appartenance reste côté
// SQL (`caller_org_id(p_org)`, migration 0049) — fail-closed si l'org déclarée est étrangère.

export const ORG_STORAGE_KEY = 'pharnos.orgId'

/** Org active (synchrone, hors React). */
export function getActiveOrgId(): string | null {
  try {
    return localStorage.getItem(ORG_STORAGE_KEY)
  } catch {
    return null
  }
}

/**
 * Bascule vers une autre organisation puis RECHARGE l'application sur la racine :
 * stores Dexie, caches TanStack, souscriptions Realtime et gardes de rôle sont tous
 * dérivés de l'org active — un document frais est plus sûr qu'une invalidation partielle.
 */
export function switchActiveOrg(orgId: string): void {
  try {
    localStorage.setItem(ORG_STORAGE_KEY, orgId)
  } catch {
    /* stockage indisponible : la navigation retombera sur la 1ʳᵉ org */
  }
  window.location.assign('/')
}

/** Header déclaratif d'org active pour les Edge Functions (quota IA — vérifié membre côté SQL). */
export function activeOrgHeaders(): Record<string, string> {
  const id = getActiveOrgId()
  return id ? { 'x-pharnos-org': id } : {}
}
