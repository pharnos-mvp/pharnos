import type { DocumentCategory } from '@/lib/db'

export type StepState = 'done' | 'active' | 'error' | 'todo'

/** Contexte de calcul d'une pastille du stepper de création produit. */
export interface StepContext {
  /** Session courante (1-3). */
  step: number
  /** Identification (session 1) valide en live (react-hook-form mode `onChange`). */
  isValidStep1: boolean
  /** L'utilisateur a tenté d'enregistrer / a sauté une identification incomplète. */
  attempted: boolean
  /** Pièces bufferisées, toutes sessions confondues (chacune porte sa `category`). */
  drafts: ReadonlyArray<{ category: DocumentCategory }>
}

/** Session documentaire → catégorie de pièces attendue (2 = info, 3 = admin). */
const STEP_CATEGORY: Record<number, DocumentCategory> = { 2: 'info', 3: 'admin' }

/**
 * État d'une pastille du stepper.
 *
 * - Session 1 (Identification) : `done` (vert) quand les champs requis sont valides ; `error` si
 *   l'utilisateur a sauté/tenté d'enregistrer une identification incomplète.
 * - Sessions 2 (info) & 3 (admin), DOCUMENTAIRES : `done` (vert) UNIQUEMENT si au moins une pièce a
 *   été ajoutée à LEUR catégorie — jamais par simple passage. Sinon neutre (`todo`), même une fois
 *   dépassées. (Correctif : `step > n` marquait vert une session documentaire vide qu'on quittait.)
 * - La session courante est toujours `active`.
 */
export function computeStepState(n: number, ctx: StepContext): StepState {
  const { step, isValidStep1, attempted, drafts } = ctx
  if (n === 1) {
    if (isValidStep1) return step === 1 ? 'active' : 'done'
    if (attempted) return 'error'
    return step === 1 ? 'active' : 'todo'
  }
  if (step === n) return 'active'
  const category = STEP_CATEGORY[n]
  return category && drafts.some((d) => d.category === category) ? 'done' : 'todo'
}
