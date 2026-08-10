/**
 * Rendu PDF d'un livrable d'upgrade — profil `document` (RCP / SmPC) et profil `report`.
 *
 * ⚠️ Le PDF trace une chaîne ENTIÈRE par groupe de style, jamais mot à mot : positionner chaque mot
 * produit un texte que les extracteurs recollent (« QUALITATIVEET »). Sur un document
 * réglementaire, l'extractibilité fait partie de la conformité — c'est ce PDF que l'agence
 * indexera, et c'est aussi lui que notre propre moteur relira si le client le redépose.
 *
 * Module PUR — `pdf-lib` seul, aucune API Node ni DOM.
 */
import {
  type PDFFont,
  type PDFPage,
  PDFDocument,
  PDFString,
  type RGB,
  StandardFonts,
  rgb,
} from 'pdf-lib'

import { type Block, dotOf, isMissing, runs } from './blocks'
import { BAND, BLUE, GREY, PT, RULE, SMALL_PT, TITLE_PT } from './style'

/**
 * Les deux espaces insécables, écrites par leur code plutôt qu'en clair.
 *
 * Un caractère invisible dans le source est illisible en revue et ne survit pas à un outil qui
 * ré-encode le fichier — or ces deux-là décident si « 250 000 UI » reste un seul nombre.
 */
const NBSP = String.fromCharCode(0x00a0)
const NNBSP = String.fromCharCode(0x202f)

/**
 * Blancs sur lesquels un retour à la ligne est permis : tous SAUF les insécables.
 *
 * ⚠️ `/\s+/` les inclut. Couper dessus, puis recoller les mots avec une espace ordinaire, revenait
 * à casser la solidarité d'un nombre — ce que l'insécable existe précisément pour empêcher.
 */
const BREAKABLE = new RegExp(`[^\\S${NBSP}${NNBSP}]+`)

const A4: [number, number] = [595.28, 841.89]
const M = 70.87
const W = A4[0] - 2 * M
const LEAD_RATIO = 0.56
const PDF_LEADER_AT = M + W * LEAD_RATIO
const PDF_UNIT_AT = PDF_LEADER_AT + 5

export interface PdfOptions {
  /** En-tête courant — le nom du produit. Absent de la première page. */
  header: string
  /**
   * Signature « Regafy AI by Pharnos » au pied. Réservée au RAPPORT : le RCP et le SmPC partent à
   * l'agence et ne portent AUCUNE marque de fournisseur (étape 3 §3).
   */
  signature?: boolean
  /**
   * Date de création inscrite dans le PDF. Injectable pour obtenir un rendu DÉTERMINISTE : sans
   * elle, deux rendus du même contenu diffèrent d'octets et l'on ne peut plus vérifier que le
   * navigateur produit exactement ce que le serveur a mesuré (critère de recette U5).
   */
  created?: Date
}

export interface PdfResult {
  bytes: Uint8Array
  /**
   * Caractères qu'aucune police standard ne sait tracer, retirés du rendu. À REMONTER, jamais à
   * taire : un signe manquant dans un tableau de fréquences change le sens de la ligne.
   */
  dropped: string[]
}

export async function buildDeliverablePdf(
  blocks: readonly Block[],
  { header, signature = false, created }: PdfOptions,
): Promise<PdfResult> {
  const pdf = await PDFDocument.create()
  if (created) {
    pdf.setCreationDate(created)
    pdf.setModificationDate(created)
  }
  const reg = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const ital = await pdf.embedFont(StandardFonts.HelveticaOblique)
  // Polices de SECOURS pour les signes hors WinAnsi. Toutes deux font partie des 14 polices
  // standard du PDF : rien à embarquer, rien à licencier.
  const sym = await pdf.embedFont(StandardFonts.Symbol)
  const ding = await pdf.embedFont(StandardFonts.ZapfDingbats)
  const hex = (h: string) =>
    rgb(
      parseInt(h.slice(0, 2), 16) / 255,
      parseInt(h.slice(2, 4), 16) / 255,
      parseInt(h.slice(4), 16) / 255,
    )
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
  const dropped = new Set<string>()
  const GLYPH_FONT: Record<string, PDFFont> = {
    '≥': sym,
    '≤': sym,
    '≠': sym,
    '±': sym,
    '×': sym,
    '∞': sym,
    '●': ding,
  }
  const SUBST: Record<string, string> = {
    '→': '->',
    '≡': '=',
    ᵉ: 'e',
    '−': '-',
    '‰': 'o/oo',
    // ATTENTION : espace FINE insecable (U+202F), celle que produisent Word et les traitements
    // de texte francais dans un nombre comme 250 000 UI. Hors WinAnsi, elle etait purement
    // SUPPRIMEE : le PDF portait 250000 la ou le DOCX portait 250 000. Un dosage FAUX dans une
    // piece deposee, invisible a la relecture puisque le nombre reste plausible. On la degrade
    // vers l insecable ordinaire (U+00A0), codable en WinAnsi, qui garde le nombre solidaire.
    [NNBSP]: NBSP,
    // La tabulation se DÉGRADE en espace au lieu d'être jetée : elle sépare des mots, et la perdre
    // recollerait deux cellules d'un tableau recopié depuis la source.
    '\t': ' ',
  }
  const WINANSI_EXTRA = new Set('€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ')

  /**
   * ⚠️ **`< 256` était FAUX, et le prix de l'erreur était les cinq fichiers.** WinAnsi ne code ni
   * les contrôles C0 (`U+0000`–`U+001F`), ni `U+007F`, ni les C1 bruts (`U+0080`–`U+009F`) — tous
   * inférieurs à 256. `pdfSafe` les laissait donc passer intacts, `drawText` LEVAIT, et
   * `buildDeliverablePdf` rejetait : l'acheteur ne recevait AUCUN fichier, et redéposer n'y changeait
   * rien puisque le défaut est déterministe.
   *
   * Mesuré contre pdf-lib : `0x7f`, `0x80` et `0x9d` lèvent bien ; `0x09` passe. Peu importe —
   * l'énumération de ce que WinAnsi code VRAIMENT est la seule forme sûre, et elle ne dépend pas
   * du détail d'implémentation de la bibliothèque.
   *
   * ⚠️ Et le mécanisme `dropped`, écrit précisément pour signaler un caractère perdu, ne voyait
   * rien : la levée le précédait. Un garde-fou placé après ce qu'il doit surveiller n'en est pas un.
   *
   * `U+0080` et `U+009D` ne sont pas théoriques : ce sont exactement les octets que produit un
   * aller-retour UTF-8 → CP1252 sur une apostrophe typographique, le mojibake le plus banal d'une
   * source réglementaire — que le modèle recopie fidèlement, puisque c'est ce qu'il lit.
   */
  const encodable = (ch: string) => {
    const c = ch.codePointAt(0) ?? 0
    return (c >= 0x20 && c <= 0x7e) || (c >= 0xa0 && c <= 0xff) || WINANSI_EXTRA.has(ch)
  }

  /** Normalise ce qui n'a NI police de secours NI codage direct. */
  const pdfSafe = (s: string) =>
    [...String(s)]
      .map((ch) => {
        if (GLYPH_FONT[ch]) return ch
        if (SUBST[ch]) return SUBST[ch]
        if (encodable(ch)) return ch
        dropped.add(ch)
        return ''
      })
      .join('')

  /**
   * Découpe un texte en tronçons homogènes de police : le texte courant, ou une police de secours
   * pour un signe isolé. Mesure ET tracé passent par ce même découpage — sinon la largeur calculée
   * ne correspond pas au texte tracé et tout ce qui suit se décale.
   */
  const runsByFont = (text: string, base: PDFFont) => {
    const out: { font: PDFFont; text: string }[] = []
    for (const ch of pdfSafe(text)) {
      const f = GLYPH_FONT[ch] ?? base
      const last = out[out.length - 1]
      if (last && last.font === f) last.text += ch
      else out.push({ font: f, text: ch })
    }
    return out
  }

  const widthOf = (text: string, base: PDFFont, size: number) =>
    runsByFont(text, base).reduce((w, r) => w + r.font.widthOfTextAtSize(r.text, size), 0)

  /**
   * Trace un texte pouvant mêler plusieurs polices, et rend la largeur consommée.
   *
   * ⚠️ TOUT tracé doit passer par ici. `pdfSafe` ne substitue plus les signes à police de secours :
   * un `drawText` direct avec une seule police LÈVERAIT sur « ≥ » ou « µ ». C'est le prix du vrai
   * glyphe, et il vaut d'être payé — mais il n'admet pas d'exception.
   */
  const drawMixedOn = (
    p: PDFPage,
    text: string,
    x: number,
    y0: number,
    base: PDFFont,
    size: number,
    color: RGB,
  ) => {
    let dx = 0
    for (const r of runsByFont(text, base)) {
      p.drawText(r.text, { x: x + dx, y: y0, size, font: r.font, color })
      dx += r.font.widthOfTextAtSize(r.text, size)
    }
    return dx
  }
  const drawMixed = (
    text: string,
    x: number,
    y0: number,
    base: PDFFont,
    size: number,
    color: RGB,
  ) => drawMixedOn(page, text, x, y0, base, size, color)

  interface Seg {
    text: string
    bold?: boolean
    italic?: boolean
    color?: RGB
  }

  const TOP = A4[1] - M
  let page = pdf.addPage(A4)
  let y = TOP
  const fontOf = (s: Seg) => (s.italic ? ital : s.bold ? bold : reg)
  const space = (h: number) => {
    if (y - h < M) {
      page = pdf.addPage(A4)
      y = TOP
    } else y -= h
  }
  const newline = (h: number) => {
    if (y - h < M) {
      page = pdf.addPage(A4)
      y = TOP
    }
    y -= h
  }

  const layout = (segments: readonly Seg[], size: number, w: number) => {
    const words: { word: string; seg: Seg }[] = []
    // Mesure ET tracé passent par le même filtre : une largeur calculée sur un texte différent de
    // celui tracé désaligne tout.
    for (const seg of segments)
      for (const word of pdfSafe(seg.text).split(BREAKABLE).filter(Boolean)) {
        words.push({ word, seg })
      }
    const lines: (typeof words)[] = []
    let cur: typeof words = []
    let curW = 0
    for (const t of words) {
      const f = fontOf(t.seg)
      const ww = widthOf(t.word, f, size)
      const sw = f.widthOfTextAtSize(' ', size)
      const add = cur.length ? sw + ww : ww
      if (cur.length && curW + add > w) {
        lines.push(cur)
        cur = []
        curW = ww
      } else curW += add
      cur.push(t)
    }
    if (cur.length) lines.push(cur)
    return lines.map((line) => {
      const groups: { seg: Seg; text: string }[] = []
      for (const t of line) {
        const last = groups[groups.length - 1]
        if (last && last.seg === t.seg) last.text += ` ${t.word}`
        else groups.push({ seg: t.seg, text: t.word })
      }
      return groups
    })
  }

  type Line = ReturnType<typeof layout>[number]

  const drawLine = (line: Line, x0: number, y0: number, size: number) => {
    let x = x0
    line.forEach((g, i) => {
      x += drawMixed(g.text, x, y0, fontOf(g.seg), size, g.seg.color ?? black)
      if (i < line.length - 1) x += reg.widthOfTextAtSize(' ', size)
    })
    return x - x0
  }

  const draw = (
    segments: readonly Seg[],
    {
      size = PT,
      lead = 14,
      indent = 0,
      centre = false,
      right = false,
      underline = false,
    }: {
      size?: number
      lead?: number
      indent?: number
      centre?: boolean
      right?: boolean
      underline?: boolean
    } = {},
  ) => {
    const w = W - indent
    for (const line of layout(segments, size, w)) {
      newline(lead)
      const total =
        line.reduce((s, g) => s + widthOf(g.text, fontOf(g.seg), size), 0) +
        (line.length - 1) * reg.widthOfTextAtSize(' ', size)
      const x0 =
        M + indent + (centre ? Math.max(0, (w - total) / 2) : right ? Math.max(0, w - total) : 0)
      drawLine(line, x0, y, size)
      if (underline) {
        page.drawLine({
          start: { x: x0, y: y - 1.8 },
          end: { x: x0 + total, y: y - 1.8 },
          thickness: 0.6,
          color: line[0]?.seg.color ?? black,
        })
      }
    }
  }

  const drawLead = (b: Extract<Block, { t: 'lead' }>) => {
    newline(13)
    const x0 = M + 17
    const lbl = `•  ${b.label}`
    // Le « µ » d'une unité (µg/mL) est tracé par Symbol : la largeur doit venir du même découpage.
    const numW = widthOf(b.num, reg, PT)
    drawMixed(lbl, x0, y, reg, PT, black)
    drawMixed(b.num, PDF_LEADER_AT - numW, y, reg, PT, black)
    if (b.unit) drawMixed(b.unit, PDF_UNIT_AT, y, reg, PT, black)
    const from = x0 + widthOf(`${lbl} `, reg, PT)
    const to = PDF_LEADER_AT - numW - reg.widthOfTextAtSize(' ', PT)
    const dw = reg.widthOfTextAtSize('.', PT)
    if (to > from) {
      page.drawText('.'.repeat(Math.floor((to - from) / dw)), {
        x: from,
        y,
        size: PT,
        font: reg,
        color: grey,
      })
    }
    space(2)
  }

  const drawQuote = (b: Extract<Block, { t: 'quote' }>) => {
    const size = SMALL_PT
    const inner = W - 40
    const all = b.lines.map((l, i) =>
      layout(
        runs(l).map((r) => ({ ...r, bold: r.bold || i === 0 })),
        size,
        inner,
      ),
    )
    const h = all.reduce((s, ls) => s + ls.length * 13, 0) + 22 + (all.length - 1) * 5
    if (y - h < M) {
      page = pdf.addPage(A4)
      y = TOP
    }
    page.drawRectangle({ x: M, y: y - h, width: W, height: h, color: band })
    page.drawRectangle({ x: M, y: y - h, width: 2.6, height: h, color: blue })
    y -= 11
    all.forEach((ls, i) => {
      for (const line of ls) {
        y -= 13
        drawLine(line, M + 20, y, size)
      }
      if (i < all.length - 1) y -= 5
    })
    y -= 11
    space(10)
  }

  const drawTable = (b: Extract<Block, { t: 'table' }>) => {
    const size = SMALL_PT
    const [head, ...rows] = b.rows
    // Un tableau sans ligne d'en-tête n'existe pas dans nos gabarits, mais un markdown malformé
    // en produirait un : ne rien tracer vaut mieux que lever au milieu d'un livrable payé.
    if (!head) return
    const weight = head.map((_, c) => Math.max(...b.rows.map((r) => (r[c] ?? '').length)))
    const totalW = weight.reduce((a, x) => a + x, 0)
    const cols = weight.map((x) => Math.max(52, (x / totalW) * W))
    const scale = W / cols.reduce((a, x) => a + x, 0)
    const widths = cols.map((c) => c * scale)

    const renderRow = (cells: readonly string[], isHead: boolean) => {
      const lines = cells.map((c, i) => {
        const segs = runs(c)
        const dot = dotOf(c)
        return layout(
          // Rond plein, comme dans le DOCX : ZapfDingbats le trace, plus besoin de le dégrader.
          [
            ...(dot ? [{ text: '●', color: hex(dot) }] : []),
            ...segs.map((r) => ({ ...r, bold: r.bold || isHead })),
          ],
          size,
          (widths[i] ?? W) - 10,
        )
      })
      const h = Math.max(...lines.map((l) => l.length)) * 12 + 8
      if (y - h < M) {
        page = pdf.addPage(A4)
        y = TOP
      }
      if (isHead) page.drawRectangle({ x: M, y: y - h, width: W, height: h, color: band })
      let x = M
      lines.forEach((ls, i) => {
        let yy = y - 4
        for (const line of ls) {
          yy -= 10
          drawLine(line, x + 5, yy, size)
        }
        x += widths[i] ?? 0
      })
      page.drawLine({
        start: { x: M, y: y - h },
        end: { x: M + W, y: y - h },
        thickness: 0.5,
        color: rule,
      })
      y -= h
    }
    page.drawLine({ start: { x: M, y }, end: { x: M + W, y }, thickness: 0.5, color: rule })
    renderRow(head, true)
    rows.forEach((r) => renderRow(r, false))
    space(14)
  }

  for (const b of blocks) {
    if (b.t === 'title') {
      space(6)
      draw([{ text: b.text, bold: true, color: blue }], { size: TITLE_PT, lead: 16, centre: true })
      space(12)
    } else if (b.t === 'h1' || b.t === 'h2') {
      space(b.t === 'h1' ? 12 : 8)
      draw([{ text: b.text, bold: true, color: blue }], { lead: 14 })
      space(3)
    } else if (b.t === 'sub') {
      space(7)
      draw([{ text: b.text, bold: true }], { lead: 14, underline: true })
      space(2)
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
      // Par `drawMixed` comme tout le reste : la puce est codable en WinAnsi, mais l'invariant
      // « aucun tracé direct » ne vaut que s'il ne souffre pas d'exception qu'on doit re-vérifier.
      drawMixed('•', M + 12, yb, reg, PT, dot ? hex(dot) : black)
      space(3)
    } else if (isMissing(b.text)) {
      draw([{ text: b.text, color: grey }], { size: SMALL_PT, lead: 12 })
      space(b.hard ? 0 : 6)
    } else {
      draw(runs(b.text), { lead: 14 })
      space(b.hard ? 0 : 6)
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
  function drawSignature(p: PDFPage) {
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
    p.drawLine({
      start: { x: bx, y: y0 - 1.5 },
      end: { x: bx + bw, y: y0 - 1.5 },
      thickness: 0.5,
      color: blue,
    })
    const link = p.doc.context.register(
      p.doc.context.obj({
        Type: 'Annot',
        Subtype: 'Link',
        Rect: [bx, y0 - 3, bx + bw, y0 + size],
        Border: [0, 0, 0],
        // ⚠️ `PDFString.of` est OBLIGATOIRE : une chaîne JS brute serait encodée comme un NOM PDF
        // (`/https://pharnos.com`), ce qui est illégal pour un URI. Le lien serait mort et les
        // lecteurs signaleraient « Illegal URI-type link ».
        A: { Type: 'Action', S: 'URI', URI: PDFString.of('https://pharnos.com') },
      }),
    )
    p.node.addAnnot(link)
  }

  return { bytes: await pdf.save(), dropped: [...dropped] }
}
