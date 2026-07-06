import { db } from './db'

// IndexedDB est un cache PARTAGÉ par origine : sur un navigateur partagé, il ne doit JAMAIS
// laisser voir les données d'un utilisateur au suivant. La RLS serveur reste la barrière (aucun
// fetch hors périmètre n'est possible), mais le cache local DÉJÀ synchronisé doit être purgé à la
// déconnexion ET au changement de compte — sinon un membre scopé (CS1) ou un autre utilisateur voit
// des données rémanentes de la session précédente.

const DATA_OWNER_KEY = 'pharnos.localDataOwner'
const ORG_KEY = 'pharnos.orgId'

/** Vide toutes les tables Dexie porteuses de DONNÉES (miroir exact du schéma `db.ts`). */
async function clearAllTables(): Promise<void> {
  await Promise.all([
    db.products.clear(),
    db.parties.clear(),
    db.outbox.clear(),
    db.documents.clear(),
    db.documentBlobs.clear(),
    db.dossiers.clear(),
    db.generatedDocs.clear(),
    db.proSettings.clear(),
    db.dossierAttachments.clear(),
    db.auditLog.clear(),
    db.docAnalysis.clear(),
    db.correspondences.clear(),
    db.correspondenceMessages.clear(),
    db.shareLinks.clear(),
    db.correspondenceReads.clear(),
    db.savedTemplates.clear(),
    db.variationRequests.clear(),
    db.lifecycleEvents.clear(),
    db.notificationReads.clear(),
  ])
}

/**
 * Efface TOUTES les données locales : tables Dexie + curseurs de sync (`pharnos.lastPull*`) +
 * org active + marqueur de propriétaire. CONSERVE les préférences d'UI (thème, langue, barre
 * latérale) qui ne sont pas des données. Idempotent, tolérant à un `localStorage` indisponible.
 */
// Préfixes de clés `localStorage` porteuses de DONNÉES (curseurs de sync, marqueurs dérivés
// scopés org/dossier). NE contient PAS `pharnos.localDataOwner` : le marqueur de propriétaire
// SURVIT à la purge (voir clearLocalData) pour qu'un changement de compte déclenche TOUJOURS la
// garde — même si une purge précédente a partiellement échoué.
const DATA_KEY_PREFIXES = [
  'pharnos.lastPull', // curseurs de sync pull incrémentale
  'pharnos.sync.', // choix de synchro cloud par org (sync-prefs)
  'pharnos.parties.backfilled.', // marqueur de backfill parties par org
  'pharnos.autostruct.', // structure auto appliquée par dossier
]
const isDataKey = (k: string): boolean =>
  k === ORG_KEY || DATA_KEY_PREFIXES.some((p) => k.startsWith(p))

/** Supprime les clés `localStorage` correspondant à `match` (itération INDEXÉE fiable partout,
 *  ≠ `Object.keys(localStorage)` ; collecte-puis-supprime pour ne pas muter en boucle). */
function removeLocalStorageKeys(match: (k: string) => boolean): void {
  try {
    const toRemove: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k && match(k)) toRemove.push(k)
    }
    toRemove.forEach((k) => localStorage.removeItem(k))
  } catch {
    /* stockage indisponible — non bloquant */
  }
}

export async function clearLocalData(): Promise<void> {
  await clearAllTables()
  removeLocalStorageKeys(isDataKey)
}

/** Propriétaire (id utilisateur) des données actuellement en cache local. */
export function localDataOwner(): string | null {
  try {
    return localStorage.getItem(DATA_OWNER_KEY)
  } catch {
    return null
  }
}

function setLocalDataOwner(userId: string): void {
  try {
    localStorage.setItem(DATA_OWNER_KEY, userId)
  } catch {
    /* non bloquant */
  }
}

/** Purge TOTALE incluant le marqueur de propriétaire (suppression de compte — plus de session à
 *  protéger). Distincte de `clearLocalData` qui conserve le marqueur pour la garde de swap. */
export async function purgeAllLocalData(): Promise<void> {
  await clearLocalData()
  removeLocalStorageKeys((k) => k === DATA_OWNER_KEY)
}

/**
 * Garde de changement de compte : si le cache local appartient à un AUTRE utilisateur (login sans
 * déconnexion propre = swap de session sur le même navigateur), on purge AVANT d'exposer la moindre
 * donnée, puis on marque le nouveau propriétaire. À appeler pendant la résolution d'auth, avant de
 * publier la session. Retourne `true` si une purge a eu lieu.
 *
 * NB : on ne peut PAS flusher l'outbox de l'ancien utilisateur ici (la session est déjà celle du
 * nouveau — pousser sous son JWT mésattribuerait). Une écriture hors-ligne non synchronisée de
 * l'ancien compte est donc perdue sur ce swap — inhérent au partage de machine sans logout propre.
 * Le marqueur `pharnos.localDataOwner` SURVIT à `clearLocalData` : ainsi un swap déclenche toujours
 * la purge, même si une purge de déconnexion précédente a partiellement échoué.
 */
export async function reconcileLocalDataOwner(userId: string): Promise<boolean> {
  const prev = localDataOwner()
  if (prev && prev !== userId) {
    await clearLocalData()
    setLocalDataOwner(userId)
    return true
  }
  if (prev !== userId) setLocalDataOwner(userId)
  return false
}
