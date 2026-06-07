import { describe, expect, it } from 'vitest'

import { getModule1Tree, nodeForDocType } from './module1-tree'
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
})
