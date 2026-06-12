import { UPGRADE_DOC_TYPES } from './regafy-ai'
import type { RegafyFinding } from './regafy'

/**
 * Rapport d'audit global de conformité — DÉTERMINISTE, zéro hallucination par
 * construction : chaque ligne du rapport provient d'un constat réellement émis par
 * l'analyse (Edge Regafy ou règles structurelles) sur un document explicitement cité.
 * Aucune génération libre : la rédaction est un assemblage de formulations expertes
 * FIXES, conditionnelles aux constats.
 */

/** Une pièce examinée par l'audit (document produit, pièce jointe, lettre ou texte généré). */
export interface AuditPiece {
  /** Nom cité dans le rapport (fichier ou titre du document généré). */
  name: string
  nodeNumber: string
  nodeLabel: string
  /** Type documentaire (rcp, notice, gmp…) — '' pour une lettre générée. */
  docType: string
  kind: 'template' | 'admin' | 'lettre' | 'texte'
  /** Constats émis pour CETTE pièce (vide = aucun écart relevé). */
  findings: RegafyFinding[]
}

export interface AuditData {
  productName: string
  countryName: string
  agency: string
  format: string
  activity: string
  /** yyyy-mm-dd (date de l'audit). */
  date: string
  pieces: AuditPiece[]
  /** Constats structurels (arborescence : sections sans document, dossier vide, contrat…). */
  structural: RegafyFinding[]
}

export interface AuditSection {
  heading: string
  paragraphs?: string[]
  items?: string[]
  /** Lignes clé/valeur (tableau de référence). */
  rows?: Array<[string, string]>
}

export interface AuditReport {
  title: string
  subtitle: string
  sections: AuditSection[]
  footer: string
}

const KIND_LABEL: Record<AuditPiece['kind'], string> = {
  template: 'document à template',
  admin: 'pièce administrative',
  lettre: 'lettre générée',
  texte: 'document généré',
}

/** Statut d'une pièce examinée — uniquement depuis ses constats réels. */
export function pieceStatus(p: AuditPiece): 'conforme' | 'non conforme' | 'écart relevé' {
  const real = p.findings.filter((f) => !f.ok)
  if (real.length === 0) return 'conforme'
  return real.some((f) => f.severity === 'error') ? 'non conforme' : 'écart relevé'
}

/** Action recommandée — dérivée du constat (mêmes règles que la carte d'action). */
function recommendation(p: AuditPiece, f: RegafyFinding): string {
  if (p.kind === 'admin') return 'Remplacer la pièce par une version en cours de validité.'
  if (p.kind === 'lettre' || p.kind === 'texte') return 'Corriger le document dans son onglet.'
  const acts: string[] = ['remplir le template en vigueur']
  if (f.translate) acts.push('traduire vers le français')
  acts.push('ou remplacer le document')
  return `Action : ${acts.join(', ')}.`
}

export function buildAuditReport(data: AuditData): AuditReport {
  const examined = data.pieces.length
  const nonConform = data.pieces.filter((p) => pieceStatus(p) !== 'conforme')
  const conform = examined - nonConform.length
  const structuralReal = data.structural.filter((f) => !f.ok)
  const missing = structuralReal.filter((f) => f.missing && f.missing.length > 0)

  // 1. Référence du dossier — uniquement les métadonnées fournies.
  const reference: AuditSection = {
    heading: '1. Référence du dossier',
    rows: [
      ['Produit', data.productName || '—'],
      ['Pays cible', data.countryName || '—'],
      ['Autorité', data.agency || '—'],
      ['Procédure', data.activity || '—'],
      ['Format', data.format || '—'],
      ["Date de l'audit", data.date],
      ['Outil', 'Regafy — audit assisté, constats vérifiés document par document'],
    ],
  }

  // 2. Périmètre et méthodologie — politique d'analyse FIXE (celle du produit).
  const method: AuditSection = {
    heading: '2. Périmètre et méthodologie',
    paragraphs: [
      `L'audit a porté sur ${examined} document(s) du Module 1 ainsi que sur la structure de l'arborescence (séquence en cours de montage).`,
      'Politique appliquée : documents à template (RCP, Notice, Étiquetage, lettres) — vérification de la conformité au template en vigueur et de la langue de rédaction ; pièces administratives (GMP, COPP, AMM, contrats…) — vérification de la validité ; arborescence — complétude des sections et exigences structurelles du format.',
      "Seuls les constats issus de l'examen effectif des documents cités sont rapportés ; aucune appréciation n'est portée sur des documents non examinés.",
    ],
  }

  // 3. Synthèse chiffrée.
  const syntheseItems = [
    `Documents examinés : ${examined}`,
    `Conformes : ${conform}`,
    `Non conformes ou avec écart : ${nonConform.length}`,
    `Constats structurels (arborescence) : ${structuralReal.length}`,
  ]
  const synthese: AuditSection = {
    heading: '3. Synthèse',
    items: syntheseItems,
    paragraphs: [
      nonConform.length === 0 && structuralReal.length === 0
        ? 'Aucun écart relevé sur le périmètre examiné : le dossier est apte à la compilation.'
        : `${nonConform.length + structuralReal.length} point(s) à lever avant soumission — le détail document par document figure en sections 4 et 5.`,
    ],
  }

  // 4. Constats détaillés PAR DOCUMENT — citation systématique (fichier + nœud CTD).
  const detailItems = nonConform.flatMap((p) =>
    p.findings
      .filter((f) => !f.ok)
      .map((f) => {
        const rubriques =
          f.missing && f.missing.length > 0
            ? ` Rubriques manquantes : ${f.missing.join(' ; ')}.`
            : ''
        return `${p.nodeNumber} ${p.nodeLabel} — « ${p.name} » (${KIND_LABEL[p.kind]}${
          p.docType && p.kind === 'template' ? ` ${p.docType.toUpperCase()}` : ''
        }) : ${f.message}${rubriques} ${recommendation(p, f)}`
      }),
  )
  const details: AuditSection = {
    heading: '4. Constats détaillés par document',
    ...(detailItems.length > 0
      ? { items: detailItems }
      : {
          paragraphs: [
            'Aucun constat : tous les documents examinés sont conformes à la politique d’analyse.',
          ],
        }),
  }

  // 5. Sections et pièces manquantes (constats structurels).
  const missingItems = [
    ...missing.flatMap((f) =>
      (f.missing ?? []).map((m) => `${f.nodeNumber} ${f.nodeLabel} : ${m}`),
    ),
    ...structuralReal
      .filter((f) => !f.missing || f.missing.length === 0)
      .map((f) => `${f.nodeNumber ? `${f.nodeNumber} ` : ''}${f.nodeLabel} : ${f.message}`),
  ]
  const manquants: AuditSection = {
    heading: '5. Structure du dossier — sections et pièces manquantes',
    ...(missingItems.length > 0
      ? { items: missingItems }
      : { paragraphs: ['Aucune exigence structurelle enfreinte sur l’arborescence examinée.'] }),
  }

  // 6. Conclusion — formulations expertes FIXES, conditionnelles aux chiffres.
  const conclusion: AuditSection = {
    heading: '6. Conclusion et recommandations',
    paragraphs:
      nonConform.length === 0 && structuralReal.length === 0
        ? [
            'Au vu des vérifications effectuées, aucun écart de conformité n’a été relevé sur le périmètre examiné. Le dossier peut être compilé en l’état.',
            'Le présent audit assiste la revue réglementaire ; il ne se substitue pas à la validation finale par la personne responsable des affaires réglementaires.',
          ]
        : [
            `Le dossier n'est pas prêt pour soumission en l'état : ${nonConform.length} document(s) présentent un écart et ${structuralReal.length} exigence(s) structurelle(s) restent à satisfaire. Il est recommandé de lever chaque constat de la section 4 (actions indiquées document par document) et de compléter les sections listées en section 5 avant compilation finale.`,
            'Après correction, relancer l’analyse des documents modifiés puis un nouvel audit global pour constater la levée des écarts.',
            'Le présent audit assiste la revue réglementaire ; il ne se substitue pas à la validation finale par la personne responsable des affaires réglementaires.',
          ],
  }

  return {
    title: "RAPPORT D'AUDIT DE CONFORMITÉ RÉGLEMENTAIRE",
    subtitle: `${data.productName || 'Dossier'} — ${data.countryName}${data.agency ? ` (${data.agency})` : ''}`,
    sections: [reference, method, synthese, details, manquants, conclusion],
    footer: `Généré par Regafy — Pharnos · ${data.date}`,
  }
}

/** Pièce d'audit depuis une pièce analysée (docs/attachments du copilote). */
export function auditPieceKind(docType: string, category?: string): 'template' | 'admin' {
  return UPGRADE_DOC_TYPES.has(docType) && category !== 'admin' ? 'template' : 'admin'
}
