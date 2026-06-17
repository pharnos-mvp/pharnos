import type { JSONContent } from '@tiptap/core'

import type { DocumentRecord, DossierAttachmentRecord, GeneratedDocRecord } from '@/lib/db'
import { tStatic } from '@/lib/i18n-context'
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
  /** Origine : 'ai' = Regafy (copilote Vertex) ; 'monitor' = vérifs déterministes gratuites ; 'rule' = legacy. */
  source?: 'rule' | 'ai' | 'monitor'
  /** Pièce concernée (constats de validité IA) — clé du merge incrémental. */
  pieceId?: string
  /** Document à traduire (langue ≠ pays) — affiche un bouton « Traduire ». */
  translate?: boolean
  /** Langue détectée du document (code ISO 639-1). */
  language?: string
  /** Document non conforme au template en vigueur — affiche un bouton « Upgrader ». */
  upgrade?: boolean
  /** Rubriques manquantes/non conformes (détail du constat de conformité). */
  missing?: string[]
  /** Analyse SANS constat : remarque positive consignée au panneau (pastille émeraude). */
  ok?: boolean
  /** Nature du constat (validity / conformity / completeness…) — dédup « un constat par doc et par
   *  nature » (recette n°6) : un constat Monitor cède à l'IA sur le même (nœud, topic). */
  topic?: string
  /** Date de fin de validité relevée (yyyy-mm-dd) — verdict conforme daté (point 4). */
  validUntil?: string
  /** Mois de validité restants relevés — verdict conforme daté. */
  validityMonths?: number
}

export interface RegafyInput {
  tree: CtdNodeDef[]
  titulaire: string
  /** Nom du fabricant — pour la règle « titulaire ≠ fabricant : contrat requis ». */
  fabricant?: string
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
  const { tree, titulaire, fabricant, docsByNode, genByNode, attachByNode } = input
  const findings: RegafyFinding[] = []
  const push = (n: CtdNodeDef, severity: RegafySeverity, message: string) =>
    findings.push({
      id: `${n.number}:${message}`,
      nodeNumber: n.number,
      nodeLabel: n.label,
      severity,
      message,
    })

  const allNodes = flattenTree(tree)
  const leaves = allNodes.filter((n) => !n.children?.length)
  const labelOf = (num: string) => allNodes.find((n) => n.number === num)?.label ?? ''
  const today = new Date()

  // ── Validité des pièces (toutes sections) : administratives ≥ 6 mois, COA ≥ 18 mois ──────
  const monthsLeft = (d: Date) => (d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24 * 30.4375)
  for (const [num, docs] of docsByNode) {
    for (const d of docs) {
      if (!d.expiryDate) continue
      const exp = new Date(d.expiryDate)
      const minMonths = d.docType === 'coa' ? 18 : d.category === 'admin' ? 6 : 0
      let severity: RegafySeverity | null = null
      let message = ''
      if (exp < today) {
        severity = 'error'
        message = tStatic({
          fr: `Pièce expirée (${d.expiryDate})`,
          en: `Item expired (${d.expiryDate})`,
        })
      } else if (minMonths > 0 && monthsLeft(exp) < minMonths) {
        severity = 'warning'
        message =
          d.docType === 'coa'
            ? tStatic({
                fr: `COA : validité < 18 mois requise (expire le ${d.expiryDate})`,
                en: `CoA: 18-month validity required (expires ${d.expiryDate})`,
              })
            : tStatic({
                fr: `Validité < 6 mois requise (expire le ${d.expiryDate})`,
                en: `6-month validity required (expires ${d.expiryDate})`,
              })
      }
      if (severity) {
        findings.push({
          id: `${num}:${d.id}:val`,
          nodeNumber: num,
          nodeLabel: labelOf(num),
          severity,
          message,
          topic: 'validity',
        })
      }
    }
  }

  // ── Titulaire ≠ fabricant : contrat (licence/fabrication) requis ──────────────────────────
  const fab = (fabricant ?? '').trim()
  const norm = (s: string) => s.trim().toLowerCase()
  if (titulaire.trim() && fab && norm(titulaire) !== norm(fab)) {
    let hasContract = false
    for (const docs of docsByNode.values()) {
      if (docs.some((d) => d.docType === 'contract')) {
        hasContract = true
        break
      }
    }
    if (!hasContract) {
      findings.push({
        id: 'contract',
        nodeNumber: '',
        nodeLabel: tStatic({ fr: 'Produit', en: 'Product' }),
        severity: 'warning',
        message: tStatic({
          fr: 'Titulaire ≠ fabricant : contrat (licence/fabrication) non fourni.',
          en: 'MA holder ≠ manufacturer: contract (licence/manufacturing) not provided.',
        }),
      })
    }
  }

  // ── Complétude : « Champs à compléter » est automatique (cf. plus bas) ; les autres contrôles
  //    progressifs (section validée sans pièce, dossier vide, titulaire) restent gardés sur savedAt.
  const savedLeaves = leaves.filter((n) => n.savedAt)

  let anyContent = false
  for (const leaf of leaves) {
    const has =
      (docsByNode.get(leaf.number)?.length ?? 0) > 0 ||
      Boolean(genByNode.get(leaf.number)) ||
      (attachByNode.get(leaf.number)?.length ?? 0) > 0
    if (has) anyContent = true
  }

  // « Champs à compléter dans le document » : déclenché AUTOMATIQUEMENT dès qu'un document GÉNÉRÉ
  // (lettre ou template) porte encore des [...] non remplis — l'utilisateur a « engagé » la section
  // en générant le document ; aucune validation manuelle, sauvegarde auto en arrière-plan
  // (online/offline). Affiché en continu au panneau Remarques ET au gate de compilation : si l'user
  // quitte la section ou compile en laissant des champs vides, le constat reste visible.
  for (const leaf of leaves) {
    const gen = genByNode.get(leaf.number)
    // Les FORMULAIRES (templateKey 'fill') ont leurs champs vides OMIS du contenu (jamais des [...])
    // → vérifiés « form-aware » côté page (champs comptés via la définition). Ici : lettres/squelettes.
    if (gen && gen.templateKey !== 'fill' && hasPlaceholder(gen.content)) {
      push(
        leaf,
        'warning',
        tStatic({
          fr: 'Champs à compléter dans le document',
          en: 'Fields to complete in the document',
        }),
      )
    }
  }

  // « Section validée sans document » reste réservé aux sections explicitement validées (savedAt) :
  // on n'alerte pas sur les sections jamais démarrées.
  for (const leaf of savedLeaves) {
    const docs = docsByNode.get(leaf.number) ?? []
    const gen = genByNode.get(leaf.number)
    const atts = attachByNode.get(leaf.number) ?? []
    const has = docs.length > 0 || Boolean(gen) || atts.length > 0
    if (!has)
      push(
        leaf,
        'warning',
        tStatic({ fr: 'Section validée sans document', en: 'Validated section without document' }),
      )
  }

  if (!anyContent && savedLeaves.length > 0) {
    findings.push({
      id: 'empty',
      nodeNumber: '',
      nodeLabel: tStatic({ fr: 'Dossier', en: 'Dossier' }),
      severity: 'error',
      message: tStatic({
        fr: 'Dossier vide : aucun document.',
        en: 'Empty dossier: no documents.',
      }),
    })
  }

  if (savedLeaves.length > 0 && !titulaire.trim()) {
    findings.push({
      id: 'titulaire',
      nodeNumber: '',
      nodeLabel: tStatic({ fr: 'Produit', en: 'Product' }),
      severity: 'warning',
      message: tStatic({
        fr: "Titulaire / demandeur d'AMM non renseigné (fiche produit).",
        en: 'MA holder / applicant not set (product sheet).',
      }),
    })
  }

  return findings
}
