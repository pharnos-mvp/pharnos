// Export PDF des lettres (cover/PGHT) de la Bibliothèque — **importé à la demande** (clic « PDF »)
// pour garder pdf-lib hors du chunk de la Bibliothèque (mirror letter-docx). Réutilise EXACTEMENT le
// moteur de la compilation du dossier (`drawLetterPages`) → un vrai A4 (595,28 × 841,89 pt, marges
// 2,5 cm, Times New Roman, blocs « à droite » décalés à 56 %, en-tête/pied pleine largeur, signature
// ≤ 6,35 cm). Remplace l'ancienne impression navigateur (`window.print`), tributaire du dialogue
// d'impression (format Lettre/A4, marges, échelle) → la lettre téléchargée est désormais A4 garanti.
import { PDFDocument, StandardFonts, type PDFImage } from 'pdf-lib'
import type { JSONContent } from '@tiptap/core'

import { dataUrlToBytes, drawLetterPages, type Fonts } from './pdf/compile-dossier'
import { SIGNATURE_MARKERS, type LetterBrand } from './letter-render'

async function embedBand(pdf: PDFDocument, dataUrl?: string | null): Promise<PDFImage | null> {
  if (!dataUrl) return null
  const parsed = dataUrlToBytes(dataUrl)
  if (!parsed) return null
  try {
    return parsed.isPng ? await pdf.embedPng(parsed.bytes) : await pdf.embedJpg(parsed.bytes)
  } catch {
    return null
  }
}

/** Texte brut d'un paragraphe (concat des nœuds texte) — détection du marqueur de signature. */
const paraText = (n: JSONContent): string =>
  (n.content ?? [])
    .map((c) => (c.type === 'text' ? (c.text ?? '') : ''))
    .join('')
    .trim()

/**
 * Remplace le paragraphe-marqueur « [Signature et cachet] » par un nœud image (signature) aligné à
 * droite → `renderTiptap` le dessine décalé à 56 % et borné à 6,35 cm, comme dans le dossier (où la
 * signature est un nœud image inséré dans l'éditeur). Sans image : le marqueur texte est conservé.
 */
export function applySignature(doc: JSONContent, signatureImage?: string | null): JSONContent {
  if (!signatureImage) return doc
  return {
    ...doc,
    content: (doc.content ?? []).map((n) =>
      n.type === 'paragraph' && SIGNATURE_MARKERS.includes(paraText(n))
        ? {
            type: 'paragraph',
            attrs: { textAlign: 'right' },
            content: [{ type: 'image', attrs: { src: signatureImage } }],
          }
        : n,
    ),
  }
}

/** Octets d'un PDF **A4** autonome pour une lettre (cover/PGHT) — moteur partagé avec le dossier. */
export async function letterPdfBytes(doc: JSONContent, brand?: LetterBrand): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  const fonts: Fonts = {
    regular: await pdf.embedFont(StandardFonts.TimesRoman),
    bold: await pdf.embedFont(StandardFonts.TimesRomanBold),
  }
  const header = await embedBand(pdf, brand?.headerImage)
  const footer = await embedBand(pdf, brand?.footerImage)
  await drawLetterPages(pdf, fonts, applySignature(doc, brand?.signatureImage), { header, footer })
  return pdf.save()
}
