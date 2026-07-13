import type { LifecycleEventRecord, LifecycleEventType } from '@/lib/db'
import type { Translatable } from '@/lib/i18n-context'

/**
 * Conditions de soumission (« la spine », jalon M3) — les 3 items suivis en parallèle du parcours :
 * (a) dossier CTD déposé, (b) échantillons, (c) paiement des frais. État DÉRIVÉ (jamais stocké) du
 * même journal append-only que `deriveLifecycle` ; chaque sous-étape = un type d'événement du
 * vocabulaire 0047 (déjà en base depuis M0 — M3 est front-only).
 *
 * Décisions CEO (mockup `docs/mockups/lifecycle-m3-echantillons-frais.html`, GO 2026-07-02) :
 * NON BLOQUANT partout (aucune condition ne verrouille Finalisation/Soumission) ; SAISIE TOLÉRANTE
 * (enregistrer une étape aval marque les amonts franchies — même monotonie que `deriveLifecycle`) ;
 * pièces recommandées, jamais obligatoires.
 */

export type SubmissionConditionId = 'ctd' | 'samples' | 'fees'
export type ConditionStatus = 'todo' | 'in_progress' | 'done'

export type ConditionDocRef = LifecycleEventRecord['docRefs'][number]

export interface ConditionStep {
  type: LifecycleEventType
  /** Franchie — réellement enregistrée OU impliquée par une étape aval (monotonie). */
  done: boolean
  /** `occurredAt` du dernier événement de ce type ; null si jamais enregistrée (saut toléré). */
  at: string | null
  /** Pièces de TOUS les événements de ce type (une correction = un nouvel événement). */
  docs: ConditionDocRef[]
}

export interface SubmissionCondition {
  id: SubmissionConditionId
  status: ConditionStatus
  steps: ConditionStep[]
  /** Prochaine étape à enregistrer (première non franchie) ; null si la condition est remplie. */
  nextType: LifecycleEventType | null
  /** Étape la plus avancée FRANCHIE (pastille d'état) ; null si aucune. */
  reachedType: LifecycleEventType | null
  /** Frais : montant/devise du dernier `fees_invoiced` (payload), si saisis. */
  amount?: { value: number; currency: string }
}

export interface SubmissionConditionsState {
  conditions: SubmissionCondition[]
  done: number
  total: number
}

// ── Chaînes (ordre réglementaire réel — validé CEO) ──────────────────────────────────────────────
export const SAMPLES_CHAIN: LifecycleEventType[] = [
  'samples_requested',
  'samples_import_authorized',
  'samples_shipped',
  'samples_delivered',
]

export const FEES_CHAIN: LifecycleEventType[] = [
  'fees_invoiced',
  'payment_submitted',
  'payment_confirmed',
]

// ── Libellés ─────────────────────────────────────────────────────────────────────────────────────
export const CONDITION_TITLES: Record<SubmissionConditionId, Translatable> = {
  ctd: { fr: 'Dossier CTD compilé & finalisé', en: 'CTD dossier compiled & finalised' },
  samples: { fr: 'Échantillons', en: 'Samples' },
  fees: { fr: 'Paiement des frais', en: 'Fee payment' },
}

/** Libellé COURT d'une sous-étape (points de la chaîne + pastille d'état). */
export const CONDITION_STEP_LABELS: Partial<Record<LifecycleEventType, Translatable>> = {
  deposited: { fr: 'Finalisé', en: 'Finalised' },
  samples_requested: { fr: 'Demandés', en: 'Requested' },
  samples_import_authorized: { fr: 'Import autorisé', en: 'Import authorised' },
  samples_shipped: { fr: 'Expédiés', en: 'Shipped' },
  samples_delivered: { fr: 'Remis', en: 'Delivered' },
  fees_invoiced: { fr: 'Frais notifiés', en: 'Fees invoiced' },
  payment_submitted: { fr: 'Preuve déposée', en: 'Proof submitted' },
  payment_confirmed: { fr: 'Confirmé', en: 'Confirmed' },
}

export interface DeriveConditionsInput {
  dossierId: string
  /** Journal `lifecycle_events` (peut contenir d'autres dossiers ; filtré à l'intérieur). */
  events: LifecycleEventRecord[]
  /** Le pays exige-t-il une autorisation d'importation d'échantillons ? (`lifecycle-config`). */
  sampleImportAuthRequired: boolean
}

/**
 * Dérive l'état des 3 conditions de soumission. Monotonie par chaîne : la position atteinte =
 * l'étape enregistrée LA PLUS AVAL ; tout l'amont est considéré franchi (saisie tolérante).
 */
export function deriveSubmissionConditions(
  input: DeriveConditionsInput,
): SubmissionConditionsState {
  const events = input.events
    .filter((e) => e.dossierId === input.dossierId)
    .sort(
      (a, b) => a.occurredAt.localeCompare(b.occurredAt) || a.createdAt.localeCompare(b.createdAt),
    )

  const ofType = (type: LifecycleEventType): LifecycleEventRecord[] =>
    events.filter((e) => e.type === type)

  function buildChain(id: SubmissionConditionId, chain: LifecycleEventType[]): SubmissionCondition {
    const byType = chain.map((type) => ofType(type))
    let furthest = -1
    for (let i = chain.length - 1; i >= 0; i--) {
      const recs = byType[i]
      if (recs && recs.length > 0) {
        furthest = i
        break
      }
    }
    const steps: ConditionStep[] = chain.map((type, i) => {
      const recs = byType[i] ?? []
      const last = recs[recs.length - 1]
      return {
        type,
        done: i <= furthest,
        at: last?.occurredAt ?? null,
        docs: recs.flatMap((r) => r.docRefs),
      }
    })
    const lastIndex = chain.length - 1
    return {
      id,
      status: furthest === lastIndex ? 'done' : furthest >= 0 ? 'in_progress' : 'todo',
      steps,
      nextType: furthest === lastIndex ? null : (chain[furthest + 1] ?? null),
      reachedType: furthest >= 0 ? (chain[furthest] ?? null) : null,
    }
  }

  // Échantillons : l'étape « Import autorisé » n'existe que si le pays l'exige.
  const samplesChain = input.sampleImportAuthRequired
    ? SAMPLES_CHAIN
    : SAMPLES_CHAIN.filter((t) => t !== 'samples_import_authorized')
  const samples = buildChain('samples', samplesChain)

  const fees = buildChain('fees', FEES_CHAIN)
  // Montant affiché = dernier `fees_invoiced` portant un montant (une correction = un nouvel événement).
  const invoices = ofType('fees_invoiced')
  for (let i = invoices.length - 1; i >= 0; i--) {
    const p = invoices[i]?.payload
    if (p && typeof p.amount === 'number' && Number.isFinite(p.amount)) {
      fees.amount = { value: p.amount, currency: typeof p.currency === 'string' ? p.currency : '' }
      break
    }
  }

  // CTD : dérivée du jalon Finalisation (M2) — aucune saisie propre dans le panneau.
  const ctd = buildChain('ctd', ['deposited'])

  const conditions = [ctd, samples, fees]
  return {
    conditions,
    done: conditions.filter((c) => c.status === 'done').length,
    total: conditions.length,
  }
}

// ── Actions de sous-étape (modales du panneau Conditions) ────────────────────────────────────────
/**
 * Nature du formulaire :
 *  - `note`     : note libre (optionnelle) ;
 *  - `shipment` : n° LTA / AWB (optionnel) ;
 *  - `fees`     : montant + devise + référence (tous optionnels — le barème réel reste la
 *                 référence de l'agence, décision CEO) ;
 *  - `payment`  : montant + référence du virement (optionnels).
 * TOUTES les modales ont : date de l'événement (max aujourd'hui) + pièce jointe recommandée.
 */
export type ConditionForm = 'note' | 'shipment' | 'fees' | 'payment'

export interface ConditionStepAction {
  type: LifecycleEventType
  label: Translatable
  prompt: Translatable
  form: ConditionForm
  /** Libellé du champ pièce jointe (autorisation / LTA / SWIFT…). */
  docLabel: Translatable
}

const PIECE = { fr: 'Pièce jointe (recommandée)', en: 'Attachment (recommended)' }

export const CONDITION_STEP_ACTIONS: Partial<Record<LifecycleEventType, ConditionStepAction>> = {
  samples_requested: {
    type: 'samples_requested',
    label: { fr: 'Échantillons demandés', en: 'Samples requested' },
    prompt: {
      fr: 'Journaliser la demande d’échantillons reçue (courrier de l’agence, exigence au dépôt…).',
      en: 'Log the sample request received (agency letter, filing requirement…).',
    },
    form: 'note',
    docLabel: PIECE,
  },
  samples_import_authorized: {
    type: 'samples_import_authorized',
    label: { fr: 'Autorisation d’importation obtenue', en: 'Import authorisation obtained' },
    prompt: {
      fr: 'Journaliser l’autorisation d’importation des échantillons (joignez le document).',
      en: 'Log the sample import authorisation (attach the document).',
    },
    form: 'note',
    docLabel: {
      fr: 'Autorisation d’importation (recommandée)',
      en: 'Import authorisation (recommended)',
    },
  },
  samples_shipped: {
    type: 'samples_shipped',
    label: { fr: 'Échantillons expédiés', en: 'Samples shipped' },
    prompt: {
      fr: 'Journaliser l’expédition des échantillons (LTA / AWB).',
      en: 'Log the sample shipment (air waybill).',
    },
    form: 'shipment',
    docLabel: { fr: 'LTA / AWB (recommandée)', en: 'Air waybill (recommended)' },
  },
  samples_delivered: {
    type: 'samples_delivered',
    label: { fr: 'Échantillons remis', en: 'Samples delivered' },
    prompt: {
      fr: 'Journaliser la remise des échantillons à l’agence nationale.',
      en: 'Log the delivery of the samples to the national agency.',
    },
    form: 'note',
    docLabel: PIECE,
  },
  fees_invoiced: {
    type: 'fees_invoiced',
    label: { fr: 'Frais notifiés', en: 'Fees invoiced' },
    prompt: {
      fr: 'Journaliser les frais notifiés par l’agence (montant selon le barème officiel).',
      en: 'Log the fees invoiced by the agency (as per the official schedule).',
    },
    form: 'fees',
    docLabel: {
      fr: 'Facture / avis des frais (recommandée)',
      en: 'Invoice / fee notice (recommended)',
    },
  },
  payment_submitted: {
    type: 'payment_submitted',
    label: { fr: 'Preuve de paiement déposée', en: 'Payment proof submitted' },
    prompt: {
      fr: 'Journaliser la preuve de paiement (zéro fintech : Pharnos trace la preuve, l’argent circule par les canaux habituels).',
      en: 'Log the payment proof (zero fintech: Pharnos records the proof, the money moves through the usual channels).',
    },
    form: 'payment',
    docLabel: {
      fr: 'Avis SWIFT / reçu de virement (recommandé)',
      en: 'SWIFT advice / transfer receipt (recommended)',
    },
  },
  payment_confirmed: {
    type: 'payment_confirmed',
    label: { fr: 'Paiement confirmé', en: 'Payment confirmed' },
    prompt: {
      fr: 'Journaliser la confirmation du paiement par l’agence.',
      en: 'Log the payment confirmation by the agency.',
    },
    form: 'note',
    docLabel: PIECE,
  },
}
