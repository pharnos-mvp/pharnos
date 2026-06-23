// Export DOCX des lettres (cover/PGHT) — **importé à la demande** (clic « DOCX ») pour garder la
// lib `docx` hors du chunk de la Bibliothèque (mirror form-docx). Générique sur les nœuds des
// lettres (cf. letter-render) → source unique du contenu = templates.ts. Times New Roman 12pt, A4.
// **Tranche 2 (branding)** : en-tête/pied/signature du profil insérés en images (ImageRun) — la
// signature remplace le marqueur « [Signature et cachet] » du bloc signature.
import { AlignmentType, Document, ImageRun, LevelFormat, Packer, Paragraph, TextRun } from 'docx'
import type { JSONContent } from '@tiptap/core'

import { isBoldNode, SIGNATURE_MARKERS, type LetterBrand } from './letter-render'

const FONT = 'Times New Roman'
const SZ = 24 // 12pt en demi-points

type DocxImageType = 'png' | 'jpg' | 'gif' | 'bmp'
interface DocxImage {
  data: Uint8Array
  type: DocxImageType
  width: number
  height: number
}
export interface LetterDocxImages {
  header?: DocxImage
  footer?: DocxImage
  signature?: DocxImage
}

/** Page A4 des lettres (marges 2,5 cm) — réutilisée par l'export combiné lettre+annexe. */
export const LETTER_PAGE = {
  size: { width: 11906, height: 16838 }, // A4 (210 × 297 mm) en twips
  margin: { top: 1417, right: 1417, bottom: 1417, left: 1417 }, // 2,5 cm — comme le dossier compilé
}

/** Config de puces des lettres (réf. `lbul`) — à déclarer une fois au niveau du Document. */
export const LETTER_BULLET_NUMBERING = {
  reference: 'lbul',
  levels: [
    {
      level: 0,
      format: LevelFormat.BULLET,
      text: '•',
      alignment: AlignmentType.LEFT,
      style: { paragraph: { indent: { left: 720, hanging: 360 } } },
    },
  ],
}

function inlineRuns(nodes: JSONContent[] | undefined): TextRun[] {
  return (nodes ?? []).flatMap((n) => {
    if (n.type === 'hardBreak') return [new TextRun({ break: 1, font: FONT, size: SZ })]
    if (n.type === 'text')
      return [new TextRun({ text: n.text ?? '', bold: isBoldNode(n), font: FONT, size: SZ })]
    return []
  })
}

const plainText = (nodes: JSONContent[] | undefined): string =>
  (nodes ?? []).map((n) => (n.type === 'text' ? (n.text ?? '') : '')).join('')

/** Décalage gauche ~56 % du contenu (A4 ≈ 9026 twips) pour les blocs « à droite » (date/signature). */
const RIGHT_INDENT = 5050

const imageParagraph = (img: DocxImage, opts: { indentLeft?: number } = {}) =>
  new Paragraph({
    alignment: AlignmentType.LEFT,
    indent: opts.indentLeft ? { left: opts.indentLeft } : undefined,
    spacing: { after: 120 },
    children: [
      new ImageRun({
        data: img.data,
        type: img.type,
        transformation: { width: img.width, height: img.height },
      }),
    ],
  })

/** Paragraphes d'une lettre (corps + bandes en-tête/pied/signature) — partagé avec l'export combiné. */
export function letterDocxChildren(doc: JSONContent, images?: LetterDocxImages): Paragraph[] {
  const children: Paragraph[] = []
  if (images?.header) children.push(imageParagraph(images.header))
  for (const n of doc.content ?? []) {
    if (n.type === 'paragraph') {
      const isRight = n.attrs?.textAlign === 'right'
      if (images?.signature && SIGNATURE_MARKERS.includes(plainText(n.content).trim())) {
        children.push(imageParagraph(images.signature, { indentLeft: RIGHT_INDENT }))
        continue
      }
      // « à droite » = bloc aligné à gauche décalé à 56 % (forme UEMOA, identique au CTD Builder).
      children.push(
        new Paragraph({
          alignment: AlignmentType.LEFT,
          indent: isRight ? { left: RIGHT_INDENT } : undefined,
          spacing: { after: 120 },
          children: inlineRuns(n.content),
        }),
      )
    } else if (n.type === 'bulletList') {
      for (const li of n.content ?? []) {
        const p = (li.content ?? [])[0]
        children.push(
          new Paragraph({
            numbering: { reference: 'lbul', level: 0 },
            spacing: { after: 60 },
            children: inlineRuns(p?.content),
          }),
        )
      }
    }
  }
  if (images?.footer) children.push(imageParagraph(images.footer))
  return children
}

export function letterDocToDocx(doc: JSONContent, images?: LetterDocxImages): Document {
  return new Document({
    styles: { default: { document: { run: { font: FONT, size: SZ } } } },
    numbering: { config: [LETTER_BULLET_NUMBERING] },
    sections: [{ properties: { page: LETTER_PAGE }, children: letterDocxChildren(doc, images) }],
  })
}

/** Décode une data-URL image → octets + type (atob — navigateur). `null` si non-image. */
function decodeDataUrl(dataUrl: string): { data: Uint8Array; type: DocxImageType } | null {
  const m = /^data:image\/(png|jpe?g|gif|bmp);base64,(.+)$/i.exec(dataUrl)
  if (!m) return null
  const ext = m[1]!.toLowerCase()
  const type: DocxImageType = ext.startsWith('jp') ? 'jpg' : (ext as DocxImageType)
  const bin = atob(m[2]!)
  const data = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) data[i] = bin.charCodeAt(i)
  return { data, type }
}

/** Dimensions naturelles d'une image (data-URL) — pour conserver le ratio dans le DOCX. */
function imageDims(src: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight })
    img.onerror = () => resolve({ w: 0, h: 0 })
    img.src = src
  })
}

async function loadDocxImage(
  dataUrl: string | null | undefined,
  maxWidth: number,
): Promise<DocxImage | undefined> {
  if (!dataUrl) return undefined
  const decoded = decodeDataUrl(dataUrl)
  if (!decoded) return undefined
  const { w, h } = await imageDims(dataUrl)
  if (!w || !h) return undefined
  const scale = Math.min(1, maxWidth / w)
  return { ...decoded, width: Math.round(w * scale), height: Math.round(h * scale) }
}

/** Charge les bandes de marque (en-tête/pied/signature) en images DOCX — partagé avec l'export combiné. */
export async function loadLetterDocxImages(brand: LetterBrand): Promise<LetterDocxImages> {
  return {
    header: await loadDocxImage(brand.headerImage, 600),
    footer: await loadDocxImage(brand.footerImage, 600),
    signature: await loadDocxImage(brand.signatureImage, 160),
  }
}

export async function letterDocxBlob(doc: JSONContent, brand?: LetterBrand): Promise<Blob> {
  const images = brand ? await loadLetterDocxImages(brand) : undefined
  return Packer.toBlob(letterDocToDocx(doc, images))
}
