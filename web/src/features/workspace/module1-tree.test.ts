import { describe, expect, it } from 'vitest'

import {
  getModule1Tree,
  nodeForDocType,
  resolveExistingNode,
  treeNodeNumbers,
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
