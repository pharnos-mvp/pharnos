import { describe, expect, it } from 'vitest'

import {
  getModule1Tree,
  nodeForDocType,
  resolveExistingNode,
  treeNodeNumbers,
  variationTree,
} from './module1-tree'
import { flattenTree } from './tree-utils'

describe('module1-tree — CTD UEMOA (section 1.2 détaillée)', () => {
  it('expose les sous-rubriques 1.2.3.x / 1.2.5.1 / 1.2.6.x / 1.2.8.1', () => {
    const numbers = flattenTree(getModule1Tree('ctd')).map((n) => n.number)
    for (const n of [
      '1.2.3.1',
      '1.2.3.2',
      '1.2.3.3',
      '1.2.3.4',
      '1.2.4.3',
      '1.2.5.1',
      '1.2.6.1',
      '1.2.6.2',
      '1.2.8.1',
    ]) {
      expect(numbers).toContain(n)
    }
  })

  it('porte la guidance réglementaire (note) sur 1.2.8 et 1.2.8.1', () => {
    const flat = flattenTree(getModule1Tree('ctd'))
    expect(flat.find((n) => n.number === '1.2.8')?.note).toBeTruthy()
    expect(flat.find((n) => n.number === '1.2.8.1')?.note).toContain('bioéquivalence')
  })

  it('auto-classe les pièces vers les nouvelles feuilles', () => {
    expect(nodeForDocType('ctd', 'copp', 'admin')).toBe('1.2.3.2')
    expect(nodeForDocType('ctd', 'coa', 'admin')).toBe('1.2.3.4')
    expect(nodeForDocType('ctd', 'amm', 'admin')).toBe('1.2.6.1')
    expect(nodeForDocType('ctd', 'fsc', 'admin')).toBe('1.2.4.3')
    expect(nodeForDocType('ctd', 'gmp', 'admin')).toBe('1.2.4.1')
  })

  it('resolveExistingNode : replie sur le plus proche ancêtre présent dans l’arbre', () => {
    // Arbre sans la feuille détaillée 1.2.3.2 → un COPP doit retomber sur 1.2.3 (ancêtre existant).
    const partial = new Set(['1.2', '1.2.3', '1.3'])
    expect(resolveExistingNode(partial, '1.2.3.2')).toBe('1.2.3')
    // Sans 1.2.3 non plus → remonte à 1.2.
    expect(resolveExistingNode(new Set(['1.2', '1.3']), '1.2.3.2')).toBe('1.2')
    // La feuille existe → on la garde telle quelle.
    const full = treeNodeNumbers(getModule1Tree('ctd'))
    expect(resolveExistingNode(full, '1.2.3.2')).toBe('1.2.3.2')
    expect(resolveExistingNode(full, '1.2.4.3')).toBe('1.2.4.3')
  })

  it('1.3.3 Étiquetage = page de garde avec sous-sections primaire / extérieur (CTD)', () => {
    const flat = flattenTree(getModule1Tree('ctd'))
    const node = flat.find((n) => n.number === '1.3.3')
    expect(node?.children?.map((c) => c.number)).toEqual(['1.3.3.1', '1.3.3.2'])
    const numbers = flat.map((n) => n.number)
    expect(numbers).toContain('1.3.3.1')
    expect(numbers).toContain('1.3.3.2')
  })

  it('auto-classe étiquetage/artwork vers les sous-sections 1.3.3.x (CTD)', () => {
    expect(nodeForDocType('ctd', 'labeling', 'info')).toBe('1.3.3.1')
    expect(nodeForDocType('ctd', 'artwork', 'info')).toBe('1.3.3.2')
  })
})

describe('module1-tree — VARIATION (Annexe N°2)', () => {
  it('getModule1Tree(ctd, variation) sert l’arbre de variation complet (cœur + conditionnels)', () => {
    const nums = treeNodeNumbers(getModule1Tree('ctd', 'variation'))
    for (const n of ['1.0', '1.1.1', '1.2.1', '1.2.2', '1.2.7', '1.4.1', '1.4.2']) {
      expect(nums.has(n)).toBe(true) // cœur
    }
    for (const n of ['1.2.3', '1.2.4', '1.3.1', '1.3.2', '1.3.3']) {
      expect(nums.has(n)).toBe(true) // conditionnels (présents sans sélection)
    }
    const flat = flattenTree(getModule1Tree('ctd', 'variation'))
    expect(flat.find((n) => n.number === '1.1.1')?.label).toBe('Lettre de demande de variation')
  })

  it('taille les nœuds conditionnels selon les variations cochées', () => {
    // n°8 (diminution de prix) : aucun domaine produit/site → 1.2.3/1.2.4 et 1.3.* retirés, cœur intact.
    const priceOnly = treeNodeNumbers(variationTree([8]))
    for (const n of ['1.2.3', '1.2.4', '1.3.1', '1.3.2', '1.3.3', '1.3']) {
      expect(priceOnly.has(n)).toBe(false)
    }
    for (const n of ['1.0', '1.1.1', '1.2.1', '1.2.2', '1.2.7', '1.4.1', '1.4.2']) {
      expect(priceOnly.has(n)).toBe(true)
    }
    // n°42 (RCP/notice) : 1.3.1 + 1.3.2 conservés, 1.3.3 retiré ; pas de site.
    const rcp = treeNodeNumbers(variationTree([42]))
    expect(rcp.has('1.3.1')).toBe(true)
    expect(rcp.has('1.3.2')).toBe(true)
    expect(rcp.has('1.3.3')).toBe(false)
    expect(rcp.has('1.2.4')).toBe(false)
    // n°13 (changement de site) : 1.2.3 + 1.2.4 conservés, bloc produit 1.3 retiré.
    const site = treeNodeNumbers(variationTree([13]))
    expect(site.has('1.2.3')).toBe(true)
    expect(site.has('1.2.4')).toBe(true)
    expect(site.has('1.3')).toBe(false)
  })

  it('sans variation → arbre complet ; n’ampute jamais le cœur', () => {
    expect(treeNodeNumbers(variationTree()).has('1.3.1')).toBe(true)
    expect(treeNodeNumbers(variationTree([])).has('1.3.1')).toBe(true)
  })

  it('« Autre » (n°0, non répertoriée) → arbre COMPLET (domaine inconnu)', () => {
    const nums = treeNodeNumbers(variationTree([0]))
    for (const n of ['1.2.3', '1.2.4', '1.3.1', '1.3.2', '1.3.3']) {
      expect(nums.has(n)).toBe(true)
    }
  })

  it('n’altère pas Nouvelle AMM / Renouvellement (mêmes arbres qu’avant)', () => {
    expect(getModule1Tree('ctd')).toBe(getModule1Tree('ctd', 'new_ma'))
    expect(treeNodeNumbers(getModule1Tree('ctd', 'renewal')).has('1.2.8.1')).toBe(true)
    // eCTD variation → repli sur l'arbre eCTD standard (cadre validé = CTD UEMOA).
    expect(treeNodeNumbers(getModule1Tree('ectd', 'variation')).has('1.10')).toBe(true)
  })
})
