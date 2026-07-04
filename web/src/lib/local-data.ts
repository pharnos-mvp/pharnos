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
  ])
}

/**
 * Efface TOUTES les données locales : tables Dexie + curseurs de sync (`pharnos.lastPull*`) +
 * org active + marqueur de propriétaire. CONSERVE les préférences d'UI (thème, langue, barre
 * latérale) qui ne sont pas des données. Idempotent, tolérant à un `localStorage` indisponible.
 */
export async function clearLocalData(): Promise<void> {
  await clearAllTables()
  try {
    // Itération INDEXÉE (fiable partout, ≠ `Object.keys(localStorage)` qui n'énumère pas les
    // entrées Storage en jsdom) ; on collecte avant de supprimer pour ne pas muter en boucle.
    const toRemove: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k && (k.startsWith('pharnos.lastPull') || k === ORG_KEY || k === DATA_OWNER_KEY)) {
        toRemove.push(k)
      }
    }
    toRemove.forEach((k) => localStorage.removeItem(k))
  } catch {
    /* stockage indisponible — non bloquant */
  }
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

/**
 * Garde de changement de compte : si le cache local appartient à un AUTRE utilisateur (login sans
 * déconnexion propre = swap de session sur le même navigateur), on purge AVANT d'exposer la moindre
 * donnée, puis on marque le nouveau propriétaire. À appeler pendant la résolution d'auth, avant de
 * publier la session. Retourne `true` si une purge a eu lieu.
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
