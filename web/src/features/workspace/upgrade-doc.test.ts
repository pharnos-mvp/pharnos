import { describe, expect, it } from 'vitest'

import { countMissing, MISSING_MARKER } from './upgrade-doc'

describe('countMissing (rubriques à compléter dans une version conforme)', () => {
  it('compte les marqueurs [NON FOURNI DANS LE DOCUMENT SOURCE]', () => {
    const text = `4.8 Effets indésirables\n${MISSING_MARKER}\n\n4.9 Surdosage\nContenu réel.\n\n10. DATE\n${MISSING_MARKER}`
    expect(countMissing(text)).toBe(2)
  })

  it('0 pour un document complet', () => {
    expect(countMissing('1. DÉNOMINATION\nAmoxicilline 500 mg')).toBe(0)
    expect(countMissing('')).toBe(0)
  })

  it('le marqueur est le libellé exact du contrat Edge', () => {
    expect(MISSING_MARKER).toBe('[NON FOURNI DANS LE DOCUMENT SOURCE]')
  })
})
