// « Remplir le template » (C2, Regafy conformité d'abord) — squelette du template officiel,
// généré LOCALEMENT (zéro IA, offline) depuis les specs partagées avec l'Edge (@specs).
// Structure FIGÉE : chaque titre de rubrique est un heading `locked` (extension LockedHeading —
// non supprimable, non modifiable, non réordonnable) ; l'utilisateur complète les zones
// [À COMPLÉTER] entre les titres. Pré-remplissage STRICTEMENT limité à la session
// Identification de la fiche produit — tout le reste est à l'utilisateur (exigence CEO).
import type { JSONContent } from '@tiptap/core'

import { specForDocType, type RubricSpec } from '@specs'
import type { ProductRecord } from '@/lib/db'
import { formatComposition } from './composition'
import { buildRcpFillContent, initialRcpFormState } from './template-form/rcp-form-content'

export const FILL_PLACEHOLDER = '[À COMPLÉTER]'

/** Préfixe « 1. », « 4.8. », « A1. » pour les ids officiels numérotés ; rien pour les ids techniques. */
const officialLabel = (r: RubricSpec): string =>
  /^A?\d+(\.\d+)*$/.test(r.id) ? `${r.id}. ${r.title}` : r.title

/**
 * Pré-remplissage : UNIQUEMENT les informations de la session Identification de la fiche
 * produit (nom commercial, DCI, dosage, forme, présentation). Ni dates, ni titulaire/fabricant,
 * ni mentions — c'est l'utilisateur qui complète son template.
 */
function prefillFor(docType: string, rubricId: string, product?: ProductRecord): string | null {
  if (!product) return null
  const denomination = [product.nomCommercial, product.dosage, product.forme]
    .filter(Boolean)
    .join(', ')
  if (docType === 'rcp') {
    if (rubricId === '1') return denomination
    if (rubricId === '2') return formatComposition(product.dci, product.dosage) || null
    if (rubricId === '3') return product.forme || null
  }
  if (docType === 'notice') {
    if (rubricId === 'entete') {
      return `NOTICE : INFORMATION DE L'UTILISATEUR\n${denomination} (${product.dci})`
    }
  }
  if (docType === 'labeling') {
    if (rubricId === 'A1') return `${denomination} (${product.dci})`
    if (rubricId === 'A2') return formatComposition(product.dci, product.dosage) || null
    if (rubricId === 'A4')
      return [product.forme, product.presentation].filter(Boolean).join(' — ') || null
  }
  return null
}

const heading = (text: string, level: number): JSONContent => ({
  type: 'heading',
  attrs: { level: Math.min(level, 4), locked: true },
  content: [{ type: 'text', text }],
})

const para = (text: string): JSONContent => ({
  type: 'paragraph',
  content: [{ type: 'text', text }],
})

/**
 * Construit le squelette TipTap du template officiel pour un type de document.
 * `null` si le type n'est pas couvert par un template.
 */
export function buildTemplateSkeleton(
  docType: string,
  product?: ProductRecord,
): JSONContent | null {
  // RCP : FORMULAIRE interactif officiel (branding CEO) — le contenu créé est le document
  // final du formulaire (titres + mentions statiques + Identification pré-remplie), édité via
  // TemplateFillForm (plus de squelette TipTap [À COMPLÉTER] pour ce type).
  if (docType === 'rcp') return buildRcpFillContent(initialRcpFormState(product))

  const spec = specForDocType(docType)
  if (!spec) return null

  const titulaire = (product?.titulaire ?? '').trim()
  const fabricant = (product?.fabricant ?? '').trim()
  const splitTitulaire =
    docType === 'rcp' &&
    titulaire &&
    fabricant &&
    titulaire.toLowerCase() !== fabricant.toLowerCase()

  const content: JSONContent[] = [heading(spec.label, 1)]

  const walk = (rubrics: RubricSpec[], depth: number) => {
    for (const r of rubrics) {
      content.push(heading(officialLabel(r), 2 + depth))
      // RCP rubrique 7 avec titulaire ≠ fabricant : structure 7.1/7.2 (titres verrouillés,
      // valeurs à compléter PAR L'UTILISATEUR — les noms/adresses ne sont pas dans la session
      // Identification).
      if (splitTitulaire && r.id === '7') {
        content.push(heading("7.1. Titulaire de l'autorisation de mise sur le marché", 3 + depth))
        content.push(para(FILL_PLACEHOLDER))
        content.push(heading('7.2. Fabricant', 3 + depth))
        content.push(para(FILL_PLACEHOLDER))
        continue
      }
      if (r.children?.length) {
        walk(r.children, depth + 1)
      } else {
        content.push(para(prefillFor(docType, r.id, product) ?? FILL_PLACEHOLDER))
      }
    }
  }
  walk(spec.rubrics, 0)
  return { type: 'doc', content }
}
