import { db, type CorrespondenceMessageRecord, type DossierRecord } from '@/lib/db'

import { countUnread } from './correspondence-reads'
import { listCorrespondences } from './correspondence-repository'

/**
 * Compteur non-lus de la Boîte de réception — module VOLONTAIREMENT séparé de
 * `correspondence-inbox.ts` : il est importé par le shell (badge nav, bundle d'ENTRÉE) et ne
 * doit pas y entraîner `deriveLifecycle`/les constantes lifecycle (budget `index-*.js`).
 */

/** Dossier visible dans l'inbox : jamais trash/purgé (les ARCHIVÉS restent — boîte mail). */
export const isInboxDossier = (d: DossierRecord | undefined): d is DossierRecord =>
  d !== undefined && d.deletedAt === null && !d.purgedAt

/**
 * Total des messages non lus de la Boîte de réception (badge de l'onglet nav) — même périmètre
 * que `listInboxRows` (dossiers trash/purgés exclus) SANS la dérivation lifecycle : ce compteur
 * vit dans le shell (recalculé à chaque écriture Dexie) → on le garde au strict nécessaire.
 */
export async function countInboxUnread(orgId: string): Promise<number> {
  const correspondences = await listCorrespondences(orgId)
  if (correspondences.length === 0) return 0
  const dossierIds = [...new Set(correspondences.map((c) => c.dossierId))]
  const [dossiers, messages, reads] = await Promise.all([
    db.dossiers.bulkGet(dossierIds),
    db.correspondenceMessages
      .where('correspondenceId')
      .anyOf(correspondences.map((c) => c.id))
      .toArray(),
    db.correspondenceReads.toArray(),
  ])
  const visibleDossiers = new Set(dossierIds.filter((_, i) => isInboxDossier(dossiers[i])))
  const messagesByCorr = new Map<string, CorrespondenceMessageRecord[]>()
  for (const m of messages) {
    const arr = messagesByCorr.get(m.correspondenceId)
    if (arr) arr.push(m)
    else messagesByCorr.set(m.correspondenceId, [m])
  }
  const lastSeen = new Map(reads.map((r) => [r.id, r.lastSeenAt]))
  return correspondences
    .filter((c) => visibleDossiers.has(c.dossierId))
    .reduce((n, c) => n + countUnread(messagesByCorr.get(c.id) ?? [], lastSeen.get(c.id)), 0)
}
