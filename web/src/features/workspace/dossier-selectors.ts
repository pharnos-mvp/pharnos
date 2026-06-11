// Sélecteurs PURS du workspace (extraits move-only de DossierWorkspacePage — T7.4/T7.5).
// Aucune dépendance React : unité-testables, le composant ne garde que l'orchestration.
import type {
  DocumentRecord,
  DossierAttachmentRecord,
  DossierRecord,
  GeneratedDocRecord,
} from '@/lib/db'
import {
  nodeForDocType,
  resolveExistingNode,
  treeNodeNumbers,
  type CtdNodeDef,
} from './module1-tree'

/** Clé de nœud rattachée à `node` : le nœud lui-même ou un de ses descendants. */
const matches = (key: string, node: CtdNodeDef): boolean =>
  key === node.number || (node.number !== '' && key.startsWith(`${node.number}.`))

/** Classe les documents produit par nœud (auto-classement, exclusions du dossier respectées). */
export function buildDocsByNode(
  dossier: DossierRecord | null | undefined,
  docs: DocumentRecord[] | undefined,
): Map<string, DocumentRecord[]> {
  const map = new Map<string, DocumentRecord[]>()
  if (!dossier) return map
  const excluded = new Set(dossier.excludedDocIds ?? [])
  const numbers = treeNodeNumbers(dossier.tree)
  for (const d of docs ?? []) {
    if (excluded.has(d.id)) continue
    // Repli sur l'ancêtre existant si la sous-section détaillée n'est pas dans l'arbre du dossier
    // → un COPP/FSC/… auto-classé reste toujours visible (et compilable).
    const node = resolveExistingNode(numbers, nodeForDocType(dossier.format, d.docType, d.category))
    map.set(node, [...(map.get(node) ?? []), d])
  }
  return map
}

export function docsForNode(
  docsByNode: Map<string, DocumentRecord[]>,
  node: CtdNodeDef,
): DocumentRecord[] {
  const out: DocumentRecord[] = []
  for (const [n, list] of docsByNode) if (matches(n, node)) out.push(...list)
  return out
}

export function genDocsForNode(
  genByNode: Map<string, GeneratedDocRecord>,
  node: CtdNodeDef,
): GeneratedDocRecord[] {
  const out: GeneratedDocRecord[] = []
  for (const [n, g] of genByNode) if (matches(n, node)) out.push(g)
  return out
}

export function attachmentsForNode(
  attachByNode: Map<string, DossierAttachmentRecord[]>,
  node: CtdNodeDef,
): DossierAttachmentRecord[] {
  const out: DossierAttachmentRecord[] = []
  for (const [n, list] of attachByNode) if (matches(n, node)) out.push(...list)
  return out
}

/** Prochaine feuille après `node` dans l'ordre de l'arbre (parcours « Enregistrer → suivant »). */
export function nextLeafAfter(flatNodes: CtdNodeDef[], node: CtdNodeDef): CtdNodeDef | null {
  const idx = flatNodes.findIndex((n) => n.id === node.id)
  for (let i = idx + 1; i < flatNodes.length; i++) {
    const n = flatNodes[i]
    if (n && !n.children?.length) return n
  }
  return null
}

/** Complétude : pourcentage de feuilles documentées (donut du panneau droit). */
export function completionStats(
  flatNodes: CtdNodeDef[],
  countFor: (node: CtdNodeDef) => number,
): { leaves: CtdNodeDef[]; okCount: number; pct: number } {
  const leaves = flatNodes.filter((n) => !n.children?.length)
  const filledLeaves = leaves.filter((n) => countFor(n) > 0)
  const pct = leaves.length ? Math.round((filledLeaves.length / leaves.length) * 100) : 0
  return { leaves, okCount: filledLeaves.length, pct }
}

/** Document visualisable du nœud sélectionné : lettre générée, pièce jointe ou document produit. */
export type Viewable =
  | { key: string; kind: 'letter'; label: string; isTranslation?: boolean }
  | {
      key: string
      kind: 'attachment' | 'doc'
      label: string
      id: string
      filePath: string | null
      fileName: string
    }

/** Construit les onglets visualisables du nœud (lettre d'abord, puis pièces, puis docs produit). */
export function buildViewables({
  selectedGenDoc,
  selectedAttachments,
  selectedDocs,
  translationSourceDoc,
  targetLangLabel,
}: {
  selectedGenDoc: GeneratedDocRecord | undefined
  selectedAttachments: DossierAttachmentRecord[]
  selectedDocs: DocumentRecord[]
  translationSourceDoc: { fileName: string } | undefined
  targetLangLabel: string
}): Viewable[] {
  const viewables: Viewable[] = []
  if (selectedGenDoc) {
    const isTranslation = selectedGenDoc.templateKey === 'translation'
    // Onglet façon navigateur : « <nom de l'original>_<LANG>.docx » pour une traduction.
    const transBase = (translationSourceDoc?.fileName ?? selectedGenDoc.title).replace(
      /\.[^.]+$/,
      '',
    )
    viewables.push({
      key: `letter:${selectedGenDoc.id}`,
      kind: 'letter',
      label: isTranslation ? `${transBase}_${targetLangLabel}.docx` : selectedGenDoc.title,
      isTranslation,
    })
  }
  for (const a of selectedAttachments) {
    viewables.push({
      key: `att:${a.id}`,
      kind: 'attachment',
      label: a.fileName,
      id: a.id,
      filePath: a.filePath,
      fileName: a.fileName,
    })
  }
  for (const d of selectedDocs) {
    viewables.push({
      key: `doc:${d.id}`,
      kind: 'doc',
      label: d.fileName,
      id: d.id,
      filePath: d.filePath,
      fileName: d.fileName,
    })
  }
  return viewables
}
