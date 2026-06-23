import { describe, expect, it } from 'vitest'

import {
  GROUPING_RULES,
  PIECE_LABEL,
  VARIATION_COUNTS,
  VARIATION_FALLBACK,
  VARIATIONS,
  type PieceCode,
} from './variation-catalog'

describe('variation-catalog (Annexe N°2, Règlement 04/2020 UEMOA)', () => {
  it('contient les 42 variations de l’annexe, numérotées 1→42 sans trou ni doublon', () => {
    expect(VARIATIONS).toHaveLength(42)
    const numbers = VARIATIONS.map((v) => v.n)
    expect(numbers).toEqual(Array.from({ length: 42 }, (_, i) => i + 1))
  })

  it('classe 1–12 en mineures et 13–42 en majeures', () => {
    for (const v of VARIATIONS) {
      expect(v.class).toBe(v.n! <= 12 ? 'mineure' : 'majeure')
    }
    expect(VARIATION_COUNTS).toEqual({ total: 42, mineure: 12, majeure: 30 })
  })

  it('exige une lettre de demande dans tous les cas (y compris le filet « Autre »)', () => {
    for (const v of [...VARIATIONS, VARIATION_FALLBACK]) {
      expect(v.pieces).toContain('lettre')
    }
  })

  it('exige le Module 1 pour toutes les majeures et pour aucune mineure', () => {
    for (const v of VARIATIONS) {
      expect(v.pieces.includes('module1')).toBe(v.class === 'majeure')
    }
  })

  it('réserve le tableau comparatif aux variations RCP/notice (n°12 et n°42)', () => {
    const withTable = VARIATIONS.filter((v) => v.pieces.includes('tableauComparatif')).map(
      (v) => v.n,
    )
    expect(withTable).toEqual([12, 42])
  })

  it('traite les cas particuliers de prix (n°8 lettre seule, n°39 majeure)', () => {
    const v8 = VARIATIONS.find((v) => v.n === 8)!
    expect(v8.pieces).toEqual(['lettre'])
    const v39 = VARIATIONS.find((v) => v.n === 39)!
    expect(v39.class).toBe('majeure')
    expect(v39.pieces).toContain('module1')
  })

  it('libelle chaque code de pièce utilisé en FR et EN', () => {
    const used = new Set<PieceCode>()
    for (const v of [...VARIATIONS, VARIATION_FALLBACK]) v.pieces.forEach((p) => used.add(p))
    for (const code of used) {
      expect(PIECE_LABEL[code]?.fr?.length).toBeGreaterThan(0)
      expect(PIECE_LABEL[code]?.en?.length).toBeGreaterThan(0)
    }
  })

  it('porte les 7 conditions de regroupement', () => {
    expect(GROUPING_RULES).toHaveLength(7)
  })

  it('fournit FR et EN pour chaque libellé de nature', () => {
    for (const v of VARIATIONS) {
      expect(v.nature.fr.length).toBeGreaterThan(0)
      expect(v.nature.en.length).toBeGreaterThan(0)
    }
  })
})
