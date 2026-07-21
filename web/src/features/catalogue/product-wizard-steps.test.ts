import { describe, expect, it } from 'vitest'

import type { DocumentCategory } from '@/lib/db'
import { computeStepState, type StepContext } from './product-wizard-steps'

const base: StepContext = { step: 1, isValidStep1: false, attempted: false, drafts: [] }
const withDraft = (category: DocumentCategory): StepContext['drafts'] => [{ category }]

describe('computeStepState — session 1 (Identification)', () => {
  it('active tant qu’on y est ; neutre (todo) une fois quittée si incomplète et non tentée', () => {
    expect(computeStepState(1, { ...base, step: 1 })).toBe('active')
    expect(computeStepState(1, { ...base, step: 2 })).toBe('todo')
  })

  it('done (vert) quand les champs requis sont valides', () => {
    expect(computeStepState(1, { ...base, step: 2, isValidStep1: true })).toBe('done')
  })

  it('error quand une identification incomplète a été sautée/tentée', () => {
    expect(computeStepState(1, { ...base, step: 2, attempted: true })).toBe('error')
  })
})

describe('computeStepState — sessions documentaires (bug du faux vert au changement de session)', () => {
  it('session 2 (info) dépassée SANS pièce → reste neutre (todo), jamais verte', () => {
    // Reproduit le bug : on quitte « Documents d’information » (step 2 → 3) sans rien uploader.
    // Avant le fix, `step > n` la marquait « done » (vert). Elle doit rester « todo ».
    expect(computeStepState(2, { ...base, step: 3, drafts: [] })).toBe('todo')
  })

  it('session 2 (info) → done (vert) SEULEMENT après ajout d’une pièce info', () => {
    expect(computeStepState(2, { ...base, step: 3, drafts: withDraft('info') })).toBe('done')
    // Une pièce d’une AUTRE catégorie ne verdit pas la session info.
    expect(computeStepState(2, { ...base, step: 3, drafts: withDraft('admin') })).toBe('todo')
  })

  it('session 3 (admin) : todo sans pièce, done avec une pièce admin (même en revenant en arrière)', () => {
    expect(computeStepState(3, { ...base, step: 1, drafts: [] })).toBe('todo')
    expect(computeStepState(3, { ...base, step: 1, drafts: withDraft('admin') })).toBe('done')
  })

  it('la session courante est toujours active, même vide', () => {
    expect(computeStepState(2, { ...base, step: 2, drafts: [] })).toBe('active')
    expect(computeStepState(3, { ...base, step: 3, drafts: [] })).toBe('active')
  })
})
