// Export **combiné** « lettre de variation + tableau comparatif en annexe » → UN seul fichier.
// La lettre (prose, moteur A4 partagé) puis le tableau (table native) sur une page d'annexe.
// Tout est **importé à la demande** (clic Download) : pdf-lib / docx restent hors du chunk de la
// Bibliothèque. Volontairement découplé du moteur de compilation métré du dossier.
import type { JSONContent } from '@tiptap/core'

import type { LetterBrand } from '@/features/workspace/letter-render'
import type { ComparisonTable } from './variation-table'

/**
 * PDF combiné : pages de la lettre (moteur `drawLetterPages`) suivies des pages du tableau
 * (`comparisonPdfBytes`), fusionnées dans un seul document pdf-lib.
 */
export async function combinedVariationPdfBytes(
  letterDoc: JSONContent,
  table: ComparisonTable,
  brand?: LetterBrand,
): Promise<Uint8Array> {
  const [{ PDFDocument }, { letterPdfBytes }, { comparisonPdfBytes }] = await Promise.all([
    import('pdf-lib'),
    import('@/features/workspace/letter-pdf'),
    import('./variation-table-pdf'),
  ])
  const parts = await Promise.all([letterPdfBytes(letterDoc, brand), comparisonPdfBytes(table)])
  const out = await PDFDocument.create()
  for (const bytes of parts) {
    const src = await PDFDocument.load(bytes)
    const pages = await out.copyPages(src, src.getPageIndices())
    pages.forEach((p) => out.addPage(p))
  }
  return out.save()
}

/**
 * DOCX combiné : section 1 = lettre (A4, marges 2,5 cm), section 2 = annexe tableau (nouvelle page,
 * marges 1 pouce). Numérotation des puces déclarée une fois au niveau du Document.
 */
export async function combinedVariationDocxBlob(
  letterDoc: JSONContent,
  table: ComparisonTable,
  brand?: LetterBrand,
): Promise<Blob> {
  const [{ Document, Packer, SectionType }, letterMod, tableMod] = await Promise.all([
    import('docx'),
    import('@/features/workspace/letter-docx'),
    import('./variation-table-docx'),
  ])
  const images = brand ? await letterMod.loadLetterDocxImages(brand) : undefined
  const doc = new Document({
    styles: { default: { document: { run: { font: 'Times New Roman', size: 24 } } } },
    numbering: { config: [letterMod.LETTER_BULLET_NUMBERING] },
    sections: [
      {
        properties: { page: letterMod.LETTER_PAGE },
        children: letterMod.letterDocxChildren(letterDoc, images),
      },
      {
        properties: { type: SectionType.NEXT_PAGE, page: tableMod.TABLE_PAGE },
        children: tableMod.comparisonDocxChildren(table),
      },
    ],
  })
  return Packer.toBlob(doc)
}
