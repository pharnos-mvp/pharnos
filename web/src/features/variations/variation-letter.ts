import type { JSONContent } from '@tiptap/core'

import type { Lang } from '@/lib/i18n-context'
import { buildLetterContext } from '@/features/workspace/letter-context'
import { TEMPLATES } from '@/features/workspace/templates'
import { PIECE_LABEL, type VariationClass } from './variation-catalog'
import {
  itemFromVariation,
  lookupVariation,
  requestClass,
  requestPieces,
  type VariationRequest,
} from './variation-request'

/**
 * Construit le document (TipTap) de la **lettre de demande de variation** depuis une demande :
 * réutilise `buildLetterContext` (sujet : produit / pays → agence / signataire), puis injecte la
 * classe globale, les natures de modification et l'union des pièces (libellés localisés). Le rendu
 * PDF/DOCX passe par le moteur de lettres partagé (`letter-pdf` / `letter-docx`). PURE.
 */
export function buildVariationLetterDoc(req: VariationRequest, lang: Lang): JSONContent {
  const base = buildLetterContext(req.fields, lang)
  return TEMPLATES.variation.build(
    {
      ...base,
      variationClass: requestClass(req.items),
      variationItems: req.items.map((it) => it.nature).filter((n) => n.trim()),
      variationPieces: requestPieces(req.items).map((p) => PIECE_LABEL[p][lang]),
    },
    lang,
  )
}

/**
 * Champs « variation » d'un `TemplateContext` à partir des n° de variation cochés sur un dossier
 * (classe globale, natures, union des pièces — libellés localisés). Spread dans `buildContext` du
 * Workspace pour générer la lettre de variation au nœud 1.1.1. PURE.
 */
export function variationLetterContextFields(
  refs: number[],
  lang: Lang,
): { variationClass: VariationClass; variationItems: string[]; variationPieces: string[] } {
  const items = refs
    .map((r) => {
      const v = lookupVariation(r)
      return v ? itemFromVariation(v, v.nature[lang]) : null
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
  return {
    variationClass: requestClass(items),
    variationItems: items.map((it) => it.nature),
    variationPieces: requestPieces(items).map((p) => PIECE_LABEL[p][lang]),
  }
}
