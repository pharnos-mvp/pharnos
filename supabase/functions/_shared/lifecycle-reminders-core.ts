// Relances automatiques du cycle de vie (LOT 10, phase 2 du jalon M5) — cœur PUR, testé sans I/O.
//
// Contrat (verrouillé par M5, `web/src/features/workspace/lifecycle-waiting.ts`) :
//   • Même événement que la relance manuelle : `reminder_sent`, payload { stage, waiting_days,
//     threshold_days }, un seul dialecte — `journalDetail` côté web lit ces clés.
//   • `actor_id = 'system'` → le journal affiche « Système » (override de buildJournal, M2).
//   • Le compteur d'attente = la DERNIÈRE entrée du journal (toutes sources) : une relance
//     journalisée REPART le compteur — l'auto-relance est donc AUTO-IDEMPOTENTE (après émission,
//     waiting_days retombe à 0 : pas de double tir si le cron rejoue le même jour).
//
// MIROIR CONTRACTUEL de la dérivation web (`deriveLifecycle` + `deriveStageWaiting`) pour le
// SOUS-ENSEMBLE « le dossier attend un tiers ». Le code web reste canonique ; toute évolution
// de la dérivation là-bas doit être répercutée ici (les tests Deno rejouent les mêmes scénarios
// que lifecycle-waiting.test.ts). Pourquoi une copie : les Edge Functions ne peuvent pas importer
// `web/src` (racines de déploiement distinctes), et la logique « attente » se linéarise en une
// échelle courte — la monotonie aval→amont de deriveLifecycle est PRÉSERVÉE par l'ordre des tests.

export interface ReminderDossierRow {
  id: string
  org_id: string
  product_name: string
  country: string
  created_at: string
}

export interface ReminderCorrRow {
  id: string
  dossier_id: string
  status: string // 'in_review' | 'accepted' | 'suspended' | 'rejected'
  created_at: string
  updated_at: string
  decided_at: string | null
  revoked_at: string | null
  deleted_at: string | null
  sender_email: string
}

export interface ReminderEventRow {
  dossier_id: string
  type: string
  actor_id: string
  occurred_at: string
}

export interface ReminderDecisionMsgRow {
  correspondence_id: string
  created_at: string
}

// ── Seuils par pays (jours SANS ACTIVITÉ avant relance auto) ─────────────────────────────────────
// Référentiel maintenu par PR (même politique que lifecycle-config.ts : invariant codé en dur,
// variable en config). Deux familles d'attente :
//   • agent  : on attend l'AGENT LOCAL (revue, réception, dépôt à l'agence) — cycles courts.
//   • agency : on attend l'AGENCE NATIONALE (instruction) — cycles réglementaires longs.
// Défauts prudents validables par le CEO (expert RA) ; les overrides par pays s'ajoutent ici.

export interface ReminderThresholds {
  agentDays: number
  agencyDays: number
}

export const DEFAULT_THRESHOLDS: ReminderThresholds = { agentDays: 14, agencyDays: 30 }

/** Overrides PAR PAYS (codes ISO alpha-2, mêmes clés que lifecycle-config.ts). Vide au départ :
 * les défauts s'appliquent partout ; on affine par PR quand le CEO fixe des SLA réels par agence. */
export const COUNTRY_THRESHOLDS: Record<string, Partial<ReminderThresholds>> = {}

export function thresholdsFor(country: string): ReminderThresholds {
  return { ...DEFAULT_THRESHOLDS, ...COUNTRY_THRESHOLDS[country] }
}

/** Noms d'affichage des pays MVP pour l'e-mail de relance (display-only ; repli = code ISO). */
export const COUNTRY_NAMES: Record<string, { fr: string; en: string }> = {
  BJ: { fr: 'Bénin', en: 'Benin' },
  BF: { fr: 'Burkina Faso', en: 'Burkina Faso' },
  CI: { fr: 'Côte d’Ivoire', en: 'Côte d’Ivoire' },
  GH: { fr: 'Ghana', en: 'Ghana' },
  GW: { fr: 'Guinée-Bissau', en: 'Guinea-Bissau' },
  ML: { fr: 'Mali', en: 'Mali' },
  NE: { fr: 'Niger', en: 'Niger' },
  NG: { fr: 'Nigéria', en: 'Nigeria' },
  SN: { fr: 'Sénégal', en: 'Senegal' },
  TG: { fr: 'Togo', en: 'Togo' },
}

// ── Dérivation ───────────────────────────────────────────────────────────────────────────────────

/** Statuts où le dossier attend un TIERS (calque de WAITING_PARTY, lifecycle-waiting.ts). */
export type WaitingStatus = 'in_review' | 'accepted' | 'submitting' | 'in_notification'

export interface ReminderPlan {
  dossierId: string
  orgId: string
  status: WaitingStatus
  /** Étape courante (payload.stage — mêmes ids que LIFECYCLE_STAGE_ORDER côté web). */
  stage: 'revue' | 'depot' | 'soumission' | 'notifications'
  waitingOn: 'agent' | 'agency'
  /** Jours ENTIERS sans activité (≥ 0) — base = dernière entrée du journal. */
  waitingDays: number
  /** Seuil (jours) qui a déclenché la relance — journalisé dans le payload (self-describing). */
  thresholdDays: number
  /** Adresse côté labo (expéditeur de la dernière correspondance active) — cible de l'e-mail. */
  senderEmail: string | null
}

const DAY_MS = 86_400_000
/** Au-delà de N relances système consécutives SANS activité humaine, on cesse de relancer
 * (dossier dormant) — la première activité humaine ré-arme le mécanisme. */
export const MAX_CONSECUTIVE_SYSTEM_REMINDERS = 3

/** Règle ADR-0003 (identique à `isActive` web) : une correspondance révoquée SANS décision
 * n'existe plus pour la dérivation. */
const isActiveCorr = (c: ReminderCorrRow): boolean =>
  c.deleted_at === null && !(c.status === 'in_review' && c.revoked_at !== null)

const parseTime = (iso: string | null): number | null => {
  if (!iso) return null
  const t = Date.parse(iso)
  return Number.isFinite(t) ? t : null
}

/**
 * Décide si CE dossier doit être relancé maintenant — `null` sinon (pas en attente d'un tiers,
 * seuil non atteint, ou mécanisme en pause après MAX relances système consécutives).
 *
 * Toutes les entrées sont les lignes BRUTES (snake_case) du dossier concerné ; la fonction est
 * pure et déterministe (le temps est un paramètre).
 */
export function planReminder(input: {
  dossier: ReminderDossierRow
  correspondences: ReminderCorrRow[]
  events: ReminderEventRow[]
  decisionMessages: ReminderDecisionMsgRow[]
  now: Date
}): ReminderPlan | null {
  const { dossier, now } = input
  const events = input.events.filter((e) => e.dossier_id === dossier.id)
  const active = input.correspondences
    .filter((c) => c.dossier_id === dossier.id && isActiveCorr(c))
    .sort((a, b) => a.created_at.localeCompare(b.created_at))

  const has = (type: string): boolean => events.some((e) => e.type === type)

  // Décision courante = statut de la DERNIÈRE correspondance active (ADR-0003) — `null` si en revue.
  const latest = active[active.length - 1]
  const decision = latest && latest.status !== 'in_review' ? latest.status : null

  // Échelle linéarisée de deriveLifecycle (l'aval d'abord = monotonie préservée).
  let status: WaitingStatus
  let stage: ReminderPlan['stage']
  let waitingOn: ReminderPlan['waitingOn']
  if (has('amm_granted') || has('amm_refused')) {
    return null // terminal
  } else if (has('submitted') || has('authority_query') || has('authority_response')) {
    status = 'in_notification'
    stage = 'notifications'
    waitingOn = 'agency'
  } else if (has('deposited')) {
    status = 'submitting'
    stage = 'soumission'
    waitingOn = 'agent'
  } else if (decision === 'accepted') {
    status = 'accepted'
    stage = 'depot'
    waitingOn = 'agent'
  } else if (decision === 'suspended' || decision === 'rejected') {
    return null // la balle est côté labo (complément) ou terminal (rejet) — pas de tiers à relancer
  } else if (active.length > 0) {
    status = 'in_review'
    stage = 'revue'
    waitingOn = 'agent'
  } else {
    return null // montage — travail propre au labo
  }

  // ── Horloge du journal (calque de buildJournal : dossier + correspondances + décisions + événements)
  const activeIds = new Set(active.map((c) => c.id))
  const msgTimesByCorr = new Map<string, number[]>()
  for (const m of input.decisionMessages) {
    if (!activeIds.has(m.correspondence_id)) continue
    const t = parseTime(m.created_at)
    if (t === null) continue
    const arr = msgTimesByCorr.get(m.correspondence_id)
    if (arr) arr.push(t)
    else msgTimesByCorr.set(m.correspondence_id, [t])
  }

  const humanTimes: number[] = [] // tout SAUF les relances système (ré-arme le cap)
  const allTimes: number[] = [] // tout, relances comprises (base du compteur — parité badge M5)
  const push = (t: number | null, human: boolean) => {
    if (t === null) return
    allTimes.push(t)
    if (human) humanTimes.push(t)
  }

  push(parseTime(dossier.created_at), true)
  for (const c of active) {
    push(parseTime(c.created_at), true)
    const msgs = msgTimesByCorr.get(c.id) ?? []
    for (const t of msgs) push(t, true)
    // Repli parité web : correspondance décidée sans message de décision synchronisé.
    if (msgs.length === 0 && c.status !== 'in_review') {
      push(parseTime(c.decided_at) ?? parseTime(c.updated_at), true)
    }
  }
  const systemReminderTimes: number[] = []
  for (const e of events) {
    const t = parseTime(e.occurred_at)
    const isSystemReminder = e.type === 'reminder_sent' && e.actor_id === 'system'
    push(t, !isSystemReminder)
    if (isSystemReminder && t !== null) systemReminderTimes.push(t)
  }

  if (allTimes.length === 0) return null // aucune activité datable — on ne relance pas à l'aveugle
  const lastActivity = Math.max(...allTimes)
  // Saisie tolérante (événements futur-datés) / horloge en retard → 0, jamais négatif (parité M5).
  const waitingDays = Math.max(0, Math.floor((now.getTime() - lastActivity) / DAY_MS))

  // Cap anti-harcèlement : N relances système consécutives sans activité humaine → pause.
  const lastHuman = humanTimes.length > 0 ? Math.max(...humanTimes) : Number.NEGATIVE_INFINITY
  const consecutive = systemReminderTimes.filter((t) => t > lastHuman).length
  if (consecutive >= MAX_CONSECUTIVE_SYSTEM_REMINDERS) return null

  const thresholds = thresholdsFor(dossier.country)
  const thresholdDays = waitingOn === 'agent' ? thresholds.agentDays : thresholds.agencyDays
  if (waitingDays < thresholdDays) return null

  return {
    dossierId: dossier.id,
    orgId: dossier.org_id,
    status,
    stage,
    waitingOn,
    waitingDays,
    thresholdDays,
    senderEmail: latest?.sender_email ?? null,
  }
}
