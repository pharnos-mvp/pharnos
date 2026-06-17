// Préférence de synchro cloud par org, mise en CACHE local pour être lue par les modules de sync
// (non-React, async). Écrite par l'app-shell quand `my_org_plan.sync_enabled` est connu. Défaut
// (absente) = synchro ACTIVE → aucune org ne cesse de synchroniser par accident (fail-safe).

const KEY = (orgId: string) => `pharnos.sync.${orgId}`

/** Met en cache le choix de synchro de l'org (depuis my_org_plan). */
export function setSyncEnabledCache(orgId: string, enabled: boolean): void {
  try {
    localStorage.setItem(KEY(orgId), enabled ? '1' : '0')
  } catch {
    /* no-op */
  }
}

/** L'org synchronise-t-elle vers le cloud ? Défaut ACTIF (seul un '0' explicite désactive). */
export function isSyncEnabled(orgId: string): boolean {
  try {
    return localStorage.getItem(KEY(orgId)) !== '0'
  } catch {
    return true
  }
}
