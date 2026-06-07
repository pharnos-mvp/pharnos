import type { CtdNodeDef } from './module1-tree'

const uid = () => crypto.randomUUID()

/** Assigne un id stable à chaque nœud (récursif). Idempotent (préserve les id existants). */
export function assignIds(nodes: CtdNodeDef[]): CtdNodeDef[] {
  return nodes.map((n) => ({
    ...n,
    id: n.id ?? uid(),
    children: n.children ? assignIds(n.children) : undefined,
  }))
}

export function renameNode(nodes: CtdNodeDef[], id: string, label: string): CtdNodeDef[] {
  return nodes.map((n) =>
    n.id === id
      ? { ...n, label }
      : { ...n, children: n.children ? renameNode(n.children, id, label) : undefined },
  )
}

/** Marque une section comme validée (savedAt) — récursif. */
export function setNodeSaved(nodes: CtdNodeDef[], id: string, savedAt: string): CtdNodeDef[] {
  return nodes.map((n) =>
    n.id === id
      ? { ...n, savedAt }
      : { ...n, children: n.children ? setNodeSaved(n.children, id, savedAt) : undefined },
  )
}

export function deleteNode(nodes: CtdNodeDef[], id: string): CtdNodeDef[] {
  return nodes
    .filter((n) => n.id !== id)
    .map((n) => ({ ...n, children: n.children ? deleteNode(n.children, id) : undefined }))
}

export function addChildNode(
  nodes: CtdNodeDef[],
  parentId: string | null,
  child: CtdNodeDef,
): CtdNodeDef[] {
  if (parentId === null) return [...nodes, child]
  return nodes.map((n) => {
    if (n.id === parentId) return { ...n, children: [...(n.children ?? []), child] }
    return { ...n, children: n.children ? addChildNode(n.children, parentId, child) : undefined }
  })
}

/** Déplace un nœud parmi ses frères (dir = -1 monter, +1 descendre). */
export function moveNode(nodes: CtdNodeDef[], id: string, dir: -1 | 1): CtdNodeDef[] {
  const idx = nodes.findIndex((n) => n.id === id)
  if (idx !== -1) {
    const target = idx + dir
    if (target < 0 || target >= nodes.length) return nodes
    const copy = [...nodes]
    const moved = copy[idx]
    if (!moved) return nodes
    copy.splice(idx, 1)
    copy.splice(target, 0, moved)
    return copy
  }
  return nodes.map((n) => ({
    ...n,
    children: n.children ? moveNode(n.children, id, dir) : undefined,
  }))
}

export function newNode(label = 'Nouvelle section'): CtdNodeDef {
  return { id: uid(), number: '', label }
}

/** Aplatit l'arbre en liste (utile pour complétude/comptage). */
export function flattenTree(nodes: CtdNodeDef[]): CtdNodeDef[] {
  return nodes.flatMap((n) => [n, ...(n.children ? flattenTree(n.children) : [])])
}
