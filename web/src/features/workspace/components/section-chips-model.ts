// Modèle PUR (zéro React/DOM) de la barre de SECTIONS (pastilles) du CTD builder sous `lg`.
// La logique « quelles pastilles, dans quel état » est testable isolément et constitue la source
// unique de vérité consommée par SectionChips (écran) et les tests. Cf. document-header-model.ts.
import type { CtdNodeDef } from '../module1-tree'

export interface SectionChip {
  id: string
  /** Numéro de section affiché (réglementaire — non traduit) ; '•' pour un nœud sans numéro. */
  number: string
  /** Libellé de structure CTD (réglementaire — non traduit) ; sert au nom accessible. */
  label: string
  node: CtdNodeDef
  active: boolean
  hasContent: boolean
  flagged: boolean
}

/**
 * Dérive les pastilles depuis l'arbre APLATI (ordre d'affichage) + l'état du workspace.
 * - `active` : nœud sélectionné (par id, repli sur le numéro).
 * - `hasContent` : au moins une pièce classée sous le nœud (`countFor`).
 * - `flagged` : constat non résolu sur le nœud (`flaggedNodes`).
 */
export function buildSectionChips(
  flatNodes: CtdNodeDef[],
  selected: CtdNodeDef | null,
  countFor: (n: CtdNodeDef) => number,
  flaggedNodes: ReadonlySet<string>,
): SectionChip[] {
  return flatNodes.map((n) => ({
    id: n.id ?? n.number,
    number: n.number || '•',
    label: n.label,
    node: n,
    active: !!selected && (selected.id ?? selected.number) === (n.id ?? n.number),
    hasContent: countFor(n) > 0,
    flagged: flaggedNodes.has(n.number),
  }))
}
