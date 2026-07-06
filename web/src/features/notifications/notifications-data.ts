import type { ActionItem } from '@/features/dashboard/dashboard-data'
import type { LifecycleEventRecord } from '@/lib/db'

/**
 * Centre de notifications (cloche) — dérivation PURE, zéro table serveur (jalon cloche, Incrément 1).
 *
 * Deux flux par DIRECTION :
 *   • REÇU (badge) = ce qui ARRIVE et demande une action → `buildActions` (dashboard) est déjà la file
 *     priorisée « actions requises » (expirations, complément, réponses non lues, attente agence,
 *     non-conforme). On la réutilise telle quelle : source unique, dédupliquée, avec `id`/`href` stables.
 *   • ENVOYÉ (info, non badgé) = ce qui PART du labo → journal `lifecycle_events` (types sortants).
 *     Traçabilité des relances (auto/manuelle) et jalons de soumission.
 *
 * Non-lu = high-water mark local par ids (marqueur `notificationReads`, par appareil) : un item Reçu
 * dont l'`id` n'a pas été acquitté au dernier marquage compte pour le badge.
 */

/** Clé de la ligne unique du marqueur de lecture (`notificationReads`). */
export const NOTIF_READ_ID = 'recu'

export type SentKind =
  | 'reminder_auto'
  | 'reminder_manual'
  | 'deposited'
  | 'submitted'
  | 'authority_response'

export interface NotifEnvoye {
  /** Id de l'événement de la spine. */
  id: string
  kind: SentKind
  /** Nom du produit/dossier (résolu depuis `dossiers`). */
  label: string
  /** Vers le parcours du dossier. */
  href: string
  /** Horodatage réel de l'événement (ISO) — tri décroissant. */
  at: string
}

/** Types d'événements de la spine considérés « envoyés par le labo » (onglet Envoyé). */
const SENT_TYPES = new Set(['reminder_sent', 'deposited', 'submitted', 'authority_response'])

/** Mappe les événements sortants du journal en items « Envoyé », des plus récents aux plus anciens. */
export function buildEnvoye(
  events: LifecycleEventRecord[],
  dossierName: Map<string, string>,
  limit = 25,
): NotifEnvoye[] {
  const out: NotifEnvoye[] = []
  for (const e of events) {
    if (!SENT_TYPES.has(e.type)) continue
    let kind: SentKind
    if (e.type === 'reminder_sent') {
      // actor 'system' = relance AUTO du cron ; sinon relance MANUELLE d'un gestionnaire.
      kind = e.actorId === 'system' ? 'reminder_auto' : 'reminder_manual'
    } else if (e.type === 'deposited') {
      kind = 'deposited'
    } else if (e.type === 'submitted') {
      kind = 'submitted'
    } else {
      kind = 'authority_response'
    }
    out.push({
      id: e.id,
      kind,
      label: dossierName.get(e.dossierId) ?? '—',
      href: `/workspace/${e.dossierId}/roadmap`,
      at: e.occurredAt,
    })
  }
  return out.sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit)
}

/** Nombre d'items « à traiter » (Reçu) non encore acquittés — pilote la pastille du badge. */
export function unreadCount(recu: ActionItem[], seenIds: string[]): number {
  const seen = new Set(seenIds)
  return recu.reduce((n, i) => (seen.has(i.id) ? n : n + 1), 0)
}
