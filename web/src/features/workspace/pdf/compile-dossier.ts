import type { JSONContent } from '@tiptap/core'
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from 'pdf-lib'

import type { GeneratedDocRecord } from '@/lib/db'
import { CTD_MODULE_TITLES, CTD_OUTLINE_2_5 } from '../ctd-full-outline'
import type { CtdNodeDef } from '../module1-tree'

/**
 * Compilation du Module 1 en un PDF unique (M6).
 *
 * Ordre : (TDM tous modules) → pour chaque section : page de garde → pour chaque pièce : page
 * d'annonce → document(s) (lettre générée rendue en vecteur + pièces jointes/produit fusionnées).
 * Bandeau **en-tête/pied taille 10** tamponné **uniquement sur les pages de garde** (TDM, gardes de
 * section, pages d'annonce) — **jamais** sur les documents administratifs / générés / traduits, qui
 * restent vierges. Police Times New Roman (standard PDF, pas d'embarquement de police).
 *
 * Le **TDM** est la table des matières **générale du CTD** : INDEX des 5 modules, puis Module 1
 * (arbre réel du dossier, avec numéros de page) et Modules 2 → 5 (ossature standard, sans page).
 */

// A4 en points (1 pt = 1/72").
const A4: [number, number] = [595.28, 841.89]
const MARGIN = 70.87 // 2,5 cm
const CONTENT_TOP = A4[1] - MARGIN
const CONTENT_BOTTOM = MARGIN
const CONTENT_WIDTH = A4[0] - 2 * MARGIN
// Bloc décalé (date, destinataire, signature) : commence à ~56 % de la largeur puis **aligné à gauche**
// (forme officielle UEMOA — ce n'est PAS un text-align:right). Le texte s'enroule dans la colonne de droite.
const RIGHT_BLOCK_INDENT = Math.round(CONTENT_WIDTH * 0.56)
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

export interface CoverInfo {
  /** Activité réglementaire (libellé), ex. « Nouvelle AMM ». */
  activity: string
  nomCommercial: string
  /** DCI + dosage joints, ex. « Paracétamol 500 mg ». */
  dciDosage: string
  titulaireName: string
  titulaireAddress: string
  fabricantName: string
  fabricantAddress: string
  /** Mois + année, ex. « Juin 2026 ». */
  dateLabel: string
}

export interface CompileInput {
  tree: CtdNodeDef[]
  moduleLabel: string
  country: string
  titulaire: string
  commercialLine: string
  logo?: { bytes: Uint8Array; isPng: boolean } | null
  /** Papier à en-tête (image) dessiné en haut des lettres générées — pleine largeur. */
  header?: { bytes: Uint8Array; isPng: boolean } | null
  /** Pied de page (image) dessiné en bas des lettres générées — pleine largeur. */
  footer?: { bytes: Uint8Array; isPng: boolean } | null
  /** Données des pages de couverture (CTD global + Module 1) ; null = pas de couverture. */
  cover?: CoverInfo | null
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
  /** Limite basse de la zone de texte (relevée quand un pied de page occupe le bas de la page). */
  bottom: number
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
    if (c.y - lh < c.bottom) newPage(c)
    // Texte toujours aligné à gauche ; `indent` décale le bloc (puces, ou bloc décalé date/destinataire).
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
  if (c.y - h < c.bottom) newPage(c)
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

/**
 * Indentation gauche d'un bloc : les paragraphes marqués `textAlign:'right'` (date, destinataire,
 * bloc signature) sont **décalés à droite mais alignés à gauche** (forme officielle UEMOA).
 */
function blockIndent(block: JSONContent): number {
  return block.attrs?.textAlign === 'right' ? RIGHT_BLOCK_INDENT : 0
}

async function renderTiptap(c: Cursor, content: JSONContent): Promise<void> {
  for (const block of content.content ?? []) {
    switch (block.type) {
      case 'heading': {
        c.y -= 4
        drawRuns(c, inlineRuns(block.content), 14, blockIndent(block))
        for (const src of inlineImages(block.content)) await drawImage(c, src)
        c.y -= 4
        break
      }
      case 'paragraph': {
        const runs = inlineRuns(block.content)
        if (runs.some((r) => r.text.trim().length > 0))
          drawRuns(c, runs, BODY_SIZE, blockIndent(block))
        else if (c.y - lineHeight(BODY_SIZE) < c.bottom) newPage(c)
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

/** Découpe un texte en lignes tenant dans `maxW` (mot à mot). */
function wrapPlain(text: string, font: PDFFont, size: number, maxW: number): string[] {
  const words = sanitize(text).split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let line = ''
  for (const word of words) {
    const cand = line ? `${line} ${word}` : word
    if (line && font.widthOfTextAtSize(cand, size) > maxW) {
      lines.push(line)
      line = word
    } else {
      line = cand
    }
  }
  if (line) lines.push(line)
  return lines.length > 0 ? lines : ['']
}

/**
 * Dessine un texte de bandeau **en entier** (jamais tronqué) : réduit la police de 10→7, puis
 * passe sur 2 lignes si nécessaire (titulaires longs, produits multi-molécules).
 */
function drawBandEntry(
  page: PDFPage,
  text: string,
  font: PDFFont,
  x: number,
  yTop: number,
  maxW: number,
  align: 'left' | 'right',
): void {
  const clean = sanitize(text)
  let size = 10
  while (size > 7 && font.widthOfTextAtSize(clean, size) > maxW) size -= 0.5
  const lines =
    font.widthOfTextAtSize(clean, size) <= maxW
      ? [clean]
      : wrapPlain(clean, font, size, maxW).slice(0, 2)
  lines.forEach((line, i) => {
    const lx = align === 'right' ? x - font.widthOfTextAtSize(line, size) : x
    page.drawText(line, { x: lx, y: yTop - i * (size + 1.5), size, font, color: BLACK })
  })
}

/** Bande image **pleine largeur** (en-tête/pied de lettre), avec garde-fou de hauteur. */
function bandLayout(img: PDFImage): { x: number; w: number; h: number } {
  const maxH = 130 // ~4,6 cm — évite qu'une image trop haute mange la page
  let w = A4[0]
  let h = (img.height / img.width) * w
  if (h > maxH) {
    h = maxH
    w = (img.width / img.height) * h
  }
  return { x: (A4[0] - w) / 2, w, h }
}

function stampAll(
  final: PDFDocument,
  input: CompileInput,
  fonts: Fonts,
  logo: PDFImage | null,
  coverIndices: Set<number>,
): void {
  const pages = final.getPages()
  const total = pages.length
  const half = CONTENT_WIDTH / 2 - 10
  pages.forEach((page, idx) => {
    // En-tête/pied **uniquement** sur les pages de garde — jamais sur un document (admin/généré/traduit).
    if (!coverIndices.has(idx)) return
    const { width, height } = page.getSize()
    const hy = height - 48

    let hx = MARGIN
    if (logo) {
      const lh = 16
      const lw = (logo.width / logo.height) * lh
      page.drawImage(logo, { x: MARGIN, y: hy - 4, width: lw, height: lh })
      hx = MARGIN + lw + 6
    }
    // Noms **complets** (jamais tronqués) : titulaire à gauche, produit à droite.
    drawBandEntry(page, input.titulaire, fonts.regular, hx, hy, half - (hx - MARGIN), 'left')
    drawBandEntry(page, input.commercialLine, fonts.regular, width - MARGIN, hy, half, 'right')
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

export interface TdmEntry {
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

/* --------- TDM « tous modules » : INDEX + Module 1 réel + ossature Modules 2→5 --------- */

export interface TdmLine {
  kind: 'title' | 'subtitle' | 'index' | 'module' | 'entry'
  text?: string
  number?: string
  label?: string
  depth?: number
  /** Pour une entrée Module 1 avec contenu : index (0-based) de sa page de garde dans le contenu. */
  startIndex?: number
}

function tdmLineHeight(line: TdmLine): number {
  switch (line.kind) {
    case 'title':
      return lineHeight(16) + 14
    case 'subtitle':
      return lineHeight(10) + 12
    case 'index':
      return lineHeight(11) + 1
    case 'module':
      return lineHeight(12) + 12
    case 'entry':
      return lineHeight(11)
  }
}

function outlineToLines(
  nodes: CtdNodeDef[],
  depth: number,
  out: TdmLine[],
  pageOf?: Map<string, number>,
): void {
  for (const n of nodes) {
    out.push({
      kind: 'entry',
      number: n.number,
      label: n.label,
      depth,
      startIndex: pageOf?.get(n.number),
    })
    if (n.children && n.children.length > 0) outlineToLines(n.children, depth + 1, out, pageOf)
  }
}

export function buildTdmLines(input: CompileInput, entries: TdmEntry[]): TdmLine[] {
  const pageOf = new Map<string, number>()
  for (const e of entries) pageOf.set(e.number, e.startIndex)

  const lines: TdmLine[] = [
    { kind: 'title', text: 'TABLE DES MATIÈRES' },
    { kind: 'subtitle', text: 'Table des matières détaillée — tous les modules du CTD' },
  ]
  // INDEX des 5 modules.
  for (const m of CTD_MODULE_TITLES) lines.push({ kind: 'index', number: m.number, text: m.title })
  // Module 1 = arbre réel du dossier (avec numéros de page là où il y a du contenu).
  const m1 = CTD_MODULE_TITLES[0]
  lines.push({ kind: 'module', number: m1?.number ?? '1', label: m1?.title ?? 'Module 1' })
  outlineToLines(input.tree, 1, lines, pageOf)
  // Modules 2 → 5 = ossature standard (sans numéro de page : hors de ce dossier).
  for (const mod of CTD_OUTLINE_2_5) {
    lines.push({ kind: 'module', number: mod.number, label: mod.title })
    outlineToLines(mod.nodes, 1, lines)
  }
  return lines
}

function paginateTdm(lines: TdmLine[]): TdmLine[][] {
  const pages: TdmLine[][] = [[]]
  let y = CONTENT_TOP
  for (const line of lines) {
    const h = tdmLineHeight(line)
    if (y - h < CONTENT_BOTTOM) {
      pages.push([])
      y = CONTENT_TOP
    }
    pages[pages.length - 1]!.push(line)
    y -= h
  }
  return pages
}

function drawTdmLine(
  page: PDFPage,
  line: TdmLine,
  y: number,
  fonts: Fonts,
  pagesBeforeContent: number,
): void {
  switch (line.kind) {
    case 'title':
      page.drawText(sanitize(line.text ?? ''), {
        x: MARGIN,
        y,
        size: 16,
        font: fonts.bold,
        color: BLACK,
      })
      return
    case 'subtitle':
      page.drawText(ellipsize(line.text ?? '', fonts.regular, 10, CONTENT_WIDTH), {
        x: MARGIN,
        y,
        size: 10,
        font: fonts.regular,
        color: GRAY,
      })
      return
    case 'index':
      page.drawText(
        ellipsize(`Module ${line.number} — ${line.text ?? ''}`, fonts.regular, 11, CONTENT_WIDTH),
        { x: MARGIN, y, size: 11, font: fonts.regular, color: BLACK },
      )
      return
    case 'module':
      page.drawText(
        ellipsize(
          `MODULE ${line.number} — ${(line.label ?? '').toUpperCase()}`,
          fonts.bold,
          12,
          CONTENT_WIDTH,
        ),
        { x: MARGIN, y, size: 12, font: fonts.bold, color: BLACK },
      )
      return
    case 'entry': {
      const indent = (line.depth ?? 0) * 14
      const hasPage = line.startIndex !== undefined
      const reserve = hasPage ? 40 : 6
      const label = ellipsize(
        `${line.number}  ${line.label ?? ''}`,
        fonts.regular,
        11,
        CONTENT_WIDTH - indent - reserve,
      )
      page.drawText(label, { x: MARGIN + indent, y, size: 11, font: fonts.regular, color: BLACK })
      if (hasPage) {
        const abs = pagesBeforeContent + (line.startIndex as number) + 1
        const s = String(abs)
        page.drawText(s, {
          x: A4[0] - MARGIN - fonts.regular.widthOfTextAtSize(s, 11),
          y,
          size: 11,
          font: fonts.regular,
          color: BLACK,
        })
      }
      return
    }
  }
}

/* ----------------------------- Pages de couverture ----------------------------- */

/** Couverture globale du dossier CTD (page 1) — DA officielle sobre (logo, filets, typo graduée). */
function drawGlobalCover(
  page: PDFPage,
  input: CompileInput,
  cover: CoverInfo,
  fonts: Fonts,
  logo: PDFImage | null,
): void {
  const { width, height } = page.getSize()

  // En-tête : logo (gauche) + nom/sigle du titulaire (droite) + filet.
  const headTop = height - MARGIN
  if (logo) {
    const lh = 38
    const lw = Math.min((logo.width / logo.height) * lh, 150)
    page.drawImage(logo, { x: MARGIN, y: headTop - lh, width: lw, height: lh })
  }
  if (cover.titulaireName) {
    const t = ellipsize(cover.titulaireName, fonts.bold, 12, CONTENT_WIDTH / 2)
    page.drawText(t, {
      x: width - MARGIN - fonts.bold.widthOfTextAtSize(t, 12),
      y: headTop - 24,
      size: 12,
      font: fonts.bold,
      color: BLACK,
    })
  }
  const ruleY = headTop - 52
  page.drawLine({
    start: { x: MARGIN, y: ruleY },
    end: { x: width - MARGIN, y: ruleY },
    thickness: 1,
    color: GRAY,
  })

  // Bloc central : surtitre, activité, produit, DCI/dosage, pays.
  let y = height * 0.66
  const center = (text: string, size: number, bold: boolean, gap: number): void => {
    if (!text) return
    const f = bold ? fonts.bold : fonts.regular
    const t = ellipsize(text, f, size, CONTENT_WIDTH)
    page.drawText(t, {
      x: (width - f.widthOfTextAtSize(t, size)) / 2,
      y,
      size,
      font: f,
      color: BLACK,
    })
    y -= gap
  }
  center("DOSSIER D'ENREGISTREMENT — COMMON TECHNICAL DOCUMENT (CTD)", 10, false, 28)
  center(cover.activity.toUpperCase(), 13, true, 32)
  center(cover.nomCommercial, 24, true, 30)
  center(cover.dciDosage, 14, false, 22)
  center(input.country, 13, false, 22)

  // Parties : titulaire + fabricant (si différent).
  y = height * 0.34
  const block = (label: string, name: string, address: string): void => {
    if (!name) return
    page.drawText(sanitize(label), { x: MARGIN, y, size: 9, font: fonts.bold, color: GRAY })
    y -= 15
    page.drawText(ellipsize(name, fonts.regular, 11, CONTENT_WIDTH), {
      x: MARGIN,
      y,
      size: 11,
      font: fonts.regular,
      color: BLACK,
    })
    y -= 13
    for (const ln of wrapPlain(address, fonts.regular, 10, CONTENT_WIDTH).slice(0, 3)) {
      if (!ln) break
      page.drawText(ln, { x: MARGIN, y, size: 10, font: fonts.regular, color: BLACK })
      y -= 12
    }
    y -= 12
  }
  block("TITULAIRE / DEMANDEUR D'AMM", cover.titulaireName, cover.titulaireAddress)
  if (cover.fabricantName && cover.fabricantName !== cover.titulaireName) {
    block('FABRICANT', cover.fabricantName, cover.fabricantAddress)
  }

  // Pied : activité + mois/année.
  const fy = MARGIN
  page.drawLine({
    start: { x: MARGIN, y: fy + 16 },
    end: { x: width - MARGIN, y: fy + 16 },
    thickness: 0.5,
    color: GRAY,
  })
  if (cover.activity) {
    page.drawText(sanitize(cover.activity), {
      x: MARGIN,
      y: fy,
      size: 9,
      font: fonts.regular,
      color: GRAY,
    })
  }
  const dl = sanitize(cover.dateLabel)
  page.drawText(dl, {
    x: width - MARGIN - fonts.regular.widthOfTextAtSize(dl, 9),
    y: fy,
    size: 9,
    font: fonts.regular,
    color: GRAY,
  })
}

/** Couverture du Module 1 (page 2). */
function drawModuleCover(page: PDFPage, input: CompileInput, fonts: Fonts): void {
  drawCentered(
    page,
    [
      { text: 'MODULE 1', size: 34, bold: true },
      { text: 'Informations administratives', size: 16, bold: false },
      { text: input.commercialLine, size: 12, bold: false },
      { text: input.country, size: 12, bold: false },
    ],
    fonts,
  )
}

/** Ajoute les pages de couverture en tête du document final. Renvoie le nombre de pages ajoutées. */
function drawCoverPages(
  final: PDFDocument,
  input: CompileInput,
  fonts: Fonts,
  logo: PDFImage | null,
): number {
  if (!input.cover) return 0
  drawGlobalCover(final.addPage(A4), input, input.cover, fonts, logo)
  drawModuleCover(final.addPage(A4), input, fonts)
  return 2
}

export async function compileDossier(input: CompileInput): Promise<Uint8Array> {
  // 1) Contenu (hors TDM) dans un doc temporaire, en mémorisant l'index de page de départ de chaque nœud.
  const contentDoc = await PDFDocument.create()
  const fonts: Fonts = {
    regular: await contentDoc.embedFont(StandardFonts.TimesRoman),
    bold: await contentDoc.embedFont(StandardFonts.TimesRomanBold),
  }
  const entries: TdmEntry[] = []
  // Index (0-based, dans contentDoc) des pages de garde générées → tamponnées en-tête/pied.
  const coverContentIndices = new Set<number>()

  // Papier à en-tête/pied (images) embarqués une fois dans le doc de contenu.
  const embedBand = async (
    src?: { bytes: Uint8Array; isPng: boolean } | null,
  ): Promise<PDFImage | null> => {
    if (!src) return null
    try {
      return src.isPng ? await contentDoc.embedPng(src.bytes) : await contentDoc.embedJpg(src.bytes)
    } catch {
      return null
    }
  }
  const letterHeader = await embedBand(input.header)
  const letterFooter = await embedBand(input.footer)

  async function walk(nodes: CtdNodeDef[], depth: number): Promise<void> {
    for (const node of nodes) {
      if (!hasContent(node, input)) continue
      const startIndex = contentDoc.getPageCount()
      const isSection = (node.children ?? []).length > 0
      if (isSection) {
        if (input.autoStructural) {
          coverContentIndices.add(contentDoc.getPageCount())
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
        // Un document = une sous-section : page d'annonce dédiée + document sur ses propres pages
        // (jamais deux documents sur une même page).
        const items: { render: () => Promise<void> }[] = []
        if (content.generated) {
          const generated = content.generated
          items.push({
            render: async () => {
              const page = contentDoc.addPage(A4)
              const cursor: Cursor = {
                doc: contentDoc,
                page,
                y: CONTENT_TOP,
                bottom: CONTENT_BOTTOM,
                fonts,
              }
              // Papier à en-tête en haut de la 1re page, pied en bas de la dernière — pleine largeur.
              if (letterHeader) {
                const b = bandLayout(letterHeader)
                page.drawImage(letterHeader, { x: b.x, y: A4[1] - b.h, width: b.w, height: b.h })
                cursor.y = A4[1] - b.h - 14
              }
              if (letterFooter) cursor.bottom = bandLayout(letterFooter).h + 14
              await renderTiptap(cursor, generated.content as JSONContent)
              if (letterFooter) {
                const b = bandLayout(letterFooter)
                cursor.page.drawImage(letterFooter, { x: b.x, y: 0, width: b.w, height: b.h })
              }
            },
          })
        }
        for (const piece of content.pieces) {
          items.push({ render: () => appendPiece(contentDoc, piece, fonts) })
        }
        let sub = 1
        for (const item of items) {
          if (input.autoStructural) {
            const number = items.length > 1 ? `${node.number}.${sub}` : node.number
            coverContentIndices.add(contentDoc.getPageCount())
            drawCentered(
              contentDoc.addPage(A4),
              [
                { text: number, size: 22, bold: true },
                { text: node.label, size: 14, bold: false },
              ],
              fonts,
            )
          }
          await item.render()
          sub++
        }
        entries.push({ number: node.number, label: node.label, depth, startIndex })
      }
    }
  }

  await walk(input.tree, 0)

  // 2) Assemblage final = couvertures + pages TDM (réservées) + contenu copié.
  const final = await PDFDocument.create()
  const fFonts: Fonts = {
    regular: await final.embedFont(StandardFonts.TimesRoman),
    bold: await final.embedFont(StandardFonts.TimesRomanBold),
  }

  // Logo (utilisé par la couverture ET le bandeau système) — embarqué tôt.
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

  // Couvertures (p.1 CTD global, p.2 Module 1) en tête — uniquement en mode structurel.
  const coverCount = input.autoStructural ? drawCoverPages(final, input, fFonts, logoImg) : 0

  // TDM « tous modules » : découpage en pages (indépendant des n° de page) → pages à réserver.
  const tdmLayout = input.autoStructural ? paginateTdm(buildTdmLines(input, entries)) : []
  const tdmPageCount = tdmLayout.length

  const tdmPages: PDFPage[] = []
  for (let i = 0; i < tdmPageCount; i++) tdmPages.push(final.addPage(A4))

  const copied = await final.copyPages(contentDoc, contentDoc.getPageIndices())
  copied.forEach((p) => final.addPage(p))

  // Pages tamponnées (bandeau système) = TDM + gardes/annonces, décalées des couvertures + TDM.
  // Les pages de couverture (0..coverCount-1) ont leur DA propre → jamais tamponnées.
  const coverPageIndices = new Set<number>()
  for (let i = 0; i < tdmPageCount; i++) coverPageIndices.add(coverCount + i)
  for (const ci of coverContentIndices) coverPageIndices.add(coverCount + tdmPageCount + ci)

  if (final.getPageCount() === 0) {
    coverPageIndices.add(0)
    drawCentered(final.addPage(A4), [{ text: 'Dossier vide', size: 16, bold: true }], fFonts)
  }

  // 3) Remplissage du TDM (numéro de page absolu = couvertures + TDM + index dans le contenu).
  tdmLayout.forEach((pageLines, p) => {
    const page = tdmPages[p]
    if (!page) return
    let y = CONTENT_TOP
    for (const line of pageLines) {
      drawTdmLine(page, line, y, fFonts, coverCount + tdmPageCount)
      y -= tdmLineHeight(line)
    }
  })

  // 4) En-tête/pied + pagination sur toutes les pages (hors couvertures).
  stampAll(final, input, fFonts, logoImg, coverPageIndices)

  return final.save()
}
