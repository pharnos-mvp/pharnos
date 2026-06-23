// Export PDF **vrai A4** du tableau comparatif — `pdf-lib` autonome (volontairement DÉCOUPLÉ du
// moteur de compilation du dossier : une table n'est pas de la prose, et on ne met pas le livrable
// métré à risque). Times New Roman, en-tête navy, retour à la ligne par cellule, sauts de page avec
// ré-affichage de l'en-tête. **Import dynamique** côté appelant (pdf-lib hors du chunk principal).
import { PDFDocument, StandardFonts, rgb, type PDFFont } from 'pdf-lib'

import type { ComparisonTable } from './variation-table'

const PAGE_W = 595.28
const PAGE_H = 841.89
const MARGIN = 45
const CONTENT_W = PAGE_W - 2 * MARGIN

const NAVY = rgb(0x26 / 255, 0x3f / 255, 0x73 / 255)
const BLACK = rgb(0.1, 0.1, 0.1)
const WHITE = rgb(1, 1, 1)
const GRID = rgb(0.6, 0.6, 0.6)

// Caractères représentables en WinAnsi (Latin-1 + bloc 0x80–0x9F de WinAnsi) ; le reste → '?'
// (StandardFonts.TimesRoman encode en WinAnsi et lèverait sinon sur une saisie exotique).
const WIN_EXTRA = '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ'
const UNSAFE = new RegExp(`[^\\t\\n\\r\\x20-\\x7E\\u00A0-\\u00FF${WIN_EXTRA}]`, 'g')
const safe = (t: string) => String(t).replace(UNSAFE, '?')

/** Découpe un texte (avec `\n` explicites) en lignes tenant dans `maxW`. */
function wrap(font: PDFFont, text: string, size: number, maxW: number): string[] {
  const out: string[] = []
  for (const seg of safe(text).split(/\r?\n/)) {
    const words = seg.split(/\s+/).filter(Boolean)
    if (words.length === 0) {
      out.push('')
      continue
    }
    let line = ''
    for (const w of words) {
      const test = line ? `${line} ${w}` : w
      if (font.widthOfTextAtSize(test, size) <= maxW) {
        line = test
      } else if (font.widthOfTextAtSize(w, size) > maxW) {
        // Mot plus large que la colonne : coupe caractère par caractère.
        if (line) out.push(line)
        let chunk = ''
        for (const ch of w) {
          if (font.widthOfTextAtSize(chunk + ch, size) <= maxW) chunk += ch
          else {
            if (chunk) out.push(chunk)
            chunk = ch
          }
        }
        line = chunk
      } else {
        if (line) out.push(line)
        line = w
      }
    }
    if (line) out.push(line)
  }
  return out.length ? out : ['']
}

export async function comparisonPdfBytes(table: ComparisonTable): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  const reg = await pdf.embedFont(StandardFonts.TimesRoman)
  const bold = await pdf.embedFont(StandardFonts.TimesRomanBold)

  const cols = table.colFractions.map((f) => f * CONTENT_W)
  const CELL = 9
  const LH = CELL * 1.25
  const PAD_H = 4
  const PAD_V = 4

  let page = pdf.addPage([PAGE_W, PAGE_H])
  let y = PAGE_H - MARGIN

  // Titre centré.
  const titleSize = 15
  const title = safe(table.title)
  page.drawText(title, {
    x: (PAGE_W - bold.widthOfTextAtSize(title, titleSize)) / 2,
    y: y - titleSize,
    size: titleSize,
    font: bold,
    color: NAVY,
  })
  y -= titleSize + 16

  // Bloc méta (label gras + valeur).
  for (const m of table.meta) {
    const label = safe(`${m.label} : `)
    page.drawText(label, { x: MARGIN, y: y - 10, size: 10, font: bold, color: BLACK })
    page.drawText(safe(m.value), {
      x: MARGIN + bold.widthOfTextAtSize(label, 10),
      y: y - 10,
      size: 10,
      font: reg,
      color: BLACK,
    })
    y -= 14
  }
  y -= 8

  const drawRow = (cells: string[], header: boolean) => {
    const font = header ? bold : reg
    const linesPer = cells.map((c, i) => wrap(font, c, CELL, (cols[i] ?? 0) - 2 * PAD_H))
    const rowH = Math.max(...linesPer.map((l) => l.length)) * LH + 2 * PAD_V

    // Saut de page : nouvelle page + ré-affichage de l'en-tête.
    if (y - rowH < MARGIN) {
      page = pdf.addPage([PAGE_W, PAGE_H])
      y = PAGE_H - MARGIN
      if (!header) drawRow(table.headers, true)
    }

    let x = MARGIN
    cells.forEach((_, i) => {
      const w = cols[i] ?? 0
      page.drawRectangle({
        x,
        y: y - rowH,
        width: w,
        height: rowH,
        color: header ? NAVY : undefined,
        borderColor: GRID,
        borderWidth: 0.5,
      })
      let ty = y - PAD_V - CELL
      for (const ln of linesPer[i] ?? []) {
        page.drawText(ln, {
          x: x + PAD_H,
          y: ty,
          size: CELL,
          font,
          color: header ? WHITE : BLACK,
        })
        ty -= LH
      }
      x += w
    })
    y -= rowH
  }

  drawRow(table.headers, true)
  for (const r of table.rows) drawRow(r, false)

  if (table.footnote) {
    y -= 10
    if (y < MARGIN) {
      page = pdf.addPage([PAGE_W, PAGE_H])
      y = PAGE_H - MARGIN
    }
    page.drawText(safe(table.footnote), { x: MARGIN, y: y - 9, size: 8, font: reg, color: BLACK })
  }

  return pdf.save()
}
