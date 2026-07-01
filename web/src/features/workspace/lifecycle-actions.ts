import type { LifecycleEventType } from '@/lib/db'
import type { Translatable } from '@/lib/i18n-context'
import type { LifecycleStageId } from './lifecycle-constants'

/**
 * Actions Labo du cycle de vie (« la spine », jalon M2) — ce que l'org PEUT faire pour FAIRE AVANCER
 * un dossier depuis son étape courante. Chaque action = un `lifecycle_events` append-only
 * (`appendLifecycleEvent`) ; l'étape courante reste DÉRIVÉE (`deriveLifecycle`), jamais stockée.
 *
 * Périmètre M2 = jalons AVAL portés par le journal (Dépôt → Soumission → Notifications → AMM). Les
 * étapes amont (Montage/Revue/Décision) sont pilotées par la correspondance (0017) — pas d'action
 * journal ici. Mapping PUR + testé : le composant reste mince, la règle « quoi faire ensuite » est
 * vérifiable en isolation.
 */

export type LifecycleActionId =
  | 'deposit'
  | 'submit'
  | 'authority_query'
  | 'authority_response'
  | 'amm_granted'
  | 'amm_refused'

/**
 * Nature du formulaire de la modale avant l'append :
 *  - `confirm`      : simple confirmation (aucun champ) ;
 *  - `submit`       : mode de soumission (requis, défaut = config pays) + référence/récépissé (option.) ;
 *  - `note`         : note libre (optionnelle) — notifications / réponses ;
 *  - `amm_granted`  : n° d'AMM (requis) + validité (optionnelle) ;
 *  - `amm_refused`  : motif (optionnel).
 */
export type LifecycleActionForm = 'confirm' | 'submit' | 'note' | 'amm_granted' | 'amm_refused'

export interface LifecycleAction {
  id: LifecycleActionId
  /** Type d'événement journalisé (vocabulaire contrôlé, miroir du CHECK 0047). */
  type: LifecycleEventType
  label: Translatable
  /** Phrase de la modale (confirmation / intitulé du formulaire). */
  prompt: Translatable
  variant: 'primary' | 'outline' | 'destructive'
  form: LifecycleActionForm
}

const DEPOSIT: LifecycleAction = {
  id: 'deposit',
  type: 'deposited',
  label: { fr: 'Transmettre à l’agence nationale', en: 'Forward to the national agency' },
  prompt: {
    fr: 'Confirmer le dépôt du dossier auprès de l’agence nationale ? Cette action est journalisée.',
    en: 'Confirm the dossier was deposited at the national agency? This action is logged.',
  },
  variant: 'primary',
  form: 'confirm',
}

const SUBMIT: LifecycleAction = {
  id: 'submit',
  type: 'submitted',
  label: { fr: 'Marquer comme soumis', en: 'Mark as submitted' },
  prompt: {
    fr: 'Enregistrer la soumission à l’autorité.',
    en: 'Record the submission to the authority.',
  },
  variant: 'primary',
  form: 'submit',
}

const AUTHORITY_QUERY: LifecycleAction = {
  id: 'authority_query',
  type: 'authority_query',
  label: { fr: 'Notification / complément reçu', en: 'Notification / query received' },
  prompt: {
    fr: 'Journaliser une notification (ou une demande de complément) reçue de l’agence.',
    en: 'Log a notification (or additional-info request) received from the agency.',
  },
  variant: 'outline',
  form: 'note',
}

const AUTHORITY_RESPONSE: LifecycleAction = {
  id: 'authority_response',
  type: 'authority_response',
  label: { fr: 'Réponse au complément transmise', en: 'Response submitted' },
  prompt: {
    fr: 'Journaliser la transmission de votre réponse au complément demandé.',
    en: 'Log that your response to the request has been submitted.',
  },
  variant: 'outline',
  form: 'note',
}

const AMM_GRANTED: LifecycleAction = {
  id: 'amm_granted',
  type: 'amm_granted',
  label: { fr: 'AMM accordée', en: 'MA granted' },
  prompt: {
    fr: 'Enregistrer l’octroi de l’AMM. Le parcours du dossier sera clôturé.',
    en: 'Record the marketing authorisation. The dossier journey will be closed.',
  },
  variant: 'primary',
  form: 'amm_granted',
}

const AMM_REFUSED: LifecycleAction = {
  id: 'amm_refused',
  type: 'amm_refused',
  label: { fr: 'AMM refusée', en: 'MA refused' },
  prompt: {
    fr: 'Enregistrer le refus d’AMM. Le parcours du dossier sera clôturé.',
    en: 'Record the refusal. The dossier journey will be closed.',
  },
  variant: 'destructive',
  form: 'amm_refused',
}

/** Contexte du dossier qui affine les actions disponibles (sans stocker d'état dérivé). */
export interface LifecycleActionContext {
  /** Une notification/complément (`authority_query`) a-t-elle déjà été journalisée ? */
  hasAuthorityQuery?: boolean
}

/**
 * Actions disponibles depuis l'étape COURANTE (aval uniquement). Amont (montage/revue/decision) et
 * terminal (amm rendue) → aucune action journal : le composant affiche alors un renvoi contextuel.
 *
 * Ordre du journal (ALCOA++, append-only immuable) : on n'offre « Réponse au complément » qu'APRÈS
 * qu'une notification a été journalisée — sinon la timeline porterait une réponse sans demande, sans
 * possibilité de correction (une correction = un nouvel événement).
 */
export function nextLifecycleActions(
  stageId: LifecycleStageId,
  ctx: LifecycleActionContext = {},
): LifecycleAction[] {
  switch (stageId) {
    case 'depot':
      return [DEPOSIT]
    case 'soumission':
      return [SUBMIT]
    case 'notifications':
      return [
        AUTHORITY_QUERY,
        ...(ctx.hasAuthorityQuery ? [AUTHORITY_RESPONSE] : []),
        AMM_GRANTED,
        AMM_REFUSED,
      ]
    default:
      return []
  }
}
