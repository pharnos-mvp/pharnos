import type { Lang } from '@/lib/i18n-context'
import { countryLabel } from '@/features/workspace/dossier-constants'
import type { VariationRequest } from './variation-request'

/**
 * Structure PURE du tableau comparatif des modifications (ancien → nouveau), partagée par les
 * renderers PDF (`variation-table-pdf`) et DOCX (`variation-table-docx`) et par l'aperçu UI.
 * Source unique = les items de la demande. Bilingue (FR par défaut, langue de soumission UEMOA).
 */

export interface ComparisonTable {
  title: string
  /** Bloc d'en-tête (produit / AMM / pays / date). */
  meta: { label: string; value: string }[]
  headers: string[]
  rows: string[][]
  /** Largeur relative de chaque colonne (somme = 1) — varie selon la présence de « Justification ». */
  colFractions: number[]
  /** Note de bas de tableau (redevance par variation). */
  footnote?: string
}

const DASH = '—'

export function buildComparisonTable(req: VariationRequest, lang: Lang = 'fr'): ComparisonTable {
  const L = (fr: string, en: string) => (lang === 'en' ? en : fr)
  const f = req.fields
  const date = new Date().toLocaleDateString(lang === 'en' ? 'en-GB' : 'fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  const meta: { label: string; value: string }[] = [
    { label: L('Produit', 'Product'), value: f.nomCommercial || DASH },
    { label: L('N° d’AMM', 'MA number'), value: f.ammNumero || DASH },
    {
      label: L('Pays', 'Country'),
      value: countryLabel(f.country, lang) || f.country || DASH,
    },
    { label: L('Date', 'Date'), value: date },
  ]

  // Colonne « Justification » affichée seulement si au moins un item la renseigne (recette CEO :
  // « si l'user ne remplit pas la justification, ne l'affiche pas sur le document final »).
  const hasJustif = req.items.some((it) => it.justification.trim() !== '')

  const headers = [
    L('N°', 'No.'),
    L('Nature de la variation', 'Nature of the variation'),
    L('Situation actuelle', 'Current situation'),
    L('Situation proposée', 'Proposed situation'),
    ...(hasJustif ? [L('Justification', 'Justification')] : []),
  ]

  const rows = req.items.map((it) => {
    const cells = [
      it.ref != null ? String(it.ref) : DASH,
      it.rubrique ? `${it.nature}\n(${it.rubrique})` : it.nature || DASH,
      it.before || DASH,
      it.after || DASH,
    ]
    return hasJustif ? [...cells, it.justification || DASH] : cells
  })

  const colFractions = hasJustif ? [0.07, 0.25, 0.24, 0.24, 0.2] : [0.08, 0.3, 0.31, 0.31]

  return {
    title: L('TABLEAU COMPARATIF DES MODIFICATIONS', 'COMPARISON TABLE OF CHANGES'),
    meta,
    headers,
    rows,
    colFractions,
    footnote:
      req.items.length > 1
        ? L(
            `Demande groupée de ${req.items.length} variations — la redevance est exigée pour chaque variation.`,
            `Grouped request of ${req.items.length} variations — the fee is due for each variation.`,
          )
        : undefined,
  }
}
