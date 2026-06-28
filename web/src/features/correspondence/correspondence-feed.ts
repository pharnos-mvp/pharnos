import type { CorrespondenceRecord } from '@/lib/db'
import type { DossierDisplayStatus } from './correspondence-constants'

/**
 * Boîte de réception réglementaire (mockup CTD Workspace Premium) — agrège, par correspondance
 * ACTIVE, le SIGNAL VENU DE L'AGENCE : décision (octroi/rejet), complément demandé, nouveaux
 * messages, ou échéance de réponse proche. PUR, trié du plus récent au plus ancien. Une
 * correspondance `in_review` sans message ni échéance proche n'est pas une entrée d'inbox
 * (rien de l'agence à traiter). Source de vérité = `correspondences` (jamais `dossiers.status`).
 */
export type InboxKind = 'decision' | 'complement' | 'message' | 'echeance'

export interface InboxItem {
  /** correspondenceId. */
  id: string
  dossierId: string
  product: string
  country: string
  kind: InboxKind
  /** Statut de la correspondance (tonalité d'une décision : accepted/rejected). */
  status: DossierDisplayStatus
  /** Messages reviewer non lus de la conversation. */
  unread: number
  /** Horodatage du signal (ISO) — tri + groupe Aujourd'hui/Plus tôt. */
  at: string
  /** Jours avant l'échéance de réponse (kind `echeance`). */
  deadlineDays?: number
}

const DAY = 86_400_000

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
    } else if (unread > 0) {
      items.push({ ...base, kind: 'message', status: 'in_review', unread, at: c.updatedAt })
    } else if (c.expiresAt) {
      const days = Math.round((new Date(c.expiresAt).getTime() - now.getTime()) / DAY)
      if (days >= 0 && days <= 7)
        items.push({
          ...base,
          kind: 'echeance',
          status: 'in_review',
          unread: 0,
          at: c.expiresAt,
          deadlineDays: days,
        })
    }
  }
  return items.sort((a, b) => b.at.localeCompare(a.at))
}

/** Total des entrées non lues (pastille « N non lus »). */
export const inboxUnreadTotal = (items: InboxItem[]): number =>
  items.reduce((n, i) => n + (i.unread > 0 ? 1 : 0), 0)
