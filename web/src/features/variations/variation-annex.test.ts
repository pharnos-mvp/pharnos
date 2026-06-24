import { describe, expect, it } from 'vitest'

import { emptyLetterFields } from '@/features/workspace/letter-context'
import { parseTiptapContent } from '@/features/workspace/tiptap-schema'
import { buildVariationTableContent } from './variation-annex'
import { seedVariationItems, type VariationRequest } from './variation-request'

const request: VariationRequest = {
  title: '',
  fields: {
    ...emptyLetterFields('BJ'),
    nomCommercial: 'Gynoril',
    ammNumero: 'AMM_2015_7457',
  },
  items: seedVariationItems([3], undefined, [
    {
      ref: 3,
      class: 'mineure',
      rubrique: '',
      nature: 'Changement du nom du médicament',
      before: 'Gynoril',
      after: 'Gynoril Plus',
      justification: 'Harmonisation régionale',
    },
  ]),
  groupingRuleIndex: null,
}

describe('buildVariationTableContent', () => {
  it('produit un doc TipTap valide avec un tableau seedé (annexe éditable + compilable, zéro perte)', () => {
    const content = buildVariationTableContent(request, 'fr')
    // Le schéma l'accepte (sinon mise en quarantaine au rechargement = perte).
    expect(parseTiptapContent(content)).not.toBeNull()
    // Le document porte un nœud `table` (rendu par drawTable à la compilation).
    expect(content.content?.some((n) => n.type === 'table')).toBe(true)
    // Les données seedées (cellules + méta) sont présentes.
    const json = JSON.stringify(content)
    expect(json).toContain('Gynoril Plus')
    expect(json).toContain('AMM_2015_7457')
  })

  it('en anglais : titre EN', () => {
    const content = buildVariationTableContent(request, 'en')
    expect(JSON.stringify(content)).toContain('ANNEX — VARIATION TABLE')
  })
})
