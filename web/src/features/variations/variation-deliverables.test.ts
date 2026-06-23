import { describe, expect, it } from 'vitest'

import { emptyLetterFields } from '@/features/workspace/letter-context'
import { VARIATIONS } from './variation-catalog'
import { itemFromVariation, type VariationItem, type VariationRequest } from './variation-request'
import { buildComparisonTable } from './variation-table'
import { buildComparisonDocx } from './variation-table-docx'
import { comparisonPdfBytes } from './variation-table-pdf'
import { buildVariationLetterDoc, variationLetterContextFields } from './variation-letter'

function item(n: number, patch: Partial<VariationItem> = {}): VariationItem {
  const found = VARIATIONS.find((x) => x.n === n)!
  return { ...itemFromVariation(found, found.nature.fr), ...patch }
}
function request(items: VariationItem[]): VariationRequest {
  return {
    title: 'Demande test',
    fields: {
      ...emptyLetterFields('BJ'),
      nomCommercial: 'Gynoril Ovule',
      ammNumero: 'BJ-2024-001',
    },
    items,
    groupingRuleIndex: items.length > 1 ? 0 : null,
  }
}

describe('tableau comparatif', () => {
  it('buildComparisonTable : 5 colonnes, 1 ligne / item, méta produit/AMM/pays', () => {
    const table = buildComparisonTable(
      request([
        item(37, { before: 'Lactose 50 mg', after: 'Mannitol 50 mg', justification: 'Stabilité' }),
      ]),
    )
    expect(table.headers).toHaveLength(5)
    expect(table.headers[0]).toBe('N°')
    expect(table.rows).toHaveLength(1)
    expect(table.rows[0]).toEqual([
      '37',
      VARIATIONS.find((v) => v.n === 37)!.nature.fr,
      'Lactose 50 mg',
      'Mannitol 50 mg',
      'Stabilité',
    ])
    const meta = Object.fromEntries(table.meta.map((m) => [m.label, m.value]))
    expect(meta['Produit']).toBe('Gynoril Ovule')
    expect(meta['N° d’AMM']).toBe('BJ-2024-001')
    expect(meta['Pays']).toBe('Bénin')
    expect(table.footnote).toBeUndefined()
  })

  it('aucune note de redevance sur le document tableau (frais portés par la Roadmap)', () => {
    // Les frais/échantillons/délais vivent désormais sur la Roadmap du dossier, répartis par
    // activité réglementaire — le document tableau reste « propre », même en multi-variation.
    expect(buildComparisonTable(request([item(13), item(40)])).footnote).toBeUndefined()
  })

  it('rubrique concaténée à la nature dans la cellule', () => {
    const table = buildComparisonTable(request([item(42, { rubrique: 'RCP §4.8' })]))
    expect(table.rows[0]![1]).toContain('RCP §4.8')
  })

  it('masque la colonne Justification si aucun item ne la renseigne', () => {
    const sans = buildComparisonTable(request([item(13), item(40)])) // aucune justification
    expect(sans.headers).toHaveLength(4)
    expect(sans.headers).not.toContain('Justification')
    expect(sans.colFractions).toHaveLength(4)
    expect(sans.rows[0]).toHaveLength(4)
    const avec = buildComparisonTable(
      request([item(13, { justification: 'données de stabilité' })]),
    )
    expect(avec.headers).toHaveLength(5)
    expect(avec.headers).toContain('Justification')
    expect(avec.colFractions).toHaveLength(5)
  })

  it('comparisonPdfBytes : génère un vrai PDF (en-tête %PDF), gère accents/em-dash', async () => {
    const bytes = await comparisonPdfBytes(
      buildComparisonTable(request([item(37, { before: 'a — b', after: 'é à ç' })])),
    )
    expect(bytes.length).toBeGreaterThan(500)
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-')
  })

  it('buildComparisonDocx : construit le document sans lever', () => {
    expect(() =>
      buildComparisonDocx(buildComparisonTable(request([item(13), item(40)]))),
    ).not.toThrow()
  })
})

describe('lettre de demande de variation', () => {
  it('buildVariationLetterDoc : réf AMM+date, « variation » singulier, annexe, SANS pièces jointes', () => {
    const doc = buildVariationLetterDoc(request([item(40)]), 'fr')
    const s = JSON.stringify(doc)
    expect(doc.type).toBe('doc')
    expect(s).toContain('Demande de variation')
    expect(s).toContain('Gynoril Ovule')
    expect(s).toContain('AMM n° BJ-2024-001 du') // réf = n° + date d'octroi (pas la date du jour)
    expect(s).toContain('La variation sollicitée porte sur') // singulier (1 variation)
    expect(s).toContain('en annexe') // renvoi au tableau comparatif
    expect(s).not.toContain('Pièces jointes') // retiré (la lettre EST la demande)
    expect(s).not.toContain('modification') // « variation » partout
    expect(s).toContain(VARIATIONS.find((v) => v.n === 40)!.nature.fr)
  })

  it('accord PLURIEL quand plusieurs variations', () => {
    const s = JSON.stringify(buildVariationLetterDoc(request([item(13), item(40)]), 'fr'))
    expect(s).toContain('Les variations sollicitées portent sur')
  })

  it('variationLetterContextFields : classe globale, natures et union des pièces depuis les n°', () => {
    const f = variationLetterContextFields([8, 13], 'fr') // 8 mineure, 13 majeure
    expect(f.variationClass).toBe('majeure')
    expect(f.variationItems).toHaveLength(2)
    expect(f.variationItems).toContain(VARIATIONS.find((v) => v.n === 13)!.nature.fr)
    expect(f.variationPieces).toContain('Module 1') // 13 majeure → Module 1 dans l'union
  })

  it('rend aussi en anglais (singulier, sans Enclosures)', () => {
    const s = JSON.stringify(buildVariationLetterDoc(request([item(40)]), 'en'))
    expect(s).toContain('Application for a major variation')
    expect(s).toContain('The requested variation concerns')
    expect(s).not.toContain('Enclosures')
  })
})
