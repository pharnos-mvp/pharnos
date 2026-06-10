import type { JSONContent } from '@tiptap/core'

import type { DocumentRecord, DossierAttachmentRecord, GeneratedDocRecord } from '@/lib/db'
import type { CtdNodeDef } from './module1-tree'
import { flattenTree } from './tree-utils'

/**
 * Regafy v1 — vérifications **déterministes** du dossier (assistif, jamais bloquant).
 * (La couche IA / Vertex enrichira ces constats dans le M4 complet.)
 */

export type RegafySeverity = 'error' | 'warning' | 'info'

export interface RegafyFinding {
  id: string
  /** Nœud concerné (numéro CTD) ; '' = constat global. */
  nodeNumber: string
  nodeLabel: string
  severity: RegafySeverity
  message: string
  /** Origine : 'ai' = enrichissement Vertex (assistif) ; sinon règle déterministe. */
  source?: 'rule' | 'ai'
}

export interface RegafyInput {
  tree: CtdNodeDef[]
  titulaire: string
  docsByNode: Map<string, DocumentRecord[]>
  genByNode: Map<string, GeneratedDocRecord>
  attachByNode: Map<string, DossierAttachmentRecord[]>
}

/** Extrait le texte brut d'un document TipTap/ProseMirror (réutilisé par l'analyse IA). */
export function tiptapText(node: JSONContent): string {
  return (node.text ?? '') + (node.content ?? []).map(tiptapText).join(' ')
}

function hasPlaceholder(content: unknown): boolean {
  try {
    return /\[[^\]\n]{2,}\]/.test(tiptapText(content as JSONContent))
  } catch {
    return false
  }
}

/** Sévérité maximale d'un ensemble de constats (error > warning > info). */
export function maxSeverity(findings: RegafyFinding[]): RegafySeverity | null {
  if (findings.some((f) => f.severity === 'error')) return 'error'
  if (findings.some((f) => f.severity === 'warning')) return 'warning'
  if (findings.some((f) => f.severity === 'info')) return 'info'
  return null
}

export function runRegafy(input: RegafyInput): RegafyFinding[] {
  const { tree, titulaire, docsByNode, genByNode, attachByNode } = input
  const findings: RegafyFinding[] = []
  const push = (n: CtdNodeDef, severity: RegafySeverity, message: string) =>
    findings.push({
      id: `${n.number}:${message}`,
      nodeNumber: n.number,
      nodeLabel: n.label,
      severity,
      message,
    })

  const leaves = flattenTree(tree).filter((n) => !n.children?.length)
  // Progressif : on ne signale que les sections déjà validées (« dépassées ») par l'utilisateur.
  const savedLeaves = leaves.filter((n) => n.savedAt)
  if (savedLeaves.length === 0) return []

  const today = new Date()
  const soon = new Date()
  soon.setDate(soon.getDate() + 90)

  let anyContent = false
  for (const leaf of leaves) {
    const has =
      (docsByNode.get(leaf.number)?.length ?? 0) > 0 ||
      Boolean(genByNode.get(leaf.number)) ||
      (attachByNode.get(leaf.number)?.length ?? 0) > 0
    if (has) anyContent = true
  }

  for (const leaf of savedLeaves) {
    const docs = docsByNode.get(leaf.number) ?? []
    const gen = genByNode.get(leaf.number)
    const atts = attachByNode.get(leaf.number) ?? []
    const has = docs.length > 0 || Boolean(gen) || atts.length > 0

    if (!has) push(leaf, 'warning', 'Section validée sans document')
    if (gen && hasPlaceholder(gen.content)) {
      push(leaf, 'warning', 'Champs à compléter dans le document')
    }

    for (const d of docs) {
      if (!d.expiryDate) continue
      const exp = new Date(d.expiryDate)
      const sev: RegafySeverity | null = exp < today ? 'error' : exp <= soon ? 'warning' : null
      if (!sev) continue
      findings.push({
        id: `${leaf.number}:${d.id}:exp`, // identifiant par pièce → pas de collision de clé
        nodeNumber: leaf.number,
        nodeLabel: leaf.label,
        severity: sev,
        message:
          sev === 'error'
            ? `Pièce expirée (${d.expiryDate})`
            : `Pièce bientôt expirée (${d.expiryDate})`,
      })
    }
  }

  if (!anyContent) {
    findings.push({
      id: 'empty',
      nodeNumber: '',
      nodeLabel: 'Dossier',
      severity: 'error',
      message: 'Dossier vide : aucun document.',
    })
  }

  if (!titulaire.trim()) {
    findings.push({
      id: 'titulaire',
      nodeNumber: '',
      nodeLabel: 'Produit',
      severity: 'warning',
      message: "Titulaire / demandeur d'AMM non renseigné (fiche produit).",
    })
  }

  return findings
}
