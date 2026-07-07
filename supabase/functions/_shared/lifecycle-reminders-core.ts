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
  recipient_email: string
  /** Langue de relance choisie à l'envoi (Slice 1b, 0056) ; null = langue officielle du pays. */
  recipient_lang: string | null
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

// Défaut agence = 60 j (choix CEO, expert RA) : le délai normal AMM/notification ≈ 6 mois → un
// rappel tous les 2 mois, plafonné à 3, donne des relances vers J60/J120/J180 sans harceler l'agence.
// Aligné sur le défaut de la table `reminder_settings` (0055) : org configurée ou non = même défaut.
export const DEFAULT_THRESHOLDS: ReminderThresholds = { agentDays: 14, agencyDays: 60 }

/** Overrides PAR PAYS (codes ISO alpha-2, mêmes clés que lifecycle-config.ts). Vide au départ :
 * les défauts s'appliquent partout ; on affine par PR quand le CEO fixe des SLA réels par agence.
 * Gelé : référentiel immuable au runtime (les tests passent leurs overrides en paramètre). */
export const COUNTRY_THRESHOLDS: Readonly<Record<string, Partial<ReminderThresholds>>> =
  Object.freeze({})

export function thresholdsFor(
  country: string,
  overrides: Readonly<Record<string, Partial<ReminderThresholds>>> = COUNTRY_THRESHOLDS,
): ReminderThresholds {
  return { ...DEFAULT_THRESHOLDS, ...overrides[country] }
}

// ── Config des relances PAR ORG (table `reminder_settings`, 0055) ─────────────────────────────────
// Sous-ensemble Roadmap lu par le cron. Le mapping ligne→config est PUR (testé) ; l'Edge ne fait que
// l'I/O (SELECT + Map). Org sans ligne = défauts (mêmes valeurs que la table).

/** Ligne brute de `reminder_settings` (colonnes Roadmap utiles au cron). */
export interface ReminderSettingsRow {
  org_id: string
  roadmap_auto_enabled: boolean | null
  roadmap_agent_days: number | null
  roadmap_agency_days: number | null
  roadmap_email_enabled: boolean | null
}

/** Config EFFECTIVE d'une org pour la relance Roadmap. */
export interface OrgReminderCfg {
  /** Relances auto Roadmap actives (une org qui a coupé n'est jamais planifiée). */
  roadmapAutoEnabled: boolean
  /** Seuils effectifs (custom de l'org, sinon défauts). */
  thresholds: ReminderThresholds
  /** Canal e-mail (l'affichage/journalisation in-app reste indépendant de ce flag). */
  emailEnabled: boolean
}

export const DEFAULT_ORG_CFG: OrgReminderCfg = {
  roadmapAutoEnabled: true,
  thresholds: DEFAULT_THRESHOLDS,
  emailEnabled: true,
}

/** Mappe une ligne `reminder_settings` (ou son absence) en config effective — pur, déterministe. */
export function orgReminderCfg(row: ReminderSettingsRow | undefined | null): OrgReminderCfg {
  if (!row) return DEFAULT_ORG_CFG
  return {
    // `!== false` : un flag NULL (colonne jamais écrite) retombe sur « activé », le défaut de la table.
    roadmapAutoEnabled: row.roadmap_auto_enabled !== false,
    thresholds: {
      agentDays: row.roadmap_agent_days ?? DEFAULT_THRESHOLDS.agentDays,
      agencyDays: row.roadmap_agency_days ?? DEFAULT_THRESHOLDS.agencyDays,
    },
    emailEnabled: row.roadmap_email_enabled !== false,
  }
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

// ── Langue du DESTINATAIRE (T1) ────────────────────────────────────────────────────────────────────
// Défaut = langue officielle du pays (le sélecteur d'envoi peut la surcharger, stocké plus tard).
// L'app ne gère que FR/EN → Guinée-Bissau (portugais) replie sur FR.
export type MsgLang = 'fr' | 'en'

export const COUNTRY_OFFICIAL_LANG: Readonly<Record<string, MsgLang>> = Object.freeze({
  BJ: 'fr',
  BF: 'fr',
  CI: 'fr',
  GW: 'fr',
  ML: 'fr',
  NE: 'fr',
  SN: 'fr',
  TG: 'fr',
  NG: 'en',
  GH: 'en',
})

/** Langue par défaut d'un destinataire d'après le pays du dossier (repli FR). */
export function officialLang(country: string): MsgLang {
  return COUNTRY_OFFICIAL_LANG[country] ?? 'fr'
}

/** Valide une langue stockée (`recipient_lang`, texte libre côté DB) : 'fr'|'en', sinon null
 * (→ l'appelant retombe sur la langue officielle du pays — défaut Slice 1a préservé). */
export function asMsgLang(x: unknown): MsgLang | null {
  return x === 'fr' || x === 'en' ? x : null
}

/** Phrase « action attendue » du destinataire selon l'étape courante — pour le corps de T1. */
export function recipientAction(stage: ReminderPlan['stage'], lang: MsgLang): string {
  const m: Record<ReminderPlan['stage'], { fr: string; en: string }> = {
    revue: { fr: 'nous transmettre votre décision', en: 'share your decision with us' },
    depot: { fr: 'confirmer la réception du dossier', en: 'confirm receipt of the dossier' },
    soumission: {
      fr: 'confirmer le dépôt auprès de l’agence',
      en: 'confirm filing with the agency',
    },
    notifications: {
      fr: 'nous notifier l’état d’instruction',
      en: 'update us on the review status',
    },
  }
  return m[stage][lang]
}

/**
 * Display-name RFC 5322 SÛR pour l'expéditeur « {Org} (via Pharnos) » — l'ensemble est renvoyé en
 * `quoted-string` : le nom d'org (texte LIBRE) est assaini (guillemet / antislash / CR-LF / `<>`
 * retirés, whitespace normalisé, plafonné) puis PLACÉ DANS les guillemets, de sorte que `, : ; ( )`
 * y sont LITTÉRAUX et ne peuvent plus casser la grammaire address-list (revue B1). Repli « Pharnos ».
 */
export function senderDisplayName(orgName: string): string {
  const cleaned = orgName
    .replace(/[\r\n"\\<>]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80)
  return `"${cleaned || 'Pharnos'} (via Pharnos)"`
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
  /** Adresse côté labo (expéditeur de la dernière correspondance active) — accusé + Reply-To. */
  senderEmail: string | null
  /** Adresse du DESTINATAIRE (agent/agence — recipient de la dernière correspondance) — cible T1. */
  recipientEmail: string | null
  /** Langue de la relance choisie à l'envoi (Slice 1b) ; null = langue officielle du pays (défaut). */
  recipientLang: MsgLang | null
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
  /** Seuils EFFECTIFS de l'org (config `reminder_settings`, 0055). Absent → défauts par pays. */
  thresholds?: ReminderThresholds
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

  const thresholds = input.thresholds ?? thresholdsFor(dossier.country)
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
    recipientEmail: latest?.recipient_email ?? null,
    recipientLang: asMsgLang(latest?.recipient_lang ?? null),
  }
}
