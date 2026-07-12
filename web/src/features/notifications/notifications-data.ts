import type { ActionItem } from '@/features/dashboard/dashboard-data'
import type { LifecycleEventRecord } from '@/lib/db'
import type { Lang } from '@/lib/i18n-context'

const DAY_MS = 86_400_000

/**
 * Formatage RELATIF court d'une date pour les lignes de la cloche — passé ET futur (les échéances
 * d'expiration sont dans le futur) : « aujourd'hui / hier / demain / il y a N j / dans N j ». Repli
 * sur la date absolue au-delà de 60 j (évite « il y a 400 j »). `''` si date illisible. Pur → testé.
 */
export function formatRelative(iso: string, now: Date, lang: Lang): string {
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return ''
  const diff = Math.round((t - now.getTime()) / DAY_MS) // > 0 futur, < 0 passé
  const abs = Math.abs(diff)
  if (abs > 60) return new Date(t).toLocaleDateString(lang === 'fr' ? 'fr-FR' : 'en-GB')
  if (diff === 0) return lang === 'fr' ? "aujourd'hui" : 'today'
  if (diff === 1) return lang === 'fr' ? 'demain' : 'tomorrow'
  if (diff === -1) return lang === 'fr' ? 'hier' : 'yesterday'
  if (diff > 0) return lang === 'fr' ? `dans ${diff} j` : `in ${diff} d`
  return lang === 'fr' ? `il y a ${abs} j` : `${abs} d ago`
}

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

/**
 * Ordonne la file « Reçu » POUR LA CLOCHE : du plus récent au plus ancien (demande CEO).
 * `buildActions` la rend priorisée par URGENCE (bon pour le panneau « actions requises » du
 * Dashboard, qu'on NE touche pas) ; la cloche, elle, veut un ordre chronologique. Tri STABLE par
 * `date` décroissante. Tous les types d'`ActionItem` portent aujourd'hui une date (échéance, dernier
 * message, décision « complément », analyse Regafy) ; le repli « items sans date en dernier, dans
 * leur ordre d'origine » ne reste qu'un garde-fou défensif. PUR (copie de l'entrée) → testable.
 */
export function sortRecuByRecency(recu: ActionItem[]): ActionItem[] {
  return [...recu].sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))
}
