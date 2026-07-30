// Mise en page des livrables d'upgrade (porte 3) — DOCX + PDF, avec les bibliothèques du produit
// (docx@9.7.1, pdf-lib@1.17.1) : ce qui est validé ici est ce que l'application émettra.
//
// Deux profils :
//   'document' — RCP / SmPC, fidèle au gabarit ABMed 2026 (Arial, A4, marges 2,5 cm, titres #0B3D92,
//                sous-titres gras soulignés). Aucune marque de fournisseur : c'est la pièce déposée.
//   'report'   — rapport d'upgrade : encadré d'avertissement, tableaux, pastilles de criticité.
//
// ⚠️ Le PDF trace une chaîne ENTIÈRE par groupe de style, jamais mot à mot : positionner chaque mot
// produit un texte que les extracteurs recollent (« QUALITATIVEET ») — sur un document
// réglementaire, l'extractibilité fait partie de la conformité.
import { readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'

const require = createRequire('D:/pharnos-mvp/web/')
const {
  AlignmentType, BorderStyle, Document, Footer, Header, LeaderType, PageNumber, Packer,
  Paragraph, ShadingType, Table, TableCell, TableRow, Tab, TabStopType, TextRun, WidthType,
} = require('docx')
const { PDFDocument, PDFString, StandardFonts, rgb } = require('pdf-lib')

const BLUE = '0B3D92'
const GREY = '595959'
const RULE = 'BFBFBF'
const BAND = 'F2F4F8'
const FONT = 'Arial'
const PT = 11
const TITLE_PT = 12
const SMALL_PT = 9.5

/** Pastilles de criticité — le PDF ne sait pas dessiner d'émoji avec les polices standard. */
const DOTS = { '🔴': 'C00000', '🟠': 'E36C0A', '🟡': 'BF9000' }

/* ─────────────────────────────── Lecture du markdown ─────────────────────────────── */

function parse(md, profile) {
  const doc = profile === 'document'
  const out = []
  let started = doc ? false : true
  let blank = true
  const lines = md.split(/\r?\n/)

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]
    const line = raw.trimEnd()
    if (!line.trim()) { blank = true; continue }
    const push = (t, extra) => { out.push({ t, ...extra }); blank = true }

    // Titre du document
    if (doc && line.startsWith('## ') && !line.startsWith('###')) {
      started = true; push('title', { text: line.slice(3).trim() }); continue
    }
    if (!doc && line.startsWith('# ')) { push('title', { text: line.slice(2).trim() }); continue }
    if (!started) continue // préambule markdown du profil 'document' : hors livrable

    if (doc && line.startsWith('#### ')) { push('h2', { text: line.slice(5).trim() }); continue }
    if (doc && line.startsWith('### ')) { push('h1', { text: line.slice(4).trim() }); continue }
    if (!doc && line.startsWith('### ')) { push('h2', { text: line.slice(4).trim() }); continue }
    if (!doc && line.startsWith('## ')) { push('h1', { text: line.slice(3).trim() }); continue }
    if (line.startsWith('---')) { blank = true; continue }

    // Encadré d'avertissement (profil rapport)
    if (line.startsWith('>')) {
      // Les lignes de l'encadré sont repliées à ~100 colonnes comme le reste du markdown : on
      // recolle, et seule une ligne « > » VIDE sépare deux paragraphes. Sans cela, chaque repli
      // devenait un paragraphe et l'interligne s'écartait.
      const body = []
      while (i < lines.length && lines[i].trimStart().startsWith('>')) {
        const t = lines[i].trim().replace(/^>\s?/, '').replace(/^#+\s*/, '').trim()
        if (!t) body.push(null)
        else if (body.length && body[body.length - 1] !== null) body[body.length - 1] += ' ' + t
        else body.push(t)
        i++
      }
      i--
      push('quote', { lines: body.filter((x) => x !== null) })
      continue
    }

    // Tableau
    if (line.startsWith('|')) {
      const rows = []
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        const cells = lines[i].trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim())
        if (!cells.every((c) => /^:?-{2,}:?$/.test(c))) rows.push(cells)
        i++
      }
      i--
      push('table', { rows })
      continue
    }

    if (line.startsWith('- ')) {
      const item = line.slice(2).trim()
      const m = doc && item.match(/^(.*?)\s*\.{3,}\s*(.+)$/)
      if (m) {
        const v = m[2].match(/^([\d\s.,\u00A0]+)\s*(.*)$/)
        push('lead', { label: m[1].trim(), num: (v ? v[1] : m[2]).trim(), unit: v ? v[2].trim() : '' })
      } else push('bullet', { text: item })
      continue
    }
    if (/^\*\*[^*]+\*\*$/.test(line)) { push('sub', { text: line.slice(2, -2) }); continue }

    // Corps. Lignes consécutives = un paragraphe replié à ~100 colonnes ; sauf saut DUR (« \ »
    // final), qui porte du sens dans un bloc d'adresse (NOM / ADRESSE / contacts).
    const hard = line.endsWith('\\')
    const text = (hard ? line.slice(0, -1) : line).trim()
    const prev = out[out.length - 1]
    if (!blank && prev?.t === 'body' && !prev.hard) prev.text += ' ' + text
    else out.push({ t: 'body', text, hard: false })
    out[out.length - 1].hard = hard
    blank = false
  }
  return out
}

/** Découpe en runs {text, bold, italic} ; retire les accents graves de code et les émoji. */
function runs(text) {
  const clean = text.replace(/`/g, '').replace(/⚠️?/g, '').replace(/[🔴🟠🟡]/g, '').trim()
  return clean.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/).filter(Boolean).map((seg) => {
    if (seg.startsWith('**') && seg.endsWith('**')) return { text: seg.slice(2, -2), bold: true }
    if (seg.startsWith('*') && seg.endsWith('*')) return { text: seg.slice(1, -1), italic: true }
    return { text: seg }
  })
}

/** Couleur de pastille si le texte commence par un émoji de criticité. */
const dotOf = (t) => DOTS[[...t.trim()][0]] ?? null

const isMissing = (s) =>
  /^\[(Non fourni, à compléter|Not provided, to be completed)\]\.?$/.test(s.trim())

function productName(blocks) {
  const i = blocks.findIndex((b) => b.t === 'h1' && /^1\./.test(b.text))
  const first = blocks.slice(i + 1).find((b) => b.t === 'body')
  return (first?.text ?? '').split(/[,.]/)[0].trim()
}

/* ────────────────────────────────────── DOCX ────────────────────────────────────── */

const TEXT_W = 9072                          // largeur utile en twips (A4 − 2 × 2,5 cm)
const LEAD_RATIO = 0.56                      // le conduit de points s'arrête à 56 % de la largeur
const LEADER_AT = Math.round(TEXT_W * LEAD_RATIO)
const UNIT_AT = LEADER_AT + 90

function toDocx(blocks, { header }) {
  const common = { font: FONT, size: PT * 2 }
  const small = { font: FONT, size: SMALL_PT * 2, color: GREY }

  const para = (b) => {
    if (b.t === 'title') {
      return [new Paragraph({
        alignment: AlignmentType.CENTER, spacing: { after: 320 },
        children: [new TextRun({ ...common, size: TITLE_PT * 2, bold: true, color: BLUE, text: b.text })],
      })]
    }
    if (b.t === 'h1' || b.t === 'h2') {
      return [new Paragraph({
        spacing: { before: b.t === 'h1' ? 280 : 220, after: 90 },
        children: [new TextRun({ ...common, bold: true, color: BLUE, text: b.text })],
      })]
    }
    if (b.t === 'sub') {
      return [new Paragraph({
        spacing: { before: 140, after: 60 },
        children: [new TextRun({ ...common, bold: true, underline: {}, text: b.text })],
      })]
    }
    if (b.t === 'lead') {
      // Puce écrite EN DUR, comme dans le PDF : les deux formats doivent être identiques, sans
      // dépendre du moteur de listes de Word. Deux taquets alignent nombres puis unités.
      return [new Paragraph({
        indent: { left: 340 }, spacing: { after: 40 },
        tabStops: [
          { type: TabStopType.RIGHT, position: LEADER_AT, leader: LeaderType.DOT },
          { type: TabStopType.LEFT, position: UNIT_AT },
        ],
        children: [
          new TextRun({ ...common, text: `\u2022  ${b.label}` }),
          new TextRun({ ...common, children: [new Tab(), b.num] }),
          new TextRun({ ...common, children: [new Tab(), b.unit] }),
        ],
      })]
    }
    if (b.t === 'bullet') {
      const dot = dotOf(b.text)
      return [new Paragraph({
        indent: { left: 340, hanging: 200 }, spacing: { after: 60 },
        children: [
          new TextRun({ ...common, color: dot ?? undefined, text: '\u2022  ' }),
          ...runs(b.text).map((r) => new TextRun({ ...common, bold: r.bold, italics: r.italic, text: r.text })),
        ],
      })]
    }
    if (b.t === 'quote') {
      return b.lines.map((l, i) => new Paragraph({
        shading: { type: ShadingType.CLEAR, fill: BAND },
        border: { left: { style: BorderStyle.SINGLE, size: 18, color: BLUE, space: 8 } },
        indent: { left: 200, right: 200 }, spacing: { before: i ? 0 : 200, after: i === b.lines.length - 1 ? 240 : 100 },
        children: runs(l).map((r) => new TextRun({
          ...common, size: SMALL_PT * 2, bold: r.bold || i === 0, italics: r.italic, text: r.text,
        })),
      }))
    }
    if (b.t === 'table') {
      const [head, ...body] = b.rows
      const row = (cells, isHead) => new TableRow({
        tableHeader: isHead,
        children: cells.map((c) => new TableCell({
          shading: isHead ? { type: ShadingType.CLEAR, fill: BAND } : undefined,
          margins: { top: 60, bottom: 60, left: 100, right: 100 },
          children: [new Paragraph({
            children: [
              ...(dotOf(c) ? [new TextRun({ ...common, size: SMALL_PT * 2, color: dotOf(c), text: '\u25CF ' })] : []),
              ...runs(c).map((r) => new TextRun({
                ...common, size: SMALL_PT * 2, bold: r.bold || isHead, italics: r.italic, text: r.text,
              })),
            ],
          })],
        })),
      })
      const line = { style: BorderStyle.SINGLE, size: 2, color: RULE }
      return [
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          borders: { top: line, bottom: line, left: line, right: line, insideHorizontal: line, insideVertical: line },
          rows: [row(head, true), ...body.map((r) => row(r, false))],
        }),
        new Paragraph({ spacing: { after: 200 }, children: [] }),
      ]
    }
    const missing = isMissing(b.text)
    return [new Paragraph({
      spacing: { after: b.hard ? 0 : 120 },
      children: runs(b.text).map((r) => new TextRun({
        ...common, ...(missing ? { size: SMALL_PT * 2, color: GREY } : {}),
        bold: r.bold, italics: r.italic, text: r.text,
      })),
    })]
  }

  const pageNumberParagraph = () => new Paragraph({
    alignment: AlignmentType.RIGHT,
    children: [new TextRun({ ...small, children: [PageNumber.CURRENT, ' / ', PageNumber.TOTAL_PAGES] })],
  })

  return new Document({
    styles: { default: { document: { run: { font: FONT, size: PT * 2 } } } },
    sections: [{
      properties: {
        page: {
          size: { width: 11906, height: 16838 },
          margin: { top: 1417, right: 1417, bottom: 1134, left: 1417 },
        },
        // ⚠️ `titlePage` appartient à `properties` : c'est lui qui émet `<w:titlePg/>` dans
        // `sectPr`. Posé au niveau de la section, il est ignoré EN SILENCE — Word retombe alors
        // sur l'en-tête par défaut, et la première page porte le bandeau qu'on voulait lui retirer.
        titlePage: true,
      },
      // Nom du produit en haut à DROITE, absent de la première page (elle porte déjà le titre).
      // Le pied ne porte que la pagination, à droite : aucune marque de fournisseur sur une pièce
      // qui part à l'agence.
      headers: {
        default: new Header({
          children: [new Paragraph({
            alignment: AlignmentType.RIGHT, spacing: { after: 120 },
            children: [new TextRun({ ...small, text: header })],
          })],
        }),
        first: new Header({ children: [new Paragraph({ children: [] })] }),
      },
      footers: {
        default: new Footer({ children: [pageNumberParagraph()] }),
        first: new Footer({ children: [pageNumberParagraph()] }),
      },
      children: blocks.flatMap(para),
    }],
  })
}

/* ─────────────────────────────────────── PDF ─────────────────────────────────────── */

const A4 = [595.28, 841.89]
const M = 70.87
const W = A4[0] - 2 * M
const PDF_LEADER_AT = M + W * LEAD_RATIO
const PDF_UNIT_AT = PDF_LEADER_AT + 5

async function toPdf(blocks, { header, signature = false }) {
  const pdf = await PDFDocument.create()
  const reg = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const ital = await pdf.embedFont(StandardFonts.HelveticaOblique)
  // Polices de SECOURS pour les signes hors WinAnsi. Toutes deux font partie des 14 polices
  // standard du PDF : rien à embarquer, rien à licencier.
  const sym = await pdf.embedFont(StandardFonts.Symbol)
  const ding = await pdf.embedFont(StandardFonts.ZapfDingbats)
  const hex = (h) => rgb(parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4), 16) / 255)
  const blue = hex(BLUE)
  const grey = hex(GREY)
  const rule = hex(RULE)
  const band = hex(BAND)
  const black = rgb(0, 0, 0)

  // ⚠️ Les polices standard de pdf-lib ne codent que le WinAnsi : un caractère hors jeu fait
  // ÉCHOUER la génération, pas seulement mal rendre.
  //
  // Mais deux des 14 polices STANDARD du PDF portent ce qui manque : `Symbol` a ≥ ≤ ≠ ± × µ ∞,
  // `ZapfDingbats` a ●. Elles sont toujours présentes, sans embarquement, sans dépendance et sans
  // question de licence. On dessine donc le VRAI glyphe au lieu de le translittérer — « très
  // fréquent (≥ 1/10) » et non « (>= 1/10) ». Sur un tableau de fréquences MedDRA, l'opérateur
  // porte du sens : l'écrire en ASCII reproduisait le défaut même que la revue reproche à la source.
  //
  // Le repli ASCII ne subsiste que pour ce qu'aucune police standard ne sait tracer.
  const dropped = new Set()
  const GLYPH_FONT = { '≥': sym, '≤': sym, '≠': sym, '±': sym, '×': sym, '∞': sym, '●': ding }
  const SUBST = { '→': '->', '≡': '=', 'ᵉ': 'e', '−': '-', '‰': 'o/oo' }
  const WINANSI_EXTRA = new Set('€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ')
  const encodable = (ch) => ch.codePointAt(0) < 256 || WINANSI_EXTRA.has(ch)

  /** Normalise ce qui n'a NI police de secours NI codage direct. */
  const pdfSafe = (s) => [...String(s)].map((ch) => {
    if (GLYPH_FONT[ch]) return ch
    if (SUBST[ch]) return SUBST[ch]
    if (encodable(ch)) return ch
    dropped.add(ch)
    return ''
  }).join('')

  /**
   * Découpe un texte en tronçons homogènes de police : le texte courant, ou une police de secours
   * pour un signe isolé. Mesure ET tracé passent par ce même découpage — sinon la largeur calculée
   * ne correspond pas au texte tracé et tout ce qui suit se décale.
   */
  const runsByFont = (text, base) => {
    const out = []
    for (const ch of pdfSafe(text)) {
      const f = GLYPH_FONT[ch] ?? base
      const last = out[out.length - 1]
      if (last && last.font === f) last.text += ch
      else out.push({ font: f, text: ch })
    }
    return out
  }

  const widthOf = (text, base, size) =>
    runsByFont(text, base).reduce((w, r) => w + r.font.widthOfTextAtSize(r.text, size), 0)

  /**
   * Trace un texte pouvant mêler plusieurs polices, et rend la largeur consommée.
   *
   * ⚠️ TOUT tracé doit passer par ici. `pdfSafe` ne substitue plus les signes à police de secours :
   * un `drawText` direct avec une seule police LÈVERAIT sur « ≥ » ou « µ ». C'est le prix du vrai
   * glyphe, et il vaut d'être payé — mais il n'admet pas d'exception.
   */
  const drawMixedOn = (p, text, x, y0, base, size, color) => {
    let dx = 0
    for (const r of runsByFont(text, base)) {
      p.drawText(r.text, { x: x + dx, y: y0, size, font: r.font, color })
      dx += r.font.widthOfTextAtSize(r.text, size)
    }
    return dx
  }
  const drawMixed = (text, x, y0, base, size, color) =>
    drawMixedOn(page, text, x, y0, base, size, color)

  const TOP = A4[1] - M
  let page = pdf.addPage(A4)
  let y = TOP
  const fontOf = (s) => (s.italic ? ital : s.bold ? bold : reg)
  const space = (h) => { if (y - h < M) { page = pdf.addPage(A4); y = TOP } else y -= h }
  const newline = (h) => { if (y - h < M) { page = pdf.addPage(A4); y = TOP } y -= h }

  const layout = (segments, size, w) => {
    const words = []
    // Mesure ET tracé passent par le même filtre : une largeur calculée sur un texte différent de
    // celui tracé désaligne tout.
    for (const seg of segments) for (const word of pdfSafe(seg.text).split(/\s+/).filter(Boolean)) words.push({ word, seg })
    const lines = []
    let cur = []; let curW = 0
    for (const t of words) {
      const f = fontOf(t.seg)
      const ww = widthOf(t.word, f, size)
      const sw = f.widthOfTextAtSize(' ', size)
      const add = cur.length ? sw + ww : ww
      if (cur.length && curW + add > w) { lines.push(cur); cur = []; curW = ww } else curW += add
      cur.push(t)
    }
    if (cur.length) lines.push(cur)
    return lines.map((line) => {
      const groups = []
      for (const t of line) {
        const last = groups[groups.length - 1]
        if (last && last.seg === t.seg) last.text += ' ' + t.word
        else groups.push({ seg: t.seg, text: t.word })
      }
      return groups
    })
  }

  const drawLine = (line, x0, y0, size) => {
    let x = x0
    line.forEach((g, i) => {
      x += drawMixed(g.text, x, y0, fontOf(g.seg), size, g.seg.color ?? black)
      if (i < line.length - 1) x += reg.widthOfTextAtSize(' ', size)
    })
    return x - x0
  }

  const draw = (segments, { size = PT, lead = 14, indent = 0, centre = false, right = false, underline = false } = {}) => {
    const w = W - indent
    for (const line of layout(segments, size, w)) {
      newline(lead)
      const total = line.reduce((s, g) => s + widthOf(g.text, fontOf(g.seg), size), 0)
        + (line.length - 1) * reg.widthOfTextAtSize(' ', size)
      const x0 = M + indent + (centre ? Math.max(0, (w - total) / 2) : right ? Math.max(0, w - total) : 0)
      drawLine(line, x0, y, size)
      if (underline) {
        page.drawLine({ start: { x: x0, y: y - 1.8 }, end: { x: x0 + total, y: y - 1.8 }, thickness: 0.6, color: line[0].seg.color ?? black })
      }
    }
  }

  const drawLead = (b) => {
    newline(13)
    const x0 = M + 17
    const lbl = '\u2022  ' + b.label
    // `\u00b5` d'une unit\u00e9 (\u00b5g/mL) est trac\u00e9 par Symbol : la largeur doit venir du m\u00eame d\u00e9coupage.
    const numW = widthOf(b.num, reg, PT)
    drawMixed(lbl, x0, y, reg, PT, black)
    drawMixed(b.num, PDF_LEADER_AT - numW, y, reg, PT, black)
    if (b.unit) drawMixed(b.unit, PDF_UNIT_AT, y, reg, PT, black)
    const from = x0 + widthOf(lbl + ' ', reg, PT)
    const to = PDF_LEADER_AT - numW - reg.widthOfTextAtSize(' ', PT)
    const dw = reg.widthOfTextAtSize('.', PT)
    if (to > from) page.drawText('.'.repeat(Math.floor((to - from) / dw)), { x: from, y, size: PT, font: reg, color: grey })
    space(2)
  }

  const drawQuote = (b) => {
    const size = SMALL_PT
    const inner = W - 40
    const all = b.lines.map((l, i) => layout(runs(l).map((r) => ({ ...r, bold: r.bold || i === 0 })), size, inner))
    const h = all.reduce((s, ls) => s + ls.length * 13, 0) + 22 + (all.length - 1) * 5
    if (y - h < M) { page = pdf.addPage(A4); y = TOP }
    page.drawRectangle({ x: M, y: y - h, width: W, height: h, color: band })
    page.drawRectangle({ x: M, y: y - h, width: 2.6, height: h, color: blue })
    y -= 11
    all.forEach((ls, i) => {
      for (const line of ls) { y -= 13; drawLine(line, M + 20, y, size) }
      if (i < all.length - 1) y -= 5
    })
    y -= 11
    space(10)
  }

  const drawTable = (b) => {
    const size = SMALL_PT
    const [head, ...rows] = b.rows
    const weight = head.map((_, c) => Math.max(...b.rows.map((r) => (r[c] ?? '').length)))
    const totalW = weight.reduce((a, x) => a + x, 0)
    const cols = weight.map((x) => Math.max(52, (x / totalW) * W))
    const scale = W / cols.reduce((a, x) => a + x, 0)
    const widths = cols.map((c) => c * scale)

    const renderRow = (cells, isHead) => {
      const lines = cells.map((c, i) => {
        const segs = runs(c)
        const dot = dotOf(c)
        return layout(
          // Rond plein, comme dans le DOCX : ZapfDingbats le trace, plus besoin de le d\u00e9grader en puce.
          [...(dot ? [{ text: '\u25cf', color: hex(dot) }] : []), ...segs.map((r) => ({ ...r, bold: r.bold || isHead }))],
          size, widths[i] - 10,
        )
      })
      const h = Math.max(...lines.map((l) => l.length)) * 12 + 8
      if (y - h < M) { page = pdf.addPage(A4); y = TOP }
      if (isHead) page.drawRectangle({ x: M, y: y - h, width: W, height: h, color: band })
      let x = M
      lines.forEach((ls, i) => {
        let yy = y - 4
        for (const line of ls) { yy -= 10; drawLine(line, x + 5, yy, size) }
        x += widths[i]
      })
      page.drawLine({ start: { x: M, y: y - h }, end: { x: M + W, y: y - h }, thickness: 0.5, color: rule })
      y -= h
    }
    page.drawLine({ start: { x: M, y }, end: { x: M + W, y }, thickness: 0.5, color: rule })
    renderRow(head, true)
    rows.forEach((r) => renderRow(r, false))
    space(14)
  }

  for (const b of blocks) {
    if (b.t === 'title') {
      space(6); draw([{ text: b.text, bold: true, color: blue }], { size: TITLE_PT, lead: 16, centre: true }); space(12)
    } else if (b.t === 'h1' || b.t === 'h2') {
      space(b.t === 'h1' ? 12 : 8); draw([{ text: b.text, bold: true, color: blue }], { lead: 14 }); space(3)
    } else if (b.t === 'sub') {
      space(7); draw([{ text: b.text, bold: true }], { lead: 14, underline: true }); space(2)
    } else if (b.t === 'lead') {
      drawLead(b)
    } else if (b.t === 'quote') {
      drawQuote(b)
    } else if (b.t === 'table') {
      drawTable(b)
    } else if (b.t === 'bullet') {
      const dot = dotOf(b.text)
      const yb = y - 13
      draw(runs(b.text), { indent: 26, lead: 13 })
      page.drawText('\u2022', { x: M + 12, y: yb, size: PT, font: reg, color: dot ? hex(dot) : black })
      space(3)
    } else if (isMissing(b.text)) {
      draw([{ text: b.text, color: grey }], { size: SMALL_PT, lead: 12 }); space(b.hard ? 0 : 6)
    } else {
      draw(runs(b.text), { lead: 14 }); space(b.hard ? 0 : 6)
    }
  }

  // En-tête + pagination — posés après coup : le total de pages n'est connu qu'à la fin.
  // Conventions reprises du compilateur CTD : pagination en bas à DROITE, filigrane centré au pied.
  const pages = pdf.getPages()
  const headW = widthOf(header, reg, SMALL_PT)
  pages.forEach((p, i) => {
    // Pas d'en-tête sur la PREMIÈRE page : elle porte déjà le titre du document.
    if (i > 0) {
      drawMixedOn(p, header, A4[0] - M - headW, A4[1] - M + 16, reg, SMALL_PT, grey)
    }
    const n = `${i + 1} / ${pages.length}`
    drawMixedOn(p, n, A4[0] - M - widthOf(n, reg, SMALL_PT), M - 26, reg, SMALL_PT, grey)
    if (signature) drawSignature(p)
  })

  /**
   * Signature du RAPPORT — même forme que le filigrane des dossiers CTD compilés : pied centré,
   * « Pharnos » en navy souligné et cliquable. Elle n'apparaît QUE sur le rapport : le RCP et le
   * SmPC partent à l'agence et ne portent aucune marque de fournisseur.
   */
  function drawSignature(p) {
    const size = 8
    const y0 = M - 26
    const prefix = 'Regafy AI by '
    const brand = 'Pharnos'
    const pw = reg.widthOfTextAtSize(prefix, size)
    const bw = bold.widthOfTextAtSize(brand, size)
    const x0 = (A4[0] - (pw + bw)) / 2
    const bx = x0 + pw
    p.drawText(prefix, { x: x0, y: y0, size, font: reg, color: grey })
    p.drawText(brand, { x: bx, y: y0, size, font: bold, color: blue })
    p.drawLine({ start: { x: bx, y: y0 - 1.5 }, end: { x: bx + bw, y: y0 - 1.5 }, thickness: 0.5, color: blue })
    const link = p.doc.context.register(p.doc.context.obj({
      Type: 'Annot', Subtype: 'Link', Rect: [bx, y0 - 3, bx + bw, y0 + size],
      Border: [0, 0, 0],
      // ⚠️ `PDFString.of` est OBLIGATOIRE : une chaîne JS brute serait encodée comme un NOM PDF
      // (`/https://pharnos.com`), ce qui est illégal pour un URI. Le lien serait mort et les
      // lecteurs signaleraient « Illegal URI-type link ».
      A: { Type: 'Action', S: 'URI', URI: PDFString.of('https://pharnos.com') },
    }))
    p.node.addAnnot(link)
  }
  if (dropped.size) console.warn('   ⚠ caractères non codables retirés du PDF :', [...dropped].join(' '))
  return pdf.save()
}

/* ────────────────────────────────────── Sortie ────────────────────────────────────── */

const base = 'D:/pharnos-mvp/docs/gabarits/RCP'

// Le livrable : DEUX documents en DOCX + PDF, et UN SEUL rapport, en PDF. Le rapport n'a pas
// vocation à être édité par le client — il constate, il ne se complète pas.
const jobs = [
  { src: 'Gynoril-conforme-FR', out: 'Gynoril-RCP-FR', profile: 'document', docx: true },
  { src: 'Gynoril-conforme-EN', out: 'Gynoril-SmPC-EN', profile: 'document', docx: true },
  {
    src: 'Gynoril-rapport-analyse', out: 'Gynoril-revue-reglementaire-RCP', profile: 'report',
    docx: false, signature: true, header: 'GYNORIL \u2014 Revue r\u00e9glementaire',
  },
  // Cas reel : KV-Kacin 500 (amikacine injectable), source ANGLAISE, depot Benin.
  { src: 'KV-Kacin-conforme-FR', out: 'KV-Kacin-RCP-FR', profile: 'document', docx: true },
  { src: 'KV-Kacin-conforme-EN', out: 'KV-Kacin-SmPC-EN', profile: 'document', docx: true },
  {
    src: 'KV-Kacin-rapport-analyse', out: 'KV-Kacin-SmPC-regulatory-review', profile: 'report',
    docx: false, signature: true, header: 'KV-KACIN 500 \u2014 Regulatory Review',
  },
  // Gabarit de R\u00c9F\u00c9RENCE en anglais (miroir de la maquette ABMed) : ce n'est pas un livrable
  // client, c'est le socle que le CEO archive dans RA-source/Template/RCP/.
  {
    src: 'Gabarit-SmPC-EN-UEMOA', out: 'Gabarit-SmPC-EN-UEMOA', profile: 'document',
    docx: true, header: 'SmPC template \u2014 UEMOA',
  },
]
for (const job of jobs) {
  const blocks = parse(readFileSync(`${base}/${job.src}.md`, 'utf8'), job.profile)
  const header = job.header ?? productName(blocks)
  if (job.docx) writeFileSync(`${base}/${job.out}.docx`, await Packer.toBuffer(toDocx(blocks, { header })))
  writeFileSync(`${base}/${job.out}.pdf`, await toPdf(blocks, { header, signature: job.signature }))
  console.log(
    `${job.out.padEnd(26)} ${String(blocks.length).padStart(3)} blocs · ` +
    `${job.docx ? 'DOCX + PDF' : 'PDF seul  '} · en-tête « ${header} »`,
  )
}
