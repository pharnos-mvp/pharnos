import type { CorrespondenceRecord } from '@/lib/db'
import type { DossierDisplayStatus } from './correspondence-constants'

/**
 * Boîte de réception réglementaire (mockup CTD Workspace Premium v2) — agrège TOUTE correspondance
 * ACTIVE en une entrée typée, filtrable PAR STATUT (Tous/Accepté/Review/En suspens/Rejeté). PUR,
 * trié du plus récent au plus ancien. Source de vérité = `correspondences` (jamais `dossiers.status`).
 * Le `kind` détermine l'icône + le libellé ; le `status` (de la correspondance) pilote le filtre.
 */
export type InboxKind = 'decision' | 'complement' | 'message' | 'echeance' | 'review'

export interface InboxItem {
  /** correspondenceId. */
  id: string
  dossierId: string
  product: string
  country: string
  kind: InboxKind
  /** Statut de la correspondance — pilote le filtre + la tonalité d'une décision. */
  status: DossierDisplayStatus
  /** Messages reviewer non lus de la conversation. */
  unread: number
  /** Horodatage du signal (ISO) — tri + groupe Aujourd'hui/Plus tôt. */
  at: string
  /** Jours avant l'échéance de réponse (kind `echeance`). */
  deadlineDays?: number
}

const DAY = 86_400_000
const ECHEANCE_WINDOW_DAYS = 7

export function buildInbox(
  correspondences: CorrespondenceRecord[],
  byConversation: Map<string, number>,
  now: Date,
): InboxItem[] {
  const items: InboxItem[] = []
  for (const c of correspondences) {
    if (c.deletedAt !== null) continue
    if (c.status === 'in_review' && c.revokedAt !== null) continue // accès reviewer coupé
    const unread = byConversation.get(c.id) ?? 0
    const base = { id: c.id, dossierId: c.dossierId, product: c.productName, country: c.country }

    if (c.status === 'accepted' || c.status === 'rejected') {
      items.push({
        ...base,
        kind: 'decision',
        status: c.status,
        unread,
        at: c.decidedAt ?? c.updatedAt,
      })
    } else if (c.status === 'suspended') {
      items.push({
        ...base,
        kind: 'complement',
        status: 'suspended',
        unread,
        at: c.decidedAt ?? c.updatedAt,
      })
    } else {
      // in_review : messages non lus > échéance de réponse proche > évaluation en cours.
      const days = c.expiresAt
        ? Math.round((new Date(c.expiresAt).getTime() - now.getTime()) / DAY)
        : null
      if (unread > 0) {
        items.push({ ...base, kind: 'message', status: 'in_review', unread, at: c.updatedAt })
      } else if (days !== null && days >= 0 && days <= ECHEANCE_WINDOW_DAYS) {
        items.push({
          ...base,
          kind: 'echeance',
          status: 'in_review',
          unread: 0,
          at: c.expiresAt as string,
          deadlineDays: days,
        })
      } else {
        items.push({ ...base, kind: 'review', status: 'in_review', unread: 0, at: c.updatedAt })
      }
    }
  }
  return items.sort((a, b) => b.at.localeCompare(a.at))
}

/** Total des entrées non lues (pastille « N non lus »). */
export const inboxUnreadTotal = (items: InboxItem[]): number =>
  items.reduce((n, i) => n + (i.unread > 0 ? 1 : 0), 0)
