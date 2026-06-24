import type { JSONContent } from '@tiptap/core'
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from 'pdf-lib'

import type { GeneratedDocRecord } from '@/lib/db'
import { CTD_MODULE_TITLES, CTD_OUTLINE_2_5 } from '../ctd-full-outline'
import type { CtdNodeDef } from '../module1-tree'

/**
 * Compilation du Module 1 en un PDF unique (M6).
 *
 * Ordre : (TDM tous modules) → pour chaque section : page de garde → pour chaque pièce : page
 * d'annonce → document(s) (documents générés rendus en vecteur — lettre, template rempli,
 * traduction, version conforme : TOUS, chacun le sien — + pièces jointes/produit fusionnées).
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
// Branding des formulaires de templates (identique aux exports form-print/form-docx).
const NAVY = rgb(38 / 255, 63 / 255, 115 / 255)
const BAND_FILL = rgb(217 / 255, 217 / 255, 217 / 255)
const BAND_BORDER = rgb(128 / 255, 128 / 255, 128 / 255)

export interface CompilePiece {
  bytes: Uint8Array
  mime: string
  fileName: string
  /** Pièce non résolue (blob absent + Storage injoignable) → page « non incluse » visible. */
  missing?: boolean
}

export interface CompileNodeContent {
  /** Documents générés du nœud (lettre, template rempli, traduction, version conforme) — TOUS compilés. */
  generated: GeneratedDocRecord[]
  pieces: CompilePiece[]
}

export interface CoverInfo {
  /** Code de l'opération réglementaire (`new_ma` | `renewal` | `variation`) → intitulé de couverture. */
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
  /** Nom commercial seul (en-tête courant — jamais tronqué). */
  productName: string
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

export interface Fonts {
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

interface RunStyle {
  color?: ReturnType<typeof rgb>
  /** Ligne centrée dans la zone de contenu (titres officiels des formulaires). */
  center?: boolean
  /** Filet sous le texte (sous-sous-titres des formulaires — niveau 4). */
  underline?: boolean
}

function drawRuns(
  c: Cursor,
  runs: Run[],
  size: number,
  indent: number,
  prefix?: string,
  style: RunStyle = {},
): void {
  const lh = lineHeight(size)
  const color = style.color ?? BLACK
  const lines = wrap(runs, c.fonts, size, CONTENT_WIDTH - indent)
  lines.forEach((line, i) => {
    if (c.y - lh < c.bottom) newPage(c)
    const lineWidth = line.reduce(
      (wsum, run) =>
        wsum +
        (run.bold ? c.fonts.bold : c.fonts.regular).widthOfTextAtSize(sanitize(run.text), size),
      0,
    )
    // Texte aligné à gauche ; `indent` décale le bloc ; `center` centre la ligne (titres).
    const x0 = style.center
      ? MARGIN + indent + Math.max(0, (CONTENT_WIDTH - indent - lineWidth) / 2)
      : MARGIN + indent
    let x = x0
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
      c.page.drawText(t, { x, y: c.y, size, font, color })
      x += font.widthOfTextAtSize(t, size)
    }
    if (style.underline && lineWidth > 0) {
      c.page.drawLine({
        start: { x: x0, y: c.y - 1.5 },
        end: { x: x0 + lineWidth, y: c.y - 1.5 },
        thickness: 0.7,
        color,
      })
    }
    c.y -= lh
  })
}

/** Bandeau de rubrique du template Étiquetage : rectangle gris bordé, texte navy bold (wrap). */
function drawBanner(c: Cursor, runs: Run[]): void {
  const size = BODY_SIZE
  const lh = lineHeight(size)
  const boldRuns = runs.map((r) => ({ ...r, bold: true }))
  const lines = wrap(boldRuns, c.fonts, size, CONTENT_WIDTH - 16)
  const boxH = lines.length * lh + 8
  if (c.y + size - boxH < c.bottom) newPage(c)
  const top = c.y + size // du baseline courant vers le haut de la boîte
  c.page.drawRectangle({
    x: MARGIN,
    y: top - boxH,
    width: CONTENT_WIDTH,
    height: boxH,
    color: BAND_FILL,
    borderColor: BAND_BORDER,
    borderWidth: 0.6,
  })
  let baseline = top - 4 - size * 0.85
  for (const line of lines) {
    let x = MARGIN + 8
    for (const run of line) {
      const t = sanitize(run.text)
      c.page.drawText(t, { x, y: baseline, size, font: c.fonts.bold, color: NAVY })
      x += c.fonts.bold.widthOfTextAtSize(t, size)
    }
    baseline -= lh
  }
  c.y = top - boxH - 10
}

async function drawImage(c: Cursor, dataUrl: string, maxW = 180, indent = 0): Promise<void> {
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
  // Resserre l'écart au-dessus (vers le poste) puis laisse un espace équilibré en dessous (vers le nom)
  // → bloc signature proportionné, digne d'une lettre officielle.
  const LIFT = 8
  const BELOW = 16
  c.y += LIFT
  if (c.y - h - BELOW < c.bottom) newPage(c)
  c.page.drawImage(img, { x: MARGIN + indent, y: c.y - h, width: w, height: h })
  c.y -= h + BELOW
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

/** Comme `inlineRuns` mais découpé aux sauts de ligne (`hardBreak`) → un segment = une ligne serrée. */
function inlineSegments(nodes: JSONContent[] | undefined): Run[][] {
  const segs: Run[][] = [[]]
  for (const n of nodes ?? []) {
    if (n.type === 'hardBreak') {
      segs.push([])
    } else if (n.type === 'text') {
      const bold = (n.marks ?? []).some((m) => m.type === 'bold' || m.type === 'strong')
      segs[segs.length - 1]!.push({ text: n.text ?? '', bold })
    }
  }
  return segs
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

/* ----------------------------- Tableaux (extension-table) ----------------------------- */

const TABLE_SIZE = 10
const TABLE_PAD = 4
// #808080 : aligné avec la grille de l'éditeur (aperçu = compilé) ET ≥ 3:1 sur blanc (WCAG 1.4.11).
const TABLE_GRID = rgb(0.5, 0.5, 0.5)
const TABLE_HEAD_FILL = rgb(0.93, 0.93, 0.93)

/** Cellules (tableHeader|tableCell) d'une ligne de tableau. */
function rowCells(row: JSONContent): JSONContent[] {
  return (row.content ?? []).filter((x) => x.type === 'tableCell' || x.type === 'tableHeader')
}

/** Lignes de texte d'une cellule, enroulées à la largeur `w` (paragraphes + listes ; en-tête = gras). */
function cellLines(c: Cursor, cell: JSONContent, w: number, header: boolean): Run[][] {
  const maxW = Math.max(8, w - 2 * TABLE_PAD)
  const bolden = (runs: Run[]) => (header ? runs.map((r) => ({ ...r, bold: true })) : runs)
  const out: Run[][] = []
  for (const block of cell.content ?? []) {
    if (block.type === 'bulletList' || block.type === 'orderedList') {
      let i = 1
      for (const item of block.content ?? []) {
        const para = (item.content ?? []).find((x) => x.type === 'paragraph')
        const prefix = block.type === 'orderedList' ? `${i}. ` : '• '
        out.push(
          ...wrap(
            bolden([{ text: prefix, bold: false }, ...inlineRuns(para?.content)]),
            c.fonts,
            TABLE_SIZE,
            maxW,
          ),
        )
        i++
      }
    } else if (block.type === 'paragraph' || block.type === 'heading') {
      out.push(...wrap(bolden(inlineRuns(block.content)), c.fonts, TABLE_SIZE, maxW))
    }
  }
  return out.length ? out : [[]]
}

interface PlacedCell {
  cell: JSONContent
  rStart: number
  cStart: number
  cSpan: number
  rSpan: number
  header: boolean
  lines: Run[][]
}

/** Largeur en colonnes effectivement occupée à droite par `cStart`, bornée à la grille. */
function spanCols(cols: number, cStart: number, cSpan: number): number {
  return Math.max(1, Math.min(cols - cStart, cSpan))
}

/**
 * Dessine un tableau TipTap en pdf-lib. **Grille d'occupation** : colspan ET rowspan gérés comme le
 * DOCX (un même contenu rend à l'identique) — une cellule fusionnée verticalement réserve ses colonnes
 * sur les lignes suivantes (pas de décalage). Colonnes à largeur égale, enroulement par cellule, saut
 * de page entre lignes. Calqué sur `variation-table-pdf.ts` → fidèle dans le livrable métré.
 */
function drawTable(c: Cursor, node: JSONContent): void {
  const rows = (node.content ?? []).filter((r) => r.type === 'tableRow')
  if (rows.length === 0) return
  const lh = lineHeight(TABLE_SIZE)

  // PASS 1 — placement. occupancy[col] = nb de lignes encore couvertes par une cellule fusionnée
  // venant d'au-dessus → la ligne courante « saute » ces colonnes (jamais de décalage).
  const occupancy: number[] = []
  const placed: PlacedCell[] = []
  rows.forEach((row, r) => {
    let col = 0
    for (const cell of rowCells(row)) {
      while ((occupancy[col] ?? 0) > 0) col++
      const cSpan = Math.max(1, Math.min(64, Number(cell.attrs?.colspan ?? 1)))
      const rSpan = Math.max(1, Math.min(64, Number(cell.attrs?.rowspan ?? 1)))
      placed.push({
        cell,
        rStart: r,
        cStart: col,
        cSpan,
        rSpan,
        header: cell.type === 'tableHeader',
        lines: [],
      })
      for (let k = 0; k < cSpan; k++) occupancy[col + k] = rSpan
      col += cSpan
    }
    for (let k = 0; k < occupancy.length; k++) if ((occupancy[k] ?? 0) > 0) occupancy[k]!--
  })
  const cols = Math.max(1, occupancy.length)
  const colW = CONTENT_WIDTH / cols
  for (const p of placed)
    p.lines = cellLines(c, p.cell, spanCols(cols, p.cStart, p.cSpan) * colW, p.header)

  // PASS 2 — hauteur des lignes. rSpan==1 impose sa hauteur à sa ligne ; une cellule fusionnée
  // verticalement reporte son surplus sur la dernière ligne couverte.
  const rowH = rows.map(() => lh + 2 * TABLE_PAD)
  for (const p of placed) {
    const need = p.lines.length * lh + 2 * TABLE_PAD
    const last = Math.min(rows.length - 1, p.rStart + p.rSpan - 1)
    if (p.rSpan <= 1) {
      if (need > rowH[p.rStart]!) rowH[p.rStart] = need
    } else {
      let have = 0
      for (let r = p.rStart; r <= last; r++) have += rowH[r]!
      if (need > have) rowH[last]! += need - have
    }
  }

  // PASS 3 — dessin ligne par ligne (saut de page entre lignes). Une cellule fusionnée est dessinée
  // à sa ligne de départ, sur la hauteur cumulée des lignes qu'elle couvre.
  c.y -= 4
  for (let r = 0; r < rows.length; r++) {
    if (c.y - rowH[r]! < c.bottom) newPage(c)
    const top = c.y
    for (const p of placed) {
      if (p.rStart !== r) continue
      const last = Math.min(rows.length - 1, p.rStart + p.rSpan - 1)
      let h = 0
      for (let k = r; k <= last; k++) h += rowH[k]!
      const w = spanCols(cols, p.cStart, p.cSpan) * colW
      const x = MARGIN + p.cStart * colW
      c.page.drawRectangle({
        x,
        y: top - h,
        width: w,
        height: h,
        color: p.header ? TABLE_HEAD_FILL : undefined,
        borderColor: TABLE_GRID,
        borderWidth: 0.5,
      })
      let ty = top - TABLE_PAD - TABLE_SIZE
      for (const line of p.lines) {
        let tx = x + TABLE_PAD
        for (const run of line) {
          const font = run.bold ? c.fonts.bold : c.fonts.regular
          const txt = sanitize(run.text)
          c.page.drawText(txt, { x: tx, y: ty, size: TABLE_SIZE, font, color: BLACK })
          tx += font.widthOfTextAtSize(txt, TABLE_SIZE)
        }
        ty -= lh
      }
    }
    c.y -= rowH[r]!
  }
  c.y -= 6
}

/**
 * Rendu d'un contenu TipTap. `styled` (formulaires de templates — `templateKey: 'fill'`) :
 * hiérarchie IDENTIQUE aux exports form-print/form-docx — titre (niveau 1) centré navy bold,
 * bandeaux gris (attrs.banner), niveaux 2-3 navy bold, niveau 4 noir bold souligné.
 */
async function renderTiptap(c: Cursor, content: JSONContent, styled = false): Promise<void> {
  for (const block of content.content ?? []) {
    switch (block.type) {
      case 'heading': {
        if (styled) {
          const runs = inlineRuns(block.content).map((r) => ({ ...r, bold: true }))
          if (block.attrs?.banner === true) {
            c.y -= 4
            drawBanner(c, runs)
            break
          }
          const level = Number(block.attrs?.level ?? 2)
          c.y -= level === 1 ? 6 : 4
          if (level === 1) {
            drawRuns(c, runs, BODY_SIZE, 0, undefined, { color: NAVY, center: true })
          } else if (level >= 4) {
            drawRuns(c, runs, BODY_SIZE, 0, undefined, { underline: true })
          } else {
            drawRuns(c, runs, BODY_SIZE, 0, undefined, { color: NAVY })
          }
          c.y -= 4
          break
        }
        c.y -= 4
        drawRuns(c, inlineRuns(block.content), 14, blockIndent(block))
        for (const src of inlineImages(block.content))
          await drawImage(c, src, 180, blockIndent(block))
        c.y -= 4
        break
      }
      case 'paragraph': {
        const segments = inlineSegments(block.content)
        const images = inlineImages(block.content)
        const hasText = segments.some((seg) => seg.some((r) => r.text.trim().length > 0))
        const indent = blockIndent(block)
        if (hasText) {
          for (const seg of segments) drawRuns(c, seg, BODY_SIZE, indent)
          c.y -= 4
        } else if (images.length === 0) {
          // Vraie ligne vide (séparateur). Un paragraphe ne portant **qu'une image** (signature)
          // ne doit PAS ajouter d'interligne fantôme : drawImage gère son propre espacement.
          if (c.y - lineHeight(BODY_SIZE) < c.bottom) newPage(c)
          else c.y -= lineHeight(BODY_SIZE)
          c.y -= 4
        }
        for (const src of images) await drawImage(c, src, 180, indent)
        break
      }
      case 'bulletList':
      case 'orderedList': {
        // MVP : un paragraphe par item ; sous-listes et attribut "start" non gérés.
        let i = 1
        for (const item of block.content ?? []) {
          const para = (item.content ?? []).find((x) => x.type === 'paragraph')
          // Segments (sauts de ligne) → nom (1re ligne, avec puce) puis adresse (ligne suivante, alignée).
          const segs = inlineSegments(para?.content)
          segs.forEach((seg, si) => {
            const prefix = si === 0 ? (block.type === 'orderedList' ? `${i}.` : '•') : undefined
            drawRuns(c, seg, BODY_SIZE, 18, prefix)
          })
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
      case 'horizontalRule': {
        // Filet noir pleine largeur (séparateur officiel — ex. formulaire RCP avant
        // « CONDITIONS DE PRESCRIPTION ET DE DELIVRANCE »).
        if (c.y - 14 < c.bottom) newPage(c)
        c.y -= 8
        c.page.drawLine({
          start: { x: MARGIN, y: c.y },
          end: { x: A4[0] - MARGIN, y: c.y },
          thickness: 0.8,
          color: BLACK,
        })
        c.y -= 10
        break
      }
      case 'table': {
        drawTable(c, block)
        break
      }
      default:
        break
    }
  }
}

/**
 * Rend une lettre (cover/PGHT) sur ses propres pages A4 — **SOURCE UNIQUE** partagée par la
 * compilation du dossier ET l'export autonome de la Bibliothèque (`letter-pdf`), garantissant un
 * rendu identique. En-tête/pied = bandeaux image **pleine largeur** (haut de la 1re page / bas de
 * la dernière) ; le corps (Times 12, interligne 1,45, blocs « à droite » décalés à 56 %, signature
 * ≤ 6,35 cm) passe par `renderTiptap`. `styled` → hiérarchie navy/bandeaux des formulaires remplis.
 */
export async function drawLetterPages(
  doc: PDFDocument,
  fonts: Fonts,
  content: JSONContent,
  opts: { header?: PDFImage | null; footer?: PDFImage | null; styled?: boolean } = {},
): Promise<void> {
  const page = doc.addPage(A4)
  const cursor: Cursor = { doc, page, y: CONTENT_TOP, bottom: CONTENT_BOTTOM, fonts }
  if (opts.header) {
    const b = bandLayout(opts.header)
    page.drawImage(opts.header, { x: b.x, y: A4[1] - b.h, width: b.w, height: b.h })
    cursor.y = A4[1] - b.h - 14
  }
  if (opts.footer) cursor.bottom = bandLayout(opts.footer).h + 14
  await renderTiptap(cursor, content, opts.styled ?? false)
  if (opts.footer) {
    const b = bandLayout(opts.footer)
    cursor.page.drawImage(opts.footer, { x: b.x, y: 0, width: b.w, height: b.h })
  }
}

/* ----------------------------- Pages structurelles ----------------------------- */

function drawCentered(
  page: PDFPage,
  lines: { text: string; size: number; bold: boolean }[],
  fonts: Fonts,
): void {
  // Chaque ligne logique est **enroulée** (jamais tronquée) en sous-lignes visuelles centrées.
  const rendered = lines.flatMap((l) => {
    const font = l.bold ? fonts.bold : fonts.regular
    return wrapPlain(l.text, font, l.size, CONTENT_WIDTH).map((text) => ({
      text,
      size: l.size,
      bold: l.bold,
    }))
  })
  const totalH = rendered.reduce((s, l) => s + lineHeight(l.size), 0)
  let y = A4[1] / 2 + totalH / 2
  for (const l of rendered) {
    const font = l.bold ? fonts.bold : fonts.regular
    const w = font.widthOfTextAtSize(l.text, l.size)
    page.drawText(l.text, { x: (A4[0] - w) / 2, y, size: l.size, font, color: BLACK })
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
    drawBandEntry(page, input.productName, fonts.regular, width - MARGIN, hy, half, 'right')
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
  if (c && (c.generated.length > 0 || c.pieces.length > 0)) return true
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

/**
 * Intitulé de la page de couverture selon l'opération réglementaire du dossier (FR, langue de
 * soumission UEMOA). Défaut = enregistrement (nouvelle AMM) → comportement inchangé.
 */
export function coverHeadline(activity: string): [string, string] {
  const line2 = 'DE MISE SUR LE MARCHÉ (AMM)'
  if (activity === 'renewal') return ["DOSSIER CTD DE RENOUVELLEMENT D'AUTORISATION", line2]
  if (activity === 'variation') return ["DOSSIER CTD DE MODIFICATION D'AUTORISATION", line2]
  return ["DOSSIER CTD D'ENREGISTREMENT D'AUTORISATION", line2]
}

/** Couverture globale du dossier CTD (page 1) — DA officielle sobre (logo, filets, typo graduée). */
function drawGlobalCover(
  page: PDFPage,
  input: CompileInput,
  cover: CoverInfo,
  fonts: Fonts,
  logo: PDFImage | null,
): void {
  const { width, height } = page.getSize()

  // Cadre officiel (bordure pleine page, tracée en 4 segments → pas de remplissage).
  const fx = 24
  const fw = width - 48
  const fb = 24
  const fh = height - 48
  const edge = (x1: number, y1: number, x2: number, y2: number): void =>
    page.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness: 1, color: BLACK })
  edge(fx, fb, fx + fw, fb)
  edge(fx, fb + fh, fx + fw, fb + fh)
  edge(fx, fb, fx, fb + fh)
  edge(fx + fw, fb, fx + fw, fb + fh)

  const cx = width / 2
  const innerW = width - 2 * 54

  // Ligne **centrée** à une position absolue (calée sur le template officiel UEMOA), option soulignée.
  const at = (text: string, size: number, bold: boolean, yPos: number, underline = false): void => {
    if (!text) return
    const f = bold ? fonts.bold : fonts.regular
    const t = sanitize(text)
    const w = f.widthOfTextAtSize(t, size)
    page.drawText(t, { x: cx - w / 2, y: yPos, size, font: f, color: BLACK })
    if (underline) {
      page.drawLine({
        start: { x: cx - w / 2, y: yPos - 2.5 },
        end: { x: cx + w / 2, y: yPos - 2.5 },
        thickness: 0.6,
        color: BLACK,
      })
    }
  }
  // Texte **enroulé** centré à partir de `yTop` (jamais tronqué).
  const atWrapped = (
    text: string,
    size: number,
    bold: boolean,
    yTop: number,
    maxLines = 3,
  ): void => {
    if (!text) return
    const f = bold ? fonts.bold : fonts.regular
    let yy = yTop
    for (const ln of wrapPlain(text, f, size, innerW).slice(0, maxLines)) {
      const w = f.widthOfTextAtSize(ln, size)
      page.drawText(ln, { x: cx - w / 2, y: yy, size, font: f, color: BLACK })
      yy -= lineHeight(size)
    }
  }
  // Plus grande taille (parmi `cands`) qui tient le texte en `maxLines` lignes (auto-fit composition).
  const fit = (text: string, cands: number[], maxLines: number): number => {
    for (const s of cands) if (wrapPlain(text, fonts.bold, s, innerW).length <= maxLines) return s
    return cands[cands.length - 1] ?? 14
  }

  // Logo centré en haut.
  if (logo) {
    const lh = 48
    const lw = Math.min((logo.width / logo.height) * lh, 220)
    page.drawImage(logo, { x: cx - lw / 2, y: height - 92, width: lw, height: lh })
  }

  // Mise en page **calée sur le template officiel** (A4) : tailles + positions (fraction de hauteur)
  // → contenu réparti sur tout le corps de page.
  const [headline1, headline2] = coverHeadline(cover.activity)
  at(headline1, 12, true, height * 0.783, true)
  at(headline2, 12, true, height * 0.76, true)
  at(cover.nomCommercial, 24, true, height * 0.645)
  atWrapped(cover.dciDosage, fit(cover.dciDosage, [24, 20, 16, 14], 2), true, height * 0.605, 2)
  at(input.country, 20, true, height * 0.503)

  at('Dossier soumis par :', 14, true, height * 0.4, true)
  at(cover.titulaireName, 24, true, height * 0.338)
  atWrapped(cover.titulaireAddress, 12, false, height * 0.31, 3)

  if (cover.fabricantName && cover.fabricantName !== cover.titulaireName) {
    at('Fabricant :', 12, true, height * 0.198, true)
    at(cover.fabricantName, 11, true, height * 0.171)
    atWrapped(cover.fabricantAddress, 9, false, height * 0.147, 3)
  }
}

/** Couverture du Module 1 (page 2). */
function drawModuleCover(page: PDFPage, input: CompileInput, fonts: Fonts): void {
  drawCentered(
    page,
    [
      { text: 'MODULE 1', size: 34, bold: true },
      { text: 'Informations administratives', size: 16, bold: false },
      { text: input.commercialLine, size: 12, bold: false },
      { text: '', size: 12, bold: false },
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
        if (!content || (content.generated.length === 0 && content.pieces.length === 0)) continue
        // Un document = une sous-section : page d'annonce dédiée + document sur ses propres pages
        // (jamais deux documents sur une même page).
        const items: { render: () => Promise<void> }[] = []
        for (const generated of content.generated) {
          // Papier à en-tête/pied : LETTRES uniquement (cover, PGHT…). Templates remplis,
          // traductions, versions conformes et documents Word IMPORTÉS restent vierges — un .docx
          // arbitraire n'est pas une lettre officielle (aligné sur l'éditeur).
          const isLetter = !['translation', 'upgrade', 'fill', 'import'].includes(
            generated.templateKey,
          )
          items.push({
            // Source unique avec l'export Bibliothèque (`drawLetterPages`) : en-tête/pied = LETTRES
            // uniquement ; formulaires remplis (`fill`) → rendu stylé navy/bandeaux, sans branding.
            render: () =>
              drawLetterPages(contentDoc, fonts, generated.content as JSONContent, {
                header: isLetter ? letterHeader : null,
                footer: isLetter ? letterFooter : null,
                styled: generated.templateKey === 'fill',
              }),
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
          // Défensif : une pièce/lettre fautive ne doit pas abattre toute la compilation.
          try {
            await item.render()
          } catch (err) {
            console.error('[compile] rendu pièce :', err)
          }
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
