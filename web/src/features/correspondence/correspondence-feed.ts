import type { CorrespondenceRecord } from '@/lib/db'
import type { DossierDisplayStatus } from './correspondence-constants'

/**
 * Fil d'activité « Correspondances » du board CTD (centre de notifications RA) : agrège, par
 * correspondance ACTIVE, le signal le plus pertinent — un message non lu prime, sinon une décision
 * rendue, sinon une review en cours. PUR (aucune dépendance UI/réseau), trié du plus récent au plus
 * ancien. La source de vérité reste `correspondences` (jamais `dossiers.status`).
 */
export type FeedKind = 'message' | 'decision' | 'review'

export interface FeedItem {
  /** correspondenceId. */
  id: string
  dossierId: string
  product: string
  country: string
  kind: FeedKind
  /** Statut de la correspondance (pour la tonalité d'une décision). */
  status: DossierDisplayStatus
  /** Messages reviewer non lus de cette conversation. */
  unread: number
  /** Horodatage du signal (ISO) — tri + temps relatif. */
  at: string
}

export function buildCorrespondenceFeed(
  correspondences: CorrespondenceRecord[],
  byConversation: Map<string, number>,
): FeedItem[] {
  return (
    correspondences
      .filter((c) => c.deletedAt === null)
      // Une correspondance révoquée SANS décision n'est plus une activité (accès reviewer coupé).
      .filter((c) => !(c.status === 'in_review' && c.revokedAt !== null))
      .map((c) => {
        const unread = byConversation.get(c.id) ?? 0
        const decided = c.status !== 'in_review'
        const kind: FeedKind = unread > 0 ? 'message' : decided ? 'decision' : 'review'
        const at = unread > 0 ? c.updatedAt : decided ? (c.decidedAt ?? c.updatedAt) : c.createdAt
        return {
          id: c.id,
          dossierId: c.dossierId,
          product: c.productName,
          country: c.country,
          kind,
          status: c.status,
          unread,
          at,
        }
      })
      .sort((a, b) => b.at.localeCompare(a.at))
  )
}
