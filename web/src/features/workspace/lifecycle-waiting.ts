import type { Translatable } from '@/lib/i18n-context'
import { LIFECYCLE_STAGES, type LifecycleState, type LifecycleStatus } from './lifecycle-constants'

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
  /** Acteur attendu (étiquette de l'étape courante — Agent local / Agence nat.). */
  actor: Translatable
}

/**
 * Statuts où le dossier attend un TIERS (relançable). Les autres sont soit du travail PROPRE au
 * labo (montage, complément requis), soit terminaux (rejeté, AMM rendue) — pas de relance.
 */
const WAITING_STATUSES: ReadonlySet<LifecycleStatus> = new Set([
  'in_review', // décision de l'agent local attendue
  'accepted', // réception par l'agent local attendue (Dépôt)
  'submitting', // dépôt à l'agence nationale attendu
  'in_notification', // instruction de l'agence en cours
])

const STAGE_ACTOR = new Map(LIFECYCLE_STAGES.map((s) => [s.id, s.actor]))
const DAY_MS = 86_400_000

/** Ancienneté de l'attente à l'étape courante — `null` si le dossier n'attend pas un tiers. */
export function deriveStageWaiting(state: LifecycleState, now: Date): StageWaiting | null {
  if (!WAITING_STATUSES.has(state.status)) return null
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
    actor: STAGE_ACTOR.get(state.currentStageId) ?? { fr: 'Tiers', en: 'Third party' },
  }
}
