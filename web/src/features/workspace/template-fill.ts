// « Remplir le template » — contenu initial d'un document généré `fill` :
// - RCP / Notice / Étiquetage : document du FORMULAIRE officiel (gabarits CEO + template
//   ABMed), pré-rempli session Identification — voir template-form/.
// - Types sans gabarit (cover, PGHT) : squelette TipTap généré depuis les specs partagées
//   avec l'Edge (@specs) — titres `locked` (extension LockedHeading), zones [À COMPLÉTER].
import type { JSONContent } from '@tiptap/core'

import { specForDocType, type RubricSpec } from '@specs'
import type { ProductRecord } from '@/lib/db'
import { buildFillContent } from './template-form/form-content'
import { formDefinitionFor } from './template-form/form-definitions'
import { initialFormState } from './template-form/form-types'

export const FILL_PLACEHOLDER = '[À COMPLÉTER]'

/** Préfixe « 1. », « 4.8. », « A1. » pour les ids officiels numérotés ; rien pour les ids techniques. */
const officialLabel = (r: RubricSpec): string =>
  /^A?\d+(\.\d+)*$/.test(r.id) ? `${r.id}. ${r.title}` : r.title

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
 * Construit le contenu initial du template officiel pour un type de document.
 * `null` si le type n'est pas couvert par un template.
 */
export function buildTemplateSkeleton(
  docType: string,
  product?: ProductRecord,
  /** Valeurs additionnelles pré-remplies (clé de bloc → valeur) — ex. RCP §8 `num_amm` au renouvellement. */
  seed?: Record<string, string>,
): JSONContent | null {
  // Types à FORMULAIRE officiel (RCP, Notice, Étiquetage) : le contenu créé est le document
  // final du formulaire (titres + mentions + Identification pré-remplie), édité via
  // TemplateFillForm — plus de squelette [À COMPLÉTER] pour ces types.
  const def = formDefinitionFor(docType)
  if (def) {
    const state = initialFormState(def, product)
    if (seed) Object.assign(state.values, seed)
    return buildFillContent(def, state)
  }

  const spec = specForDocType(docType)
  if (!spec) return null

  const content: JSONContent[] = [heading(spec.label, 1)]
  const walk = (rubrics: RubricSpec[], depth: number) => {
    for (const r of rubrics) {
      content.push(heading(officialLabel(r), 2 + depth))
      if (r.children?.length) {
        walk(r.children, depth + 1)
      } else {
        content.push(para(FILL_PLACEHOLDER))
      }
    }
  }
  walk(spec.rubrics, 0)
  return { type: 'doc', content }
}
