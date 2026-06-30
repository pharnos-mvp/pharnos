import type { CorrespondenceRecord, LifecycleEventRecord, LifecycleEventType } from '@/lib/db'
import type { Lang, Translatable } from '@/lib/i18n-context'

/**
 * « La spine » — état du cycle de vie d'un dossier, DÉRIVÉ (jamais stocké) du journal append-only
 * `lifecycle_events` + de la correspondance (ADR-0004). On SUPERPOSE : la correspondance (0017) reste
 * la source des étapes amont (Montage/Revue/Décision) ; le journal porte l'aval (Dépôt → Soumission →
 * Notifications → AMM). Fonction pure, testée — calque exact de `dossierDisplayStatus` (ADR-0003).
 *
 * Le mockup validé (`docs/mockups/roadmap-parcours-dossier.html`) fixe les 7 étapes du parcours.
 */

// ── Étapes du parcours (ordre canonique) ─────────────────────────────────────────────────────────
export type LifecycleStageId =
  | 'montage'
  | 'revue'
  | 'decision'
  | 'depot'
  | 'soumission'
  | 'notifications'
  | 'amm'

export const LIFECYCLE_STAGE_ORDER: LifecycleStageId[] = [
  'montage',
  'revue',
  'decision',
  'depot',
  'soumission',
  'notifications',
  'amm',
]

/** Étape (titre + acteur responsable) — alimente le pipeline de la Roadmap (M1). */
export const LIFECYCLE_STAGES: {
  id: LifecycleStageId
  label: Translatable
  actor: Translatable
}[] = [
  { id: 'montage', label: { fr: 'Montage', en: 'Assembly' }, actor: { fr: 'Labo', en: 'Lab' } },
  {
    id: 'revue',
    label: { fr: 'Revue', en: 'Review' },
    actor: { fr: 'Agent local', en: 'Local agent' },
  },
  {
    id: 'decision',
    label: { fr: 'Décision', en: 'Decision' },
    actor: { fr: 'Agent local', en: 'Local agent' },
  },
  {
    id: 'depot',
    label: { fr: 'Dépôt', en: 'Deposit' },
    actor: { fr: '→ Agence nat.', en: '→ Nat. agency' },
  },
  {
    id: 'soumission',
    label: { fr: 'Soumission', en: 'Submission' },
    actor: { fr: 'Agent local', en: 'Local agent' },
  },
  {
    id: 'notifications',
    label: { fr: 'Notifications', en: 'Notifications' },
    actor: { fr: 'Agence nat.', en: 'Nat. agency' },
  },
  { id: 'amm', label: { fr: 'AMM', en: 'MA' }, actor: { fr: 'Agence nat.', en: 'Nat. agency' } },
]

export type StageStatus = 'done' | 'current' | 'todo'
export type StageOutcome = 'accepted' | 'suspended' | 'rejected' | 'granted' | 'refused'

export interface LifecycleStage {
  id: LifecycleStageId
  status: StageStatus
  /** Horodatage où l'étape a été atteinte (ISO) ; null si à venir ou inconnu. */
  at: string | null
  /** Issue qualifiant l'étape (Décision : accepted/suspended/rejected ; AMM : granted/refused). */
  outcome?: StageOutcome
}

// ── Statut global du dossier (badge) — extension AVAL de `DossierDisplayStatus` ──────────────────
export type LifecycleStatus =
  | 'montage'
  | 'in_review'
  | 'suspended'
  | 'rejected'
  | 'accepted'
  | 'submitting'
  | 'in_notification'
  | 'amm_granted'
  | 'amm_refused'

export type LifecycleTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger'

const STATUS_LABELS: Record<LifecycleStatus, Translatable> = {
  montage: { fr: 'En montage', en: 'In assembly' },
  in_review: { fr: 'En revue', en: 'In review' },
  suspended: { fr: 'En suspens', en: 'Suspended' },
  rejected: { fr: 'Rejeté', en: 'Rejected' },
  accepted: { fr: 'Accepté', en: 'Accepted' },
  submitting: { fr: 'En soumission', en: 'In submission' },
  in_notification: { fr: 'En instruction', en: 'Under assessment' },
  amm_granted: { fr: 'AMM accordée', en: 'MA granted' },
  amm_refused: { fr: 'AMM refusée', en: 'MA refused' },
}

export const LIFECYCLE_STATUS_TONE: Record<LifecycleStatus, LifecycleTone> = {
  montage: 'neutral',
  in_review: 'info',
  suspended: 'warning',
  rejected: 'danger',
  accepted: 'success',
  submitting: 'info',
  in_notification: 'info',
  amm_granted: 'success',
  amm_refused: 'danger',
}

export const lifecycleStatusLabel = (s: LifecycleStatus, lang: Lang = 'fr'): string =>
  (STATUS_LABELS[s] ?? STATUS_LABELS.montage)[lang]

// ── Journal (timeline) ───────────────────────────────────────────────────────────────────────────
/** Clé d'affichage d'une entrée du journal : étapes amont synthétisées + types d'événements aval. */
export type LifecycleJournalKey = 'montage' | 'review_sent' | 'decision' | LifecycleEventType

export interface LifecycleJournalEntry {
  /** Horodatage réel de l'événement (ISO). */
  at: string
  key: LifecycleJournalKey
  /** Issue éventuelle (Décision / AMM). */
  outcome?: StageOutcome
  /** Origine de l'entrée (le journal fusionne 3 sources). */
  source: 'dossier' | 'correspondence' | 'event'
}

const JOURNAL_LABELS: Record<LifecycleJournalKey, Translatable> = {
  montage: { fr: 'Montage créé', en: 'Assembly created' },
  review_sent: { fr: 'Envoyé en revue à l’agent local', en: 'Sent for review to the local agent' },
  decision: { fr: 'Décision rendue', en: 'Decision rendered' },
  deposited: { fr: 'Déposé à l’agence nationale', en: 'Deposited at the national agency' },
  submitted: { fr: 'Soumis à l’autorité', en: 'Submitted to the authority' },
  authority_query: {
    fr: 'Notification / complément demandé',
    en: 'Notification / additional info requested',
  },
  authority_response: {
    fr: 'Réponse au complément transmise',
    en: 'Response to the request submitted',
  },
  amm_granted: { fr: 'AMM accordée', en: 'MA granted' },
  amm_refused: { fr: 'AMM refusée', en: 'MA refused' },
  samples_requested: { fr: 'Échantillons demandés', en: 'Samples requested' },
  samples_import_authorized: {
    fr: 'Autorisation d’importation obtenue',
    en: 'Import authorisation obtained',
  },
  samples_shipped: { fr: 'Échantillons expédiés', en: 'Samples shipped' },
  samples_delivered: { fr: 'Échantillons remis', en: 'Samples delivered' },
  fees_invoiced: { fr: 'Frais facturés', en: 'Fees invoiced' },
  payment_submitted: { fr: 'Preuve de paiement déposée', en: 'Payment proof submitted' },
  payment_confirmed: { fr: 'Paiement confirmé', en: 'Payment confirmed' },
  reminder_sent: { fr: 'Relance automatique', en: 'Automatic reminder' },
}

/** Libellés des issues de la Décision agent local (réutilisés par le journal + l'étape). */
const DECISION_OUTCOME_LABELS: Record<'accepted' | 'suspended' | 'rejected', Translatable> = {
  accepted: { fr: 'Dossier accepté', en: 'Dossier accepted' },
  suspended: { fr: 'Dossier mis en suspens', en: 'Dossier suspended' },
  rejected: { fr: 'Dossier rejeté', en: 'Dossier rejected' },
}

export function journalLabel(
  entry: Pick<LifecycleJournalEntry, 'key' | 'outcome'>,
  lang: Lang = 'fr',
): string {
  if (entry.key === 'decision' && entry.outcome && entry.outcome in DECISION_OUTCOME_LABELS) {
    return DECISION_OUTCOME_LABELS[entry.outcome as 'accepted' | 'suspended' | 'rejected'][lang]
  }
  return (JOURNAL_LABELS[entry.key] ?? JOURNAL_LABELS.montage)[lang]
}

/** Libellé COURT d'une issue (pastille d'étape Décision/AMM) : Accepté/Suspendu/Rejeté/Accordée/Refusée. */
const STAGE_OUTCOME_LABELS: Record<StageOutcome, Translatable> = {
  accepted: { fr: 'Accepté', en: 'Accepted' },
  suspended: { fr: 'Suspendu', en: 'Suspended' },
  rejected: { fr: 'Rejeté', en: 'Rejected' },
  granted: { fr: 'Accordée', en: 'Granted' },
  refused: { fr: 'Refusée', en: 'Refused' },
}

export const stageOutcomeLabel = (outcome: StageOutcome, lang: Lang = 'fr'): string =>
  STAGE_OUTCOME_LABELS[outcome][lang]

// ── Résultat dérivé ──────────────────────────────────────────────────────────────────────────────
export interface LifecycleState {
  /** Les 7 étapes du parcours, dans l'ordre canonique, avec leur statut. */
  stages: LifecycleStage[]
  /** Étape courante (où en est le dossier). */
  currentStageId: LifecycleStageId
  /** Statut global (badge en-tête). */
  status: LifecycleStatus
  /** Avancement : nb d'étapes franchies / total. */
  progress: { done: number; total: number }
  /** Journal chronologique des événements réels (passés). */
  journal: LifecycleJournalEntry[]
}

export interface DeriveLifecycleInput {
  dossierId: string
  /** `createdAt` du dossier — borne l'étape Montage. */
  dossierCreatedAt: string
  /** Journal `lifecycle_events` (tous dossiers acceptés ; filtré sur `dossierId` à l'intérieur). */
  events: LifecycleEventRecord[]
  /** Correspondances (source des étapes amont) — même contrat que `dossierDisplayStatus`. */
  correspondences: CorrespondenceRecord[]
}

// ── Helpers correspondance (règle ADR-0003 : dernière non révoquée-sans-décision l'emporte) ───────
const isActive = (c: CorrespondenceRecord, dossierId: string): boolean =>
  c.dossierId === dossierId &&
  c.deletedAt === null &&
  !(c.status === 'in_review' && c.revokedAt !== null)

function hasAnyCorrespondence(dossierId: string, all: CorrespondenceRecord[]): boolean {
  return all.some((c) => isActive(c, dossierId))
}

function firstCorrespondenceAt(dossierId: string, all: CorrespondenceRecord[]): string | null {
  let earliest: string | null = null
  for (const c of all) {
    if (!isActive(c, dossierId)) continue
    if (earliest === null || c.createdAt < earliest) earliest = c.createdAt
  }
  return earliest
}

function latestDecision(
  dossierId: string,
  all: CorrespondenceRecord[],
): { status: 'accepted' | 'suspended' | 'rejected'; at: string } | null {
  let latest: CorrespondenceRecord | undefined
  for (const c of all) {
    if (!isActive(c, dossierId)) continue
    if (!latest || c.createdAt > latest.createdAt) latest = c
  }
  if (!latest || latest.status === 'in_review') return null
  return { status: latest.status, at: latest.decidedAt ?? latest.updatedAt }
}

/**
 * Dérive l'état complet du cycle de vie d'un dossier (étapes + statut + avancement + journal).
 *
 * Modèle : chaque étape a une condition « propre » de FRANCHISSEMENT (own), puis on rend la complétude
 * MONOTONE de l'aval vers l'amont — un événement aval (ex. `submitted`) implique toutes les étapes
 * amont franchies. Cela gère la persona « Agence locale » qui dépose/soumet sans passer par la
 * correspondance. L'étape courante = la 1re non complétée (ou la dernière si l'AMM est rendue).
 */
export function deriveLifecycle(input: DeriveLifecycleInput): LifecycleState {
  const { dossierId, dossierCreatedAt, correspondences } = input

  // Événements de CE dossier, triés par occurrence réelle (tie-break createdAt).
  const events = input.events
    .filter((e) => e.dossierId === dossierId)
    .sort(
      (a, b) => a.occurredAt.localeCompare(b.occurredAt) || a.createdAt.localeCompare(b.createdAt),
    )
  const lastOf = (type: LifecycleEventType): LifecycleEventRecord | undefined => {
    for (let i = events.length - 1; i >= 0; i--) {
      const e = events[i]
      if (e && e.type === type) return e
    }
    return undefined
  }
  const has = (type: LifecycleEventType): boolean => lastOf(type) !== undefined

  const decision = latestDecision(dossierId, correspondences)
  const ammEvent = lastOf('amm_granted') ?? lastOf('amm_refused')
  const ammDecided = ammEvent !== undefined
  const hasAuthority = has('authority_query') || has('authority_response')

  // Condition PROPRE de franchissement de chaque étape (avant monotonisation).
  const own: Record<LifecycleStageId, boolean> = {
    montage: hasAnyCorrespondence(dossierId, correspondences), // monté = envoyé en revue
    revue: decision !== null, // revue finie = décision rendue
    decision: decision?.status === 'accepted', // décision franchie = acceptée
    depot: has('deposited'),
    // Une notification de l'agence implique que la soumission a eu lieu (la monotonie remonte
    // l'amont, et l'étape courante reste Notifications tant que l'AMM n'est pas rendue).
    soumission: has('submitted') || hasAuthority,
    notifications: ammDecided,
    amm: ammDecided,
  }

  // Complétude MONOTONE : un aval franchi implique tout l'amont franchi (parcouru de l'aval à
  // l'amont avec un drapeau cumulé → gère la persona « Agence locale » qui saute la correspondance).
  const completion: Record<LifecycleStageId, boolean> = { ...own }
  let downstreamReached = false
  for (let i = LIFECYCLE_STAGE_ORDER.length - 1; i >= 0; i--) {
    const id = LIFECYCLE_STAGE_ORDER[i]
    if (!id) continue
    downstreamReached = own[id] || downstreamReached
    completion[id] = downstreamReached
  }

  let currentIndex = LIFECYCLE_STAGE_ORDER.findIndex((id) => !completion[id])
  const allDone = currentIndex === -1
  if (allDone) currentIndex = LIFECYCLE_STAGE_ORDER.length - 1
  const currentStageId = LIFECYCLE_STAGE_ORDER[currentIndex] ?? 'montage'

  const firstAuthority = events.find(
    (e) => e.type === 'authority_query' || e.type === 'authority_response',
  )
  const reachedAt: Record<LifecycleStageId, string | null> = {
    montage: dossierCreatedAt,
    revue: firstCorrespondenceAt(dossierId, correspondences),
    decision: decision?.at ?? null,
    depot: lastOf('deposited')?.occurredAt ?? null,
    soumission: lastOf('submitted')?.occurredAt ?? null,
    notifications: firstAuthority?.occurredAt ?? null,
    amm: ammEvent?.occurredAt ?? null,
  }

  const outcomeOf: Partial<Record<LifecycleStageId, StageOutcome>> = {}
  if (decision) outcomeOf.decision = decision.status
  if (ammEvent) outcomeOf.amm = ammEvent.type === 'amm_granted' ? 'granted' : 'refused'

  const stageStatus = (i: number): StageStatus => {
    if (i < currentIndex) return 'done'
    if (i > currentIndex) return 'todo'
    return allDone ? 'done' : 'current' // l'étape courante est « done » seulement si l'AMM est rendue
  }
  const stages: LifecycleStage[] = LIFECYCLE_STAGE_ORDER.map((id, i) => ({
    id,
    status: stageStatus(i),
    at: reachedAt[id],
    outcome: outcomeOf[id],
  }))

  return {
    stages,
    currentStageId,
    status: deriveStatus(currentStageId, decision, ammEvent),
    progress: {
      done: stages.filter((s) => s.status === 'done').length,
      total: LIFECYCLE_STAGE_ORDER.length,
    },
    journal: buildJournal(input, events, decision),
  }
}

function deriveStatus(
  current: LifecycleStageId,
  decision: { status: 'accepted' | 'suspended' | 'rejected' } | null,
  ammEvent: LifecycleEventRecord | undefined,
): LifecycleStatus {
  if (ammEvent) return ammEvent.type === 'amm_granted' ? 'amm_granted' : 'amm_refused'
  switch (current) {
    case 'montage':
      return 'montage'
    case 'revue':
      return 'in_review'
    case 'decision':
      return decision?.status === 'rejected' ? 'rejected' : 'suspended'
    case 'depot':
      return 'accepted'
    case 'soumission':
      return 'submitting'
    case 'notifications':
    case 'amm':
      return 'in_notification'
  }
}

function buildJournal(
  input: DeriveLifecycleInput,
  events: LifecycleEventRecord[],
  decision: { status: 'accepted' | 'suspended' | 'rejected'; at: string } | null,
): LifecycleJournalEntry[] {
  const entries: LifecycleJournalEntry[] = [
    { at: input.dossierCreatedAt, key: 'montage', source: 'dossier' },
  ]
  const reviewAt = firstCorrespondenceAt(input.dossierId, input.correspondences)
  if (reviewAt) entries.push({ at: reviewAt, key: 'review_sent', source: 'correspondence' })
  if (decision) {
    entries.push({
      at: decision.at,
      key: 'decision',
      outcome: decision.status,
      source: 'correspondence',
    })
  }
  for (const e of events) {
    entries.push({
      at: e.occurredAt,
      key: e.type,
      outcome:
        e.type === 'amm_granted' ? 'granted' : e.type === 'amm_refused' ? 'refused' : undefined,
      source: 'event',
    })
  }
  return entries.sort((a, b) => a.at.localeCompare(b.at))
}
