/**
 * Lecture du markdown d'un livrable d'upgrade — la couche commune au DOCX et au PDF.
 *
 * Pourquoi les deux rendus partagent CE découpage et pas seulement des constantes : ils doivent
 * produire la même chose. Un titre reconnu par l'un et pas par l'autre livrerait un Word et un PDF
 * qui ne se ressemblent pas, sur une pièce qui part à l'agence. Le seul moyen de le garantir est
 * qu'aucun des deux ne relise le markdown.
 *
 * Module PUR — aucune API Node ni DOM, aucun accès disque : il tourne à l'identique dans le
 * navigateur (livraison sur `/u/{token}`) et sous Node (banc d'essai U0).
 */

/** Le gabarit du document déposé, ou la revue réglementaire qui l'accompagne. */
export type Profile = 'document' | 'report'

export interface TitleBlock {
  t: 'title'
  text: string
}
/**
 * ⚠️ Deux interfaces distinctes plutôt qu'une seule à `t: 'h1' | 'h2'`. TypeScript ne sait retirer
 * un membre d'une union discriminée que si son discriminant est un littéral : avec le type réuni,
 * `else if (b.t === 'h1' || b.t === 'h2')` ne l'écartait PAS de la branche suivante, et l'accès à
 * `b.text` y passait sur des blocs qui n'en ont pas.
 */
export interface H1Block {
  t: 'h1'
  text: string
}
export interface H2Block {
  t: 'h2'
  text: string
}
export type HeadingBlock = H1Block | H2Block
export interface SubBlock {
  t: 'sub'
  text: string
}
export interface BulletBlock {
  t: 'bullet'
  text: string
}
/** Ligne à conduit de points : « Substance active .......... 500 mg ». */
export interface LeadBlock {
  t: 'lead'
  label: string
  num: string
  unit: string
}
export interface QuoteBlock {
  t: 'quote'
  lines: string[]
}
export interface TableBlock {
  t: 'table'
  rows: string[][]
}
export interface BodyBlock {
  t: 'body'
  text: string
  /** Saut DUR (« \ » final) : porte du sens dans un bloc d'adresse, ne se replie pas. */
  hard: boolean
}

export type Block =
  | TitleBlock
  | H1Block
  | H2Block
  | SubBlock
  | BulletBlock
  | LeadBlock
  | QuoteBlock
  | TableBlock
  | BodyBlock

/** Pastilles de criticité — le PDF ne sait pas dessiner d'émoji avec les polices standard. */
export const DOTS: Readonly<Record<string, string>> = {
  '🔴': 'C00000',
  '🟠': 'E36C0A',
  '🟡': 'BF9000',
}

/**
 * Libellé de criticité, dans la langue de la revue.
 *
 * ⚠️ La pastille de couleur ne suffit PAS sur un document réglementaire : imprimée en noir et
 * blanc, rastérisée, ou lue par un extracteur de texte, la couleur disparaît et la colonne
 * « Criticité » semble vide — constaté sur le livrable réel de la recette du 2026-08-10. Le mot
 * accompagne la pastille, il ne la remplace pas.
 */
export const DOT_LABELS: Readonly<Record<string, { fr: string; en: string }>> = {
  '🔴': { fr: 'Critique', en: 'Critical' },
  '🟠': { fr: 'Majeure', en: 'Major' },
  '🟡': { fr: 'Mineure', en: 'Minor' },
}

/** Libellé de criticité si le texte commence par un émoji du barème, sinon `null`. */
export function dotLabelOf(t: string, lang: 'fr' | 'en'): string | null {
  const first = [...t.trim()][0]
  const label = first !== undefined ? DOT_LABELS[first] : undefined
  return label ? label[lang] : null
}

/**
 * Découpe le markdown en blocs.
 *
 * Le profil `document` ignore tout ce qui précède le premier `## ` : le markdown de travail porte
 * un préambule (titre de fichier, notes) qui n'appartient pas à la pièce déposée.
 */
export function parse(md: string, profile: Profile): Block[] {
  const doc = profile === 'document'
  const out: Block[] = []
  let started = !doc
  let blank = true
  const lines = md.split(/\r?\n/)

  for (let i = 0; i < lines.length; i++) {
    const line = (lines[i] ?? '').trimEnd()
    if (!line.trim()) {
      blank = true
      continue
    }
    const push = (b: Block) => {
      out.push(b)
      blank = true
    }

    // Titre du document
    if (doc && line.startsWith('## ') && !line.startsWith('###')) {
      started = true
      push({ t: 'title', text: line.slice(3).trim() })
      continue
    }
    if (!doc && line.startsWith('# ')) {
      push({ t: 'title', text: line.slice(2).trim() })
      continue
    }
    if (!started) continue // préambule markdown du profil 'document' : hors livrable

    if (doc && line.startsWith('#### ')) {
      push({ t: 'h2', text: line.slice(5).trim() })
      continue
    }
    if (doc && line.startsWith('### ')) {
      push({ t: 'h1', text: line.slice(4).trim() })
      continue
    }
    if (!doc && line.startsWith('### ')) {
      push({ t: 'h2', text: line.slice(4).trim() })
      continue
    }
    if (!doc && line.startsWith('## ')) {
      push({ t: 'h1', text: line.slice(3).trim() })
      continue
    }
    if (line.startsWith('---')) {
      blank = true
      continue
    }

    // Encadré d'avertissement (profil rapport)
    if (line.startsWith('>')) {
      // Les lignes de l'encadré sont repliées à ~100 colonnes comme le reste du markdown : on
      // recolle, et seule une ligne « > » VIDE sépare deux paragraphes. Sans cela, chaque repli
      // devenait un paragraphe et l'interligne s'écartait.
      const body: (string | null)[] = []
      for (let q = lines[i]; q !== undefined && q.trimStart().startsWith('>'); q = lines[++i]) {
        const t = q
          .trim()
          .replace(/^>\s?/, '')
          .replace(/^#+\s*/, '')
          .trim()
        const last = body[body.length - 1]
        if (!t) body.push(null)
        else if (body.length && last !== null && last !== undefined) {
          body[body.length - 1] = `${last} ${t}`
        } else body.push(t)
      }
      i--
      push({ t: 'quote', lines: body.filter((x): x is string => x !== null) })
      continue
    }

    // Tableau
    if (line.startsWith('|')) {
      const rows: string[][] = []
      for (let row = lines[i]; row !== undefined && row.trim().startsWith('|'); row = lines[++i]) {
        const cells = row
          .trim()
          .replace(/^\||\|$/g, '')
          .split('|')
          .map((c) => c.trim())
        if (!cells.every((c) => /^:?-{2,}:?$/.test(c))) rows.push(cells)
      }
      i--
      push({ t: 'table', rows })
      continue
    }

    if (line.startsWith('- ')) {
      const item = line.slice(2).trim()
      const m = doc ? item.match(/^(.*?)\s*\.{3,}\s*(.+)$/) : null
      if (m?.[1] !== undefined && m[2] !== undefined) {
        const value = m[2]
        // Le `\s` de JavaScript couvre DÉJÀ l'espace insécable U+00A0 et sa variante étroite
        // U+202F, celle qu'emploie la typographie française. Écrire le caractère dans la classe
        // serait donc redondant, et surtout piégeux : littéral il est invisible en relecture et ne
        // survit pas à un outil qui ré-encode le fichier. « 500 000 UI » se découpe bien sans lui.
        const v = value.match(/^([\d\s.,]+)\s*(.*)$/)
        push({
          t: 'lead',
          label: m[1].trim(),
          num: (v?.[1] ?? value).trim(),
          unit: (v?.[2] ?? '').trim(),
        })
      } else push({ t: 'bullet', text: item })
      continue
    }
    if (/^\*\*[^*]+\*\*$/.test(line)) {
      push({ t: 'sub', text: line.slice(2, -2) })
      continue
    }

    // Corps. Lignes consécutives = un paragraphe replié à ~100 colonnes ; sauf saut DUR (« \ »
    // final), qui porte du sens dans un bloc d'adresse (NOM / ADRESSE / contacts).
    const hard = line.endsWith('\\')
    const text = (hard ? line.slice(0, -1) : line).trim()
    const prev = out[out.length - 1]
    if (!blank && prev?.t === 'body' && !prev.hard) prev.text += ` ${text}`
    else out.push({ t: 'body', text, hard: false })
    ;(out[out.length - 1] as BodyBlock).hard = hard
    blank = false
  }
  return out
}

export interface Run {
  text: string
  bold?: boolean
  italic?: boolean
}

/** Découpe en runs {text, bold, italic} ; retire les accents graves de code et les émoji. */
export function runs(text: string): Run[] {
  // ⚠️ Le drapeau `u` n'est pas cosmétique. Sans lui, une classe de caractères raisonne en unités
  // UTF-16 : `[🔴🟠🟡]` devient l'ensemble {D83D, DD34, DFE0, DFE1} et retire le demi-surrogate
  // D83D de TOUT émoji du même plan. Les trois pastilles y survivaient par chance (leurs deux
  // moitiés étaient dans l'ensemble), mais un 🔵 ou un 🟢 ajouté au barème aurait laissé un
  // demi-caractère orphelin dans un livrable — invisible en relecture, illisible chez le client.
  const clean = text
    .replace(/`/g, '')
    .replace(/⚠️?/gu, '')
    .replace(/[🔴🟠🟡]/gu, '')
    .trim()
  return clean
    .split(/(\*\*[^*]+\*\*|\*[^*]+\*)/)
    .filter(Boolean)
    .map((seg) => {
      if (seg.startsWith('**') && seg.endsWith('**')) return { text: seg.slice(2, -2), bold: true }
      if (seg.startsWith('*') && seg.endsWith('*')) return { text: seg.slice(1, -1), italic: true }
      return { text: seg }
    })
}

/** Couleur de pastille si le texte commence par un émoji de criticité. */
export function dotOf(t: string): string | null {
  const first = [...t.trim()][0]
  return (first !== undefined ? DOTS[first] : undefined) ?? null
}

/**
 * Le marqueur d'absence, dans les deux langues. Il se rend en gris et en petit — jamais masqué :
 * « rien ne passe sous silence » (étape 1 §2).
 */
export function isMissing(s: string): boolean {
  return /^\[(Non fourni, à compléter|Not provided, to be completed)\]\.?$/.test(s.trim())
}

/**
 * Nom du produit, lu dans la rubrique 1 — il sert d'en-tête courant. Un en-tête inventé sur une
 * pièce déposée serait une donnée fausse dans un dossier d'AMM.
 */
export function productName(blocks: readonly Block[]): string {
  const i = blocks.findIndex((b) => b.t === 'h1' && /^1\./.test(b.text))
  const first = blocks.slice(i + 1).find((b): b is BodyBlock => b.t === 'body')
  return (first?.text ?? '').split(/[,.]/)[0]?.trim() ?? ''
}
