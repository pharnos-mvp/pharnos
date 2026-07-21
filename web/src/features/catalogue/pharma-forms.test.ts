import { describe, expect, it } from 'vitest'

import { AUTRE_FORME, isKnownForm, PHARMA_FORMS } from './pharma-forms'

describe('PHARMA_FORMS', () => {
  it('est trié alphabétiquement (fr) sur la value', () => {
    const collator = new Intl.Collator('fr')
    const values = PHARMA_FORMS.map((f) => f.value)
    const sorted = [...values].sort((a, b) => collator.compare(a, b))
    expect(values).toEqual(sorted)
  })

  it('a des value/label non vides et des value uniques', () => {
    const values = PHARMA_FORMS.map((f) => f.value)
    expect(new Set(values).size).toBe(values.length)
    for (const f of PHARMA_FORMS) {
      expect(f.value.trim()).not.toBe('')
      expect(f.label.fr.trim()).not.toBe('')
      expect(f.label.en?.trim()).not.toBe('')
    }
  })

  it("ne contient pas la sentinelle « Autre » (elle n'est jamais stockée)", () => {
    expect(PHARMA_FORMS.some((f) => f.value === AUTRE_FORME)).toBe(false)
  })
})

describe('isKnownForm', () => {
  it('reconnaît une forme du catalogue', () => {
    expect(isKnownForm('Comprimé')).toBe(true)
    expect(isKnownForm('Sirop')).toBe(true)
  })

  it('traite toute autre saisie comme libre (« Autre »)', () => {
    expect(isKnownForm('Comprimé sublingual bicouche')).toBe(false)
    expect(isKnownForm('')).toBe(false)
    expect(isKnownForm(AUTRE_FORME)).toBe(false)
  })
})
