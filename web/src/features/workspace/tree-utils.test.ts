import { describe, expect, it } from 'vitest'

import type { CtdNodeDef } from './module1-tree'
import {
  addChildNode,
  assignIds,
  deleteNode,
  flattenVisible,
  moveNode,
  newNode,
  renameNode,
} from './tree-utils'

function tree(): CtdNodeDef[] {
  return assignIds([
    { number: '1.0', label: 'A' },
    { number: '1.1', label: 'B', children: [{ number: '1.1.1', label: 'B1' }] },
  ])
}

describe('tree-utils (arborescence éditable)', () => {
  it('assignIds donne un id stable à chaque nœud', () => {
    const t = tree()
    expect(t[0]?.id).toBeTruthy()
    expect(t[1]?.children?.[0]?.id).toBeTruthy()
  })

  it('renomme un nœud (récursif)', () => {
    const t = tree()
    const childId = t[1]!.children![0]!.id!
    const renamed = renameNode(t, childId, 'B1 modifié')
    expect(renamed[1]?.children?.[0]?.label).toBe('B1 modifié')
  })

  it('ajoute un enfant à un parent', () => {
    const t = tree()
    const parentId = t[1]!.id!
    const updated = addChildNode(t, parentId, newNode('B2'))
    expect(updated[1]?.children).toHaveLength(2)
  })

  it('supprime un nœud', () => {
    const t = tree()
    const updated = deleteNode(t, t[0]!.id!)
    expect(updated).toHaveLength(1)
    expect(updated[0]?.number).toBe('1.1')
  })

  it('repositionne un nœud (monter/descendre)', () => {
    const t = tree()
    const moved = moveNode(t, t[1]!.id!, -1)
    expect(moved[0]?.number).toBe('1.1')
    expect(moved[1]?.number).toBe('1.0')
  })

  describe('flattenVisible (nav clavier WAI-ARIA de l’arbre)', () => {
    it('tout déplié : nœuds dans l’ordre + niveau/enfants/parent', () => {
      const t = tree()
      const vis = flattenVisible(t, new Set())
      expect(vis.map((v) => v.node.number)).toEqual(['1.0', '1.1', '1.1.1'])
      const parent = vis.find((v) => v.node.number === '1.1')!
      const child = vis.find((v) => v.node.number === '1.1.1')!
      expect(parent).toMatchObject({ level: 1, hasChildren: true, expanded: true, parentId: null })
      expect(child).toMatchObject({ level: 2, hasChildren: false, parentId: parent.id })
    })

    it('un nœud replié masque ses descendants', () => {
      const t = tree()
      const collapsed = new Set([t[1]!.id!])
      const vis = flattenVisible(t, collapsed)
      expect(vis.map((v) => v.node.number)).toEqual(['1.0', '1.1'])
      expect(vis.find((v) => v.node.number === '1.1')).toMatchObject({ expanded: false })
    })
  })
})
