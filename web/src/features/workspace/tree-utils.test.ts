import { describe, expect, it } from 'vitest'

import type { CtdNodeDef } from './module1-tree'
import { addChildNode, assignIds, deleteNode, moveNode, newNode, renameNode } from './tree-utils'

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
})
