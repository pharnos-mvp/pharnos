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

  it('DCI séparées par des VIRGULES + dosages en « + » : apparie quand même (cas CEO)', () => {
    expect(
      formatComposition(
        "Hydroxyde d'aluminium, Hydroxyde de magnésium, Siméticone, Oxéthazaïne",
        '250 mg + 250 mg + 125 mg + 10 mg',
      ),
    ).toBe(
      "Hydroxyde d'aluminium 250 mg + Hydroxyde de magnésium 250 mg + Siméticone 125 mg + Oxéthazaïne 10 mg",
    )
  })

  it('DCI séparées par des points-virgules : apparie aussi', () => {
    expect(formatComposition('Amoxicilline; Acide clavulanique', '500 mg + 125 mg')).toBe(
      'Amoxicilline 500 mg + Acide clavulanique 125 mg',
    )
  })

  it('GARDE-FOU : la virgule DÉCIMALE du dosage n’est pas coupée (« 2,5 mg »)', () => {
    expect(formatComposition('Périndopril + Indapamide', '2,5 mg + 0,625 mg')).toBe(
      'Périndopril 2,5 mg + Indapamide 0,625 mg',
    )
  })

  it('mono-molécule : simple concaténation « DCI dosage »', () => {
    expect(formatComposition('Paracétamol', '500 mg')).toBe('Paracétamol 500 mg')
  })

  it('comptes incohérents : repli sans perte d’information', () => {
    expect(formatComposition('A + B + C', '10 mg + 20 mg')).toBe('A + B + C 10 mg + 20 mg')
  })

  it('SÛRETÉ : dosages ambigus séparés par virgule → repli (jamais de force mésappariée)', () => {
    // La virgule dans le dosage reste ambiguë (décimale vs séparateur). On ne devine pas : le
    // dosage ne se coupe PAS sur la virgule → 1 segment vs 2 DCI → repli sûr, pas de mésappariement.
    expect(formatComposition('A, B', '10 mg, 20 mg')).toBe('A, B 10 mg, 20 mg')
  })

  it('dosage vide : DCI seule', () => {
    expect(formatComposition('A + B', '')).toBe('A + B')
  })

  it('chaînes vides : résultat vide', () => {
    expect(formatComposition('', '')).toBe('')
  })
})
