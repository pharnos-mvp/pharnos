import type { JSONContent } from '@tiptap/core'
import { describe, expect, it } from 'vitest'

import { TEMPLATES, templateKeyForNode, type TemplateContext } from './templates'

function plain(node: JSONContent): string {
  const self = node.text ?? ''
  const kids = (node.content ?? []).map(plain).join(' ')
  return `${self} ${kids}`.trim()
}

const ctx: TemplateContext = {
  nomCommercial: 'KV-Kacin 500',
  dci: 'Amikacine',
  dosage: '500 mg / 2 ml',
  forme: 'Solution injectable',
  presentation: 'flacon de 2 ml',
  demandeur: 'KESHAVLAL VAJECHAND',
  fabricant: 'PHARMAX INDIA PRIVATE LIMITED',
  agencyName: 'AIRP',
  agencyFull: 'Autorité Ivoirienne de Régulation Pharmaceutique',
  country: 'CI',
  ville: 'Mumbai',
  date: '12 mai 2026',
  pght: '5 000',
}

describe('templates (génération de documents)', () => {
  it('Cover : objet + infos produit + agence', () => {
    const text = plain(TEMPLATES.cover.build(ctx))
    expect(text).toContain('AMM du produit KV-Kacin 500')
    expect(text).toContain('Amikacine')
    expect(text).toContain('KESHAVLAL VAJECHAND')
    expect(text).toContain('Autorité Ivoirienne de Régulation Pharmaceutique')
  })

  it('PGHT : objet + montant', () => {
    const text = plain(TEMPLATES.pght.build(ctx))
    expect(text).toContain('Attestation de Prix Grossiste Hors Taxe')
    expect(text).toContain('5 000')
  })

  it('liaison nœud → template selon le format', () => {
    expect(templateKeyForNode('ctd', '1.1.1')).toBe('cover')
    expect(templateKeyForNode('ctd', '1.1.2')).toBe('pght')
    expect(templateKeyForNode('ectd', '1.0.1')).toBe('cover')
    expect(templateKeyForNode('ctd', '1.3.1')).toBeUndefined()
  })

  it('valeurs manquantes → marqueurs à compléter', () => {
    const text = plain(TEMPLATES.cover.build({ ...ctx, dci: '', dosage: '' }))
    expect(text).toContain('[DCI et dosage]')
  })
})
