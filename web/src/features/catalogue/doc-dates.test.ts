import { describe, expect, it } from 'vitest'

import { isIssueAfterExpiry } from './doc-dates'

describe('isIssueAfterExpiry', () => {
  it('délivrance AVANT expiration → cohérent', () => {
    expect(isIssueAfterExpiry('2026-01-01', '2031-01-01')).toBe(false)
  })

  it('délivrance APRÈS expiration → incohérent (signalé)', () => {
    expect(isIssueAfterExpiry('2031-01-02', '2031-01-01')).toBe(true)
  })

  it('mêmes dates → pas « postérieur » (toléré)', () => {
    expect(isIssueAfterExpiry('2031-01-01', '2031-01-01')).toBe(false)
  })

  it('une date manquante → rien à comparer', () => {
    expect(isIssueAfterExpiry('', '2031-01-01')).toBe(false)
    expect(isIssueAfterExpiry('2031-01-01', '')).toBe(false)
    expect(isIssueAfterExpiry(null, null)).toBe(false)
    expect(isIssueAfterExpiry(undefined, '2031-01-01')).toBe(false)
  })

  it('comparaison chronologique par mois/jour (pas seulement l’année)', () => {
    expect(isIssueAfterExpiry('2031-12-31', '2031-01-01')).toBe(true)
    expect(isIssueAfterExpiry('2031-01-01', '2031-12-31')).toBe(false)
  })
})
