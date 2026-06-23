import { describe, expect, it } from 'vitest'

import type { ProductRecord } from '@/lib/db'
import { emptyLetterFields } from '@/features/workspace/letter-context'
import { VARIATIONS } from './variation-catalog'
import {
  groupingNeeded,
  isRequestComplete,
  itemFromVariation,
  requestClass,
  requestFee,
  requestPieces,
  seedVariationItems,
  type VariationItem,
  type VariationRequest,
} from './variation-request'

const PRODUCT: ProductRecord = {
  id: 'p1',
  orgId: 'o1',
  nomCommercial: 'Gynoril',
  dci: 'Estradiol',
  dosage: '2mg',
  forme: 'comprimé',
  presentation: 'plaquette',
  classeTherapeutique: '',
  codeAtc: 'G03CA03',
  titulaire: 'Labo X',
  fabricant: 'Usine Y',
  createdAt: '',
  updatedAt: '',
  deletedAt: null,
}

const v = (n: number): VariationItem => {
  const found = VARIATIONS.find((x) => x.n === n)!
  return itemFromVariation(found, found.nature.fr)
}
const req = (
  items: VariationItem[],
  groupingRuleIndex: number | null = null,
): VariationRequest => ({
  title: 'T',
  fields: { ...emptyLetterFields(), nomCommercial: 'Test', ammNumero: 'AMM-1' },
  items,
  groupingRuleIndex,
})

describe('variation-request — projections de items[]', () => {
  it('itemFromVariation copie le n°, la classe et le libellé', () => {
    const it = v(13)
    expect(it.ref).toBe(13)
    expect(it.class).toBe('majeure')
    expect(it.nature).toContain('site de fabrication')
  })

  it('requestPieces : union ordonnée des pièces (lettre toujours présente)', () => {
    expect(requestPieces([v(1)])).toEqual(['lettre', 'echantillon', 'recepisse'])
    expect(requestPieces([v(8)])).toEqual(['lettre']) // n°8 = lettre seule
    expect(requestPieces([v(12)])).toEqual(['lettre', 'maquette', 'recepisse', 'tableauComparatif'])
    // groupe n°8 (lettre) + n°13 (jeu majeur) → union ordonnée
    expect(requestPieces([v(8), v(13)])).toEqual([
      'lettre',
      'echantillon',
      'recepisse',
      'module1',
      'dossierVariation',
    ])
  })

  it('requestFee = nombre de variations (redevance par variation)', () => {
    expect(requestFee([v(1)])).toBe(1)
    expect(requestFee([v(1), v(13), v(40)])).toBe(3)
  })

  it('requestClass : majeure dès qu’un item est majeur', () => {
    expect(requestClass([v(1)])).toBe('mineure')
    expect(requestClass([v(1), v(13)])).toBe('majeure')
  })

  it('groupingNeeded seulement si > 1 item', () => {
    expect(groupingNeeded([v(1)])).toBe(false)
    expect(groupingNeeded([v(1), v(2)])).toBe(true)
  })

  it('isRequestComplete : ≥1 item, et regroupement justifié si multi', () => {
    expect(isRequestComplete(req([]))).toBe(false)
    expect(isRequestComplete(req([v(1)]))).toBe(true)
    expect(isRequestComplete(req([v(1), v(2)], null))).toBe(false)
    expect(isRequestComplete(req([v(1), v(2)], 1))).toBe(true)
  })
})

describe('seedVariationItems (tableau du dossier)', () => {
  it('amorce les items et préremplit « ancien » depuis le produit (best-effort)', () => {
    const items = seedVariationItems([3, 13], PRODUCT) // 3 = chgt nom (mappé), 13 = site (non mappé)
    expect(items).toHaveLength(2)
    expect(items[0]!.ref).toBe(3)
    expect(items[0]!.class).toBe('mineure')
    expect(items[0]!.before).toBe('Gynoril') // nom commercial pré-rempli
    expect(items[1]!.ref).toBe(13)
    expect(items[1]!.class).toBe('majeure')
    expect(items[1]!.before).toBe('') // pas de mapping → vide
  })

  it('mappe ATC (n°6), DCI (n°4), titulaire (n°2)', () => {
    expect(seedVariationItems([6], PRODUCT)[0]!.before).toBe('G03CA03')
    expect(seedVariationItems([4], PRODUCT)[0]!.before).toBe('Estradiol')
    expect(seedVariationItems([2], PRODUCT)[0]!.before).toBe('Labo X')
  })

  it('réconcilie refs ↔ items : préserve la saisie de 3, ajoute 13', () => {
    const existing: VariationItem[] = [
      {
        ref: 3,
        nature: 'X',
        class: 'majeure',
        rubrique: '',
        before: 'a',
        after: 'b',
        justification: 'c',
      },
    ]
    const r = seedVariationItems([3, 13], PRODUCT, existing)
    expect(r).toHaveLength(2)
    expect(r[0]!.ref).toBe(3)
    expect(r[0]!.before).toBe('a') // saisie préservée
    expect(r[1]!.ref).toBe(13) // ajouté
  })
})
