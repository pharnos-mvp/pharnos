import type { Translatable } from '@/lib/i18n-context'
import type { LifecycleState, LifecycleStatus } from './lifecycle-constants'

/**
 * « En attente depuis N jours » (jalon M5, phase 1 — relance MANUELLE) : dérivation PURE de
 * l'ancienneté de l'étape courante quand le dossier attend un TIERS (agent local ou agence
 * nationale). Base du compteur = la dernière activité du journal (append-only) — une relance
 * journalisée (`reminder_sent`) est une activité : elle REPART le compteur (« Relancé il y a N j »),
 * ce qui évite de harceler et trace chaque relance (ALCOA++).
 *
 * Phase 2 (LOT 10) : relances AUTOMATIQUES (cron Edge + seuils par pays) — même événement,
 * `actor_id = 'system'`. Rien n'est stocké : le badge se recalcule à chaque rendu.
 */

export interface StageWaiting {
  /** ISO de la dernière activité du journal — base du compteur. */
  since: string
  /** Jours ENTIERS écoulés depuis la dernière activité (≥ 0). */
  days: number
  /** La dernière activité est déjà une relance → l'UI affiche « Relancé il y a N j ». */
  lastIsReminder: boolean
  /** Partie attendue, FLÉCHIE pour la phrase (« En attente de … ») — revue de M5. */
  actor: Translatable
}

/**
 * Statuts où le dossier attend un TIERS (relançable) → partie attendue, forme fléchie pour la
 * phrase du badge. Les autres statuts sont soit du travail PROPRE au labo (montage, complément
 * requis), soit terminaux (rejeté, AMM rendue) — pas de relance.
 */
const WAITING_PARTY: Partial<Record<LifecycleStatus, Translatable>> = {
  in_review: { fr: 'l’agent local', en: 'the local agent' }, // décision attendue
  accepted: { fr: 'l’agent local', en: 'the local agent' }, // réception attendue (Dépôt)
  submitting: { fr: 'l’agent local', en: 'the local agent' }, // dépôt à l'agence attendu
  in_notification: { fr: 'l’agence nationale', en: 'the national agency' }, // instruction en cours
}

const DAY_MS = 86_400_000

/**
 * Ancienneté de l'attente à l'étape courante — `null` si le dossier n'attend pas un tiers.
 *
 * Contrat payload `reminder_sent` : M5 (manuel) écrit `{ stage, waiting_days }` ; la relance AUTO
 * (LOT 10, actor_id 'system') doit RÉUTILISER `waiting_days` (+ `threshold_days` pour le seuil
 * déclencheur) — `journalDetail` lit `waiting_days`, un seul dialecte de payload.
 */
export function deriveStageWaiting(state: LifecycleState, now: Date): StageWaiting | null {
  const party = WAITING_PARTY[state.status]
  if (!party) return null
  // Le journal est trié chronologiquement (tie-breaks déterministes) : la dernière entrée = la
  // dernière activité réelle, toutes sources confondues (dossier, correspondance, événement).
  const last = state.journal[state.journal.length - 1]
  if (!last) return null
  const elapsed = now.getTime() - Date.parse(last.at)
  return {
    since: last.at,
    // Événement futur-daté (saisie tolérante) ou horloge locale en retard → 0, jamais négatif.
    days: Math.max(0, Math.floor(elapsed / DAY_MS)),
    lastIsReminder: last.key === 'reminder_sent',
    actor: party,
  }
}
