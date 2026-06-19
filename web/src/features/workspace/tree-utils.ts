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

/**
 * Fusionne dans l'arbre du dossier les sections du modèle par défaut **manquantes** (par numéro),
 * sans toucher au contenu, à l'ordre ni aux ids existants. Sert à mettre à jour un dossier créé
 * avant l'évolution du modèle.
 */
export function mergeDefaultTree(current: CtdNodeDef[], def: CtdNodeDef[]): CtdNodeDef[] {
  const result = current.map((c) => {
    const d = def.find((x) => x.number === c.number)
    return d?.children?.length
      ? { ...c, children: mergeDefaultTree(c.children ?? [], d.children) }
      : c
  })
  for (const d of def) {
    if (!result.some((c) => c.number === d.number)) {
      result.push(assignIds([structuredClone(d)])[0]!)
    }
  }
  return result
}

/** Vrai si une section du modèle par défaut est absente de l'arbre du dossier (structure obsolète). */
export function isTreeOutdated(current: CtdNodeDef[], def: CtdNodeDef[]): boolean {
  const nums = new Set(flattenTree(current).map((n) => n.number))
  return flattenTree(def).some((n) => !nums.has(n.number))
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

/** Un nœud VISIBLE (expansion respectée), aplati dans l'ordre d'affichage. */
export interface VisibleNode {
  id: string
  node: CtdNodeDef
  level: number
  hasChildren: boolean
  expanded: boolean
  parentId: string | null
}

/**
 * Aplatit les nœuds VISIBLES (ordre d'affichage, expansion respectée) → support de la navigation
 * clavier WAI-ARIA de l'arbre (roving tabindex : ↑↓ entre nœuds visibles, →← déplier/replier/parent).
 * `collapsed` = ids repliés (absent ⇒ déplié). Pur → testable.
 */
export function flattenVisible(
  nodes: CtdNodeDef[],
  collapsed: ReadonlySet<string>,
  level = 1,
  parentId: string | null = null,
): VisibleNode[] {
  const out: VisibleNode[] = []
  for (const node of nodes) {
    const id = node.id ?? node.number
    const hasChildren = Boolean(node.children?.length)
    const expanded = hasChildren && !collapsed.has(id)
    out.push({ id, node, level, hasChildren, expanded, parentId })
    if (expanded) out.push(...flattenVisible(node.children ?? [], collapsed, level + 1, id))
  }
  return out
}
