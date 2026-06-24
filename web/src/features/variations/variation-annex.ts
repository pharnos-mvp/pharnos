import type { JSONContent } from '@tiptap/core'

import type { Lang } from '@/lib/i18n-context'
import { buildComparisonTable } from './variation-table'
import type { VariationRequest } from './variation-request'

/** templateKey du document généré « annexe — tableau comparatif » (rendu/compilé comme une lettre). */
export const VARIATION_ANNEX_KEY = 'variation-annex'

/** Paragraphe TipTap ; cellule vide → paragraphe sans contenu (un nœud `text` vide est invalide). */
function para(text: string): JSONContent {
  return { type: 'paragraph', content: text ? [{ type: 'text', text }] : undefined }
}

/**
 * Construit le **contenu TipTap** de l'annexe de variation (titre + bloc méta + nœud `table`) à partir
 * de la demande — **même source** que l'export PDF/DOCX (`buildComparisonTable`). En faisant de l'annexe
 * un document généré, elle devient **éditable nativement** (RichTextEditor, toutes les actions de la
 * lettre) ET **compilée** dans le PDF du dossier (via `drawTable`). Affiché = exporté = compilé.
 */
export function buildVariationTableContent(request: VariationRequest, lang: Lang): JSONContent {
  const tbl = buildComparisonTable(request, lang)
  const title = lang === 'en' ? 'ANNEX — VARIATION TABLE' : 'ANNEXE — TABLEAU DE VARIATION'
  const headerRow: JSONContent = {
    type: 'tableRow',
    content: tbl.headers.map((h) => ({ type: 'tableHeader', content: [para(h)] })),
  }
  const bodyRows: JSONContent[] = tbl.rows.map((r) => ({
    type: 'tableRow',
    content: r.map((c) => ({ type: 'tableCell', content: [para(c)] })),
  }))
  return {
    type: 'doc',
    content: [
      {
        type: 'heading',
        attrs: { level: 1, textAlign: 'center' },
        content: [{ type: 'text', text: title }],
      },
      ...tbl.meta.map((m) => para(`${m.label} : ${m.value}`)),
      { type: 'table', content: [headerRow, ...bodyRows] },
    ],
  }
}

/** Titre du document annexe (onglet / en-tête de document). */
export function variationAnnexTitle(lang: Lang): string {
  return lang === 'en' ? 'Annex — Variation table' : 'Annexe — Tableau de variation'
}
