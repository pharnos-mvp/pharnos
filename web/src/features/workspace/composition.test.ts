import { describe, expect, it } from 'vitest'

import { formatComposition } from './composition'

describe('formatComposition', () => {
  it('apparie chaque DCI à son dosage (multi-molécules)', () => {
    expect(
      formatComposition(
        'METRONIDAZOLE + SULFATE DE NEOMYCINE + SULFATE DE POLYMYXINE B + NYSTATINE',
        '200 mg + 35 000 UI + 35 000 UI + 100 000 UI',
      ),
    ).toBe(
      'METRONIDAZOLE 200 mg + SULFATE DE NEOMYCINE 35 000 UI + SULFATE DE POLYMYXINE B 35 000 UI + NYSTATINE 100 000 UI',
    )
  })

  it('mono-molécule : simple concaténation « DCI dosage »', () => {
    expect(formatComposition('Paracétamol', '500 mg')).toBe('Paracétamol 500 mg')
  })

  it('comptes incohérents : repli sans perte d’information', () => {
    expect(formatComposition('A + B + C', '10 mg + 20 mg')).toBe('A + B + C 10 mg + 20 mg')
  })

  it('dosage vide : DCI seule', () => {
    expect(formatComposition('A + B', '')).toBe('A + B')
  })

  it('chaînes vides : résultat vide', () => {
    expect(formatComposition('', '')).toBe('')
  })
})
