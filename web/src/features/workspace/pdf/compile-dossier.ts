import type { JSONContent } from '@tiptap/core'
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from 'pdf-lib'

import type { GeneratedDocRecord } from '@/lib/db'
import type { CtdNodeDef } from '../module1-tree'

/**
 * Compilation du Module 1 en un PDF unique (M6).
 *
 * Ordre : (TDM) → pour chaque section : page de garde → pour chaque pièce : page d'annonce →
 * document(s) (lettre générée rendue en vecteur + pièces jointes/produit fusionnées).
 * Bandeau **en-tête/pied taille 10** tamponné sur **toutes** les pages (y compris les PDF importés),
 * pagination continue. Police Times New Roman (standard PDF, pas d'embarquement de police).
 */

// A4 en points (1 pt = 1/72").
const A4: [number, number] = [595.28, 841.89]
const MARGIN = 70.87 // 2,5 cm
const CONTENT_TOP = A4[1] - MARGIN
const CONTENT_BOTTOM = MARGIN
const CONTENT_WIDTH = A4[0] - 2 * MARGIN
const BODY_SIZE = 12
const LINE = 1.45
const GRAY = rgb(0.45, 0.45, 0.45)
const BLACK = rgb(0, 0, 0)

export interface CompilePiece {
  bytes: Uint8Array
  mime: string
  fileName: string
  /** Pièce non résolue (blob absent + Storage injoignable) → page « non incluse » visible. */
  missing?: boolean
}

export interface CompileNodeContent {
  generated?: GeneratedDocRecord
  pieces: CompilePiece[]
}

export interface CompileInput {
  tree: CtdNodeDef[]
  moduleLabel: string
  country: string
  titulaire: string
  commercialLine: string
  logo?: { bytes: Uint8Array; isPng: boolean } | null
  autoStructural: boolean
  contentByNumber: Map<string, CompileNodeContent>
}

interface Fonts {
  regular: PDFFont
  bold: PDFFont
}

interface Cursor {
  doc: PDFDocument
  page: PDFPage
  y: number
  fonts: Fonts
}

interface Run {
  text: string
  bold: boolean
}

/* ----------------------------- Utilitaires ----------------------------- */

export function dataUrlToBytes(dataUrl: string): { bytes: Uint8Array; isPng: boolean } | null {
  const m = /^data:(image\/[\w+.-]+);base64,(.*)$/s.exec(dataUrl)
  if (!m) return null
  let bin: string
  try {
    bin = atob(m[2] ?? '')
  } catch {
    return null
  }
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return { bytes, isPng: (m[1] ?? '').toLowerCase() === 'image/png' }
}

/** WinAnsi (police standard) ne couvre pas tout : on remplace les caractères problématiques. */
function sanitize(text: string): string {
  return text
    .replace(/[‘’‚]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/…/g, '...')
    .replace(new RegExp(`[${String.fromCharCode(0xa0, 0x202f)}]`, 'g'), ' ')
    .replace(/•/g, '-')
}

function lineHeight(size: number): number {
  return size * LINE
}

function newPage(c: Cursor): void {
  c.page = c.doc.addPage(A4)
  c.y = CONTENT_TOP
}

function wrap(runs: Run[], fonts: Fonts, size: number, maxWidth: number): Run[][] {
  const lines: Run[][] = []
  let line: Run[] = []
  let width = 0
  for (const run of runs) {
    const font = run.bold ? fonts.bold : fonts.regular
    const words = run.text.split(/(\s+)/).filter((w) => w.length > 0)
    for (const word of words) {
      const w = font.widthOfTextAtSize(sanitize(word), size)
      if (width + w > maxWidth && line.length > 0 && word.trim().length > 0) {
        lines.push(line)
        line = []
        width = 0
      }
      if (line.length === 0 && /^\s+$/.test(word)) continue
      line.push({ text: word, bold: run.bold })
      width += w
    }
  }
  if (line.length > 0) lines.push(line)
  return lines.length > 0 ? lines : [[]]
}

function drawRuns(c: Cursor, runs: Run[], size: number, indent: number, prefix?: string): void {
  const lh = lineHeight(size)
  const lines = wrap(runs, c.fonts, size, CONTENT_WIDTH - indent)
  lines.forEach((line, i) => {
    if (c.y - lh < CONTENT_BOTTOM) newPage(c)
    let x = MARGIN + indent
    if (i === 0 && prefix) {
      c.page.drawText(sanitize(prefix), {
        x: MARGIN + indent - 14,
        y: c.y,
        size,
        font: c.fonts.regular,
        color: BLACK,
      })
    }
    for (const run of line) {
      const font = run.bold ? c.fonts.bold : c.fonts.regular
      const t = sanitize(run.text)
      c.page.drawText(t, { x, y: c.y, size, font, color: BLACK })
      x += font.widthOfTextAtSize(t, size)
    }
    c.y -= lh
  })
}

async function drawImage(c: Cursor, dataUrl: string, maxW = 180): Promise<void> {
  const parsed = dataUrlToBytes(dataUrl)
  if (!parsed) return
  let img: PDFImage
  try {
    img = parsed.isPng ? await c.doc.embedPng(parsed.bytes) : await c.doc.embedJpg(parsed.bytes)
  } catch {
    return
  }
  const w = Math.min(maxW, img.width)
  const h = (img.height / img.width) * w
  if (c.y - h < CONTENT_BOTTOM) newPage(c)
  c.page.drawImage(img, { x: MARGIN, y: c.y - h, width: w, height: h })
  c.y -= h + 6
}

/* ----------------------------- Rendu TipTap → PDF ----------------------------- */

function inlineRuns(nodes: JSONContent[] | undefined): Run[] {
  const out: Run[] = []
  for (const n of nodes ?? []) {
    if (n.type === 'text') {
      const bold = (n.marks ?? []).some((m) => m.type === 'bold' || m.type === 'strong')
      out.push({ text: n.text ?? '', bold })
    }
  }
  return out
}

function inlineImages(nodes: JSONContent[] | undefined): string[] {
  return (nodes ?? [])
    .filter((n) => n.type === 'image' && typeof n.attrs?.src === 'string')
    .map((n) => n.attrs!.src as string)
}

async function renderTiptap(c: Cursor, content: JSONContent): Promise<void> {
  for (const block of content.content ?? []) {
    switch (block.type) {
      case 'heading': {
        c.y -= 4
        drawRuns(c, inlineRuns(block.content), 14, 0)
        for (const src of inlineImages(block.content)) await drawImage(c, src)
        c.y -= 4
        break
      }
      case 'paragraph': {
        const runs = inlineRuns(block.content)
        if (runs.some((r) => r.text.trim().length > 0)) drawRuns(c, runs, BODY_SIZE, 0)
        else if (c.y - lineHeight(BODY_SIZE) < CONTENT_BOTTOM) newPage(c)
        else c.y -= lineHeight(BODY_SIZE)
        for (const src of inlineImages(block.content)) await drawImage(c, src)
        c.y -= 4
        break
      }
      case 'bulletList':
      case 'orderedList': {
        // MVP : un paragraphe par item ; sous-listes et attribut "start" non gérés.
        let i = 1
        for (const item of block.content ?? []) {
          const para = (item.content ?? []).find((x) => x.type === 'paragraph')
          drawRuns(
            c,
            inlineRuns(para?.content),
            BODY_SIZE,
            18,
            block.type === 'orderedList' ? `${i}.` : '-',
          )
          for (const src of inlineImages(para?.content)) await drawImage(c, src)
          i++
        }
        c.y -= 4
        break
      }
      case 'image': {
        if (typeof block.attrs?.src === 'string') await drawImage(c, block.attrs.src as string)
        break
      }
      default:
        break
    }
  }
}

/* ----------------------------- Pages structurelles ----------------------------- */

function drawCentered(
  page: PDFPage,
  lines: { text: string; size: number; bold: boolean }[],
  fonts: Fonts,
): void {
  const totalH = lines.reduce((s, l) => s + lineHeight(l.size), 0)
  let y = A4[1] / 2 + totalH / 2
  for (const l of lines) {
    const font = l.bold ? fonts.bold : fonts.regular
    const t = ellipsize(l.text, font, l.size, CONTENT_WIDTH)
    const w = font.widthOfTextAtSize(t, l.size)
    page.drawText(t, { x: (A4[0] - w) / 2, y, size: l.size, font, color: BLACK })
    y -= lineHeight(l.size)
  }
}

/* ----------------------------- Pièces (PDF / image) ----------------------------- */

async function appendPiece(final: PDFDocument, piece: CompilePiece, fonts: Fonts): Promise<void> {
  if (piece.missing) {
    drawCentered(
      final.addPage(A4),
      [
        { text: 'PIÈCE NON INCLUSE', size: 14, bold: true },
        { text: piece.fileName, size: 12, bold: false },
        {
          text: 'Indisponible hors-ligne - reconnectez-vous puis recompilez.',
          size: 10,
          bold: false,
        },
      ],
      fonts,
    )
    return
  }
  const isPdf = piece.mime === 'application/pdf' || piece.fileName.toLowerCase().endsWith('.pdf')
  if (isPdf) {
    try {
      const src = await PDFDocument.load(piece.bytes, { ignoreEncryption: true })
      const pages = await final.copyPages(src, src.getPageIndices())
      pages.forEach((p) => final.addPage(p))
      return
    } catch {
      /* page d'information ci-dessous */
    }
  } else if (piece.mime.startsWith('image/')) {
    try {
      const img =
        piece.mime === 'image/png'
          ? await final.embedPng(piece.bytes)
          : await final.embedJpg(piece.bytes)
      const page = final.addPage(A4)
      const scale = Math.min(
        CONTENT_WIDTH / img.width,
        (CONTENT_TOP - CONTENT_BOTTOM) / img.height,
        1,
      )
      const w = img.width * scale
      const h = img.height * scale
      page.drawImage(img, { x: (A4[0] - w) / 2, y: (A4[1] - h) / 2, width: w, height: h })
      return
    } catch {
      /* page d'information ci-dessous */
    }
  }
  drawCentered(
    final.addPage(A4),
    [
      { text: 'Pièce jointe', size: 14, bold: true },
      { text: piece.fileName, size: 12, bold: false },
      { text: '(aperçu non disponible - voir le fichier d origine)', size: 10, bold: false },
    ],
    fonts,
  )
}

/* ----------------------------- En-tête / pied tamponnés ----------------------------- */

function ellipsize(text: string, font: PDFFont, size: number, maxW: number): string {
  let t = sanitize(text)
  if (font.widthOfTextAtSize(t, size) <= maxW) return t
  while (t.length > 1 && font.widthOfTextAtSize(t + '...', size) > maxW) t = t.slice(0, -1)
  return t + '...'
}

function stampAll(
  final: PDFDocument,
  input: CompileInput,
  fonts: Fonts,
  logo: PDFImage | null,
): void {
  const pages = final.getPages()
  const total = pages.length
  const half = CONTENT_WIDTH / 2 - 10
  pages.forEach((page, idx) => {
    const { width, height } = page.getSize()
    const hy = height - 48

    let hx = MARGIN
    if (logo) {
      const lh = 16
      const lw = (logo.width / logo.height) * lh
      page.drawImage(logo, { x: MARGIN, y: hy - 4, width: lw, height: lh })
      hx = MARGIN + lw + 6
    }
    page.drawText(ellipsize(input.titulaire, fonts.regular, 10, half - (hx - MARGIN)), {
      x: hx,
      y: hy,
      size: 10,
      font: fonts.regular,
      color: BLACK,
    })
    const right = ellipsize(input.commercialLine, fonts.regular, 10, half)
    page.drawText(right, {
      x: width - MARGIN - fonts.regular.widthOfTextAtSize(right, 10),
      y: hy,
      size: 10,
      font: fonts.regular,
      color: BLACK,
    })
    page.drawLine({
      start: { x: MARGIN, y: hy - 6 },
      end: { x: width - MARGIN, y: hy - 6 },
      thickness: 0.5,
      color: GRAY,
    })

    const fy = 36
    page.drawLine({
      start: { x: MARGIN, y: fy + 12 },
      end: { x: width - MARGIN, y: fy + 12 },
      thickness: 0.5,
      color: GRAY,
    })
    page.drawText(sanitize(input.moduleLabel), {
      x: MARGIN,
      y: fy,
      size: 10,
      font: fonts.regular,
      color: GRAY,
    })
    const country = ellipsize(input.country, fonts.regular, 10, half)
    page.drawText(country, {
      x: (width - fonts.regular.widthOfTextAtSize(country, 10)) / 2,
      y: fy,
      size: 10,
      font: fonts.regular,
      color: GRAY,
    })
    const pageStr = `Page ${idx + 1} / ${total}`
    page.drawText(pageStr, {
      x: width - MARGIN - fonts.regular.widthOfTextAtSize(pageStr, 10),
      y: fy,
      size: 10,
      font: fonts.regular,
      color: GRAY,
    })
  })
}

/* ----------------------------- Orchestrateur ----------------------------- */

interface TdmEntry {
  number: string
  label: string
  depth: number
  startIndex: number
}

function hasContent(node: CtdNodeDef, input: CompileInput): boolean {
  const c = input.contentByNumber.get(node.number)
  if (c && (c.generated || c.pieces.length > 0)) return true
  return (node.children ?? []).some((ch) => hasContent(ch, input))
}

export async function compileDossier(input: CompileInput): Promise<Uint8Array> {
  // 1) Contenu (hors TDM) dans un doc temporaire, en mémorisant l'index de page de départ de chaque nœud.
  const contentDoc = await PDFDocument.create()
  const fonts: Fonts = {
    regular: await contentDoc.embedFont(StandardFonts.TimesRoman),
    bold: await contentDoc.embedFont(StandardFonts.TimesRomanBold),
  }
  const entries: TdmEntry[] = []

  async function walk(nodes: CtdNodeDef[], depth: number): Promise<void> {
    for (const node of nodes) {
      if (!hasContent(node, input)) continue
      const startIndex = contentDoc.getPageCount()
      const isSection = (node.children ?? []).length > 0
      if (isSection) {
        if (input.autoStructural) {
          drawCentered(
            contentDoc.addPage(A4),
            [
              { text: node.number, size: 30, bold: true },
              { text: node.label, size: 18, bold: false },
            ],
            fonts,
          )
        }
        entries.push({ number: node.number, label: node.label, depth, startIndex })
        await walk(node.children ?? [], depth + 1)
      } else {
        const content = input.contentByNumber.get(node.number)
        if (!content || (!content.generated && content.pieces.length === 0)) continue
        if (input.autoStructural) {
          drawCentered(
            contentDoc.addPage(A4),
            [
              { text: node.number, size: 22, bold: true },
              { text: node.label, size: 15, bold: false },
            ],
            fonts,
          )
        }
        if (content.generated) {
          const cursor: Cursor = {
            doc: contentDoc,
            page: contentDoc.addPage(A4),
            y: CONTENT_TOP,
            fonts,
          }
          await renderTiptap(cursor, content.generated.content as JSONContent)
        }
        for (const piece of content.pieces) await appendPiece(contentDoc, piece, fonts)
        entries.push({ number: node.number, label: node.label, depth, startIndex })
      }
    }
  }

  await walk(input.tree, 0)

  // 2) Assemblage final = pages TDM (réservées) + contenu copié.
  const tdmRows = input.autoStructural ? entries.length : 0
  const TDM_PER_PAGE = 30
  const tdmPageCount = tdmRows > 0 ? Math.ceil((tdmRows + 2) / TDM_PER_PAGE) : 0

  const final = await PDFDocument.create()
  const fFonts: Fonts = {
    regular: await final.embedFont(StandardFonts.TimesRoman),
    bold: await final.embedFont(StandardFonts.TimesRomanBold),
  }

  const tdmPages: PDFPage[] = []
  for (let i = 0; i < tdmPageCount; i++) tdmPages.push(final.addPage(A4))

  const copied = await final.copyPages(contentDoc, contentDoc.getPageIndices())
  copied.forEach((p) => final.addPage(p))

  if (final.getPageCount() === 0) {
    drawCentered(final.addPage(A4), [{ text: 'Dossier vide', size: 16, bold: true }], fFonts)
  }

  // 3) Remplissage du TDM avec numéros de page absolus.
  if (tdmPages.length > 0) {
    let pi = 0
    let y = CONTENT_TOP
    tdmPages[0]!.drawText(sanitize('TABLE DES MATIÈRES'), {
      x: MARGIN,
      y,
      size: 16,
      font: fFonts.bold,
      color: BLACK,
    })
    y -= lineHeight(16) + 10
    for (const e of entries) {
      if (y - lineHeight(11) < CONTENT_BOTTOM && pi < tdmPages.length - 1) {
        pi++
        y = CONTENT_TOP
      }
      const page = tdmPages[pi]!
      const absolute = tdmPageCount + e.startIndex + 1
      const label = ellipsize(`${e.number}  ${e.label}`, fFonts.regular, 11, CONTENT_WIDTH - 40)
      page.drawText(label, {
        x: MARGIN + e.depth * 14,
        y,
        size: 11,
        font: fFonts.regular,
        color: BLACK,
      })
      const pageStr = String(absolute)
      page.drawText(pageStr, {
        x: A4[0] - MARGIN - fFonts.regular.widthOfTextAtSize(pageStr, 11),
        y,
        size: 11,
        font: fFonts.regular,
        color: BLACK,
      })
      y -= lineHeight(11)
    }
  }

  // 4) En-tête/pied + pagination sur toutes les pages.
  let logoImg: PDFImage | null = null
  if (input.logo) {
    try {
      logoImg = input.logo.isPng
        ? await final.embedPng(input.logo.bytes)
        : await final.embedJpg(input.logo.bytes)
    } catch {
      logoImg = null
    }
  }
  stampAll(final, input, fFonts, logoImg)

  return final.save()
}
