import { db } from './db'

// IndexedDB est un cache PARTAGÉ par origine : sur un navigateur partagé, il ne doit JAMAIS
// laisser voir les données d'un utilisateur au suivant. La RLS serveur reste la barrière (aucun
// fetch hors périmètre n'est possible), mais le cache local DÉJÀ synchronisé doit être purgé à la
// déconnexion ET au changement de compte — sinon un membre scopé (CS1) ou un autre utilisateur voit
// des données rémanentes de la session précédente.

const DATA_OWNER_KEY = 'pharnos.localDataOwner'
const ORG_KEY = 'pharnos.orgId'

/** Vide toutes les tables Dexie porteuses de DONNÉES (miroir exact du schéma `db.ts`). */
async function clearAllTables(opts?: { preserveNotifReads?: boolean }): Promise<void> {
  const jobs = [
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
    // Référentiel réglementaire (0071) : contenu GLOBAL public (aucune donnée tenant) — purgé
    // quand même pour garder le miroir exact du schéma ; re-tiré au prochain cycle (~20 Ko).
    db.refVersions.clear(),
    db.refEntries.clear(),
    // Adoptions (0072) : donnée TENANT (quelle version l'org applique) → purge obligatoire.
    db.orgRefAdoptions.clear(),
  ]
  // Marqueur de lecture de la cloche (`notificationReads`, local par appareil, JAMAIS re-synchronisé) :
  // CONSERVÉ à la déconnexion (`preserveNotifReads`) pour qu'une reconnexion du MÊME compte ne rejoue
  // pas en « non lu » des notifications déjà acquittées — elles sont re-dérivées des données re-syncées,
  // mais leur acquittement ne l'est pas. Il reste PURGÉ au changement de compte (garde de swap) : un
  // autre utilisateur ne doit jamais hériter des acquittements du précédent.
  if (!opts?.preserveNotifReads) jobs.push(db.notificationReads.clear())
  await Promise.all(jobs)
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

export async function clearLocalData(opts?: { preserveNotifReads?: boolean }): Promise<void> {
  await clearAllTables(opts)
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
  // Ancre de propriétaire absente (`prev === null`) : un marqueur de cloche CONSERVÉ à la déconnexion
  // (`preserveNotifReads`) pourrait subsister sans être attribuable à `userId` — cas où `localStorage`
  // a été évincé indépendamment d'IndexedDB (coins ITP/quota). On le purge par SÛRETÉ avant toute
  // exposition : aucun héritage d'acquittements d'un compte à l'autre (modèle navigateur partagé, CS1).
  // No-op sur une vraie 1re connexion (table déjà vide) et ne touche PAS aux autres données locales
  // pré-existantes (travail hors-ligne → login = intégrité ALCOA, invariant conservé).
  if (prev === null) await db.notificationReads.clear()
  if (prev !== userId) setLocalDataOwner(userId)
  return false
}
