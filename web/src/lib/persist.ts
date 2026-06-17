/**
 * Demande au navigateur de rendre le stockage local (IndexedDB) PERSISTANT — non purgeable sous
 * pression disque. C'est la durabilité des données hors-ligne (dossiers, brouillons, blobs) qui sous-tend
 * la promesse confidentialité / local-first de Pharnos. Best-effort, idempotent, silencieux si refusé ou
 * non supporté. À appeler lors d'une SAUVEGARDE de données critiques (geste utilisateur) — pas au chargement
 * (les navigateurs ignorent l'appel hors engagement). Réf. MDN/web.dev « persistent storage ».
 */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (!navigator.storage?.persist) return false
    if (await navigator.storage.persisted()) return true
    return await navigator.storage.persist()
  } catch {
    return false
  }
}
