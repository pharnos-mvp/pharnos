/**
 * Lecture de la couche texte d'un PDF, page par page — première moitié du protocole à deux canaux.
 *
 * Ce module ne DÉCIDE rien : il compte et il rend. La décision « scan ou texte » vit dans
 * `scan-text.ts`, pure et testée, parce qu'elle déclenche (ou non) plusieurs mégaoctets de
 * téléchargement et une minute de calcul.
 *
 * ⚠️ Passer par `loadPdfjs` et `PDF_DOC_ASSETS` est obligatoire, et c'est encore plus vrai ici que
 * pour l'affichage : sans `wasmUrl`, pdf.js abandonne SILENCIEUSEMENT les couches JBIG2 d'un scan
 * MRC et la page paraît vide. On classerait alors comme « scan » un document parfaitement textuel —
 * ou l'inverse — sur une erreur de configuration, sans aucun message.
 */
import { loadPdfjs, PDF_DOC_ASSETS } from '@/lib/pdfjs'

import { isTextlessPage, pageAreaCm2 } from './scan-text'

/**
 * Pages au-delà desquelles on cesse de lire.
 *
 * ⚠️ Ce n'est pas une valeur de confort : c'est la borne que le corpus de contrôle impose. Mesuré sur
 * un scan réel, une page océrisée pèse ~2 600 caractères ; à `MAX_CONTROL_CHARS` (60 000), le budget
 * est épuisé vers la vingt-cinquième page. Lire au-delà dépenserait quatre secondes de
 * reconnaissance par page pour un corpus que l'Edge refuserait en `413`. La borne est DITE, jamais
 * silencieuse — `truncated` la remonte.
 */
export const MAX_READ_PAGES = 40

/**
 * Plafond du corpus de contrôle accepté par l'Edge `upgrade` (`MAX_TEXT_CHARS`). Au-delà, le mode
 * rubrique répond `413 control_truncated` : la pièce partirait entière au modèle tandis que le
 * corpus serait coupé, et toute rubrique citée en fin de document ressortirait « Non fourni ».
 * Le savoir ICI évite de dépenser une minute de reconnaissance pour un refus.
 */
export const MAX_CONTROL_CHARS = 60_000

export interface PdfPagesResult {
  /** Texte de chaque page, dans l'ordre — ornements NON retirés (voir `buildControlCorpus`). */
  pages: string[]
  /** Indices (0-based) des pages SANS couche texte exploitable — celles à océriser, et elles seules. */
  textless: number[]
  /** Nombre de pages du document, même si la lecture s'est arrêtée avant. */
  pageCount: number
  /** `true` quand la lecture a été écourtée (pages ou budget) — à dire, jamais à taire. */
  truncated: boolean
}

export interface ReadOptions {
  signal?: AbortSignal
  /** Progression 0→1 sur les pages lues — la lecture d'un gros PDF n'est pas instantanée. */
  onProgress?: (ratio: number) => void
}

/**
 * Lit la couche texte et classe le document. Ne lève pas sur un PDF sans texte : l'absence de texte
 * est un RÉSULTAT (`kind: 'ocr'`), pas une panne.
 */
export async function readPdfPages(
  data: ArrayBuffer | Uint8Array,
  { signal, onProgress }: ReadOptions = {},
): Promise<PdfPagesResult> {
  const pdfjs = await loadPdfjs()
  // `data` est consommé (transféré) par pdf.js : on lui passe une copie, sinon l'appelant se
  // retrouve avec un buffer détaché et la reconnaissance qui suit ne peut plus rien en faire.
  const bytes = data instanceof Uint8Array ? new Uint8Array(data) : new Uint8Array(data.slice(0))
  // ⚠️ La tâche est créée DANS le `try` : `destroy()` vit sur elle, et un PDF chiffré ou corrompu
  // fait rejeter `task.promise`. Hors du `try`, le worker pdf.js et la copie complète du fichier
  // survivraient à chaque tentative — trois essais sur un scan de 30 Mo, et le poste que ce module
  // dit vouloir ménager est à genoux.
  let task: ReturnType<typeof pdfjs.getDocument> | undefined
  try {
    task = pdfjs.getDocument({ data: bytes, ...PDF_DOC_ASSETS })
    const doc = await task.promise
    const pageCount = doc.numPages
    const limit = Math.min(pageCount, MAX_READ_PAGES)
    const pages: string[] = []
    const textless: number[] = []
    let chars = 0
    for (let n = 1; n <= limit; n++) {
      signal?.throwIfAborted()
      const page = await doc.getPage(n)
      try {
        const text = pageText(await page.getTextContent())
        pages.push(text)
        // La DENSITÉ, donc l'aire de la page : ces notices vont de 180 × 350 mm à 400 × 500 mm, et
        // un seuil en nombre absolu serait faux pour la moitié d'entre elles.
        const { width, height } = page.getViewport({ scale: 1 })
        if (isTextlessPage(text.trim().length, pageAreaCm2(width, height))) textless.push(n - 1)
        chars += text.length
      } finally {
        // Sans ce nettoyage, un document de cent pages garde cent pages d'objets en mémoire — et le
        // navigateur d'un poste modeste rend la main au milieu de la reconnaissance.
        page.cleanup()
      }
      onProgress?.(n / limit)
      // Le budget de corpus vaut pour le chemin TEXTUEL autant que pour l'OCR : un RCP textuel de
      // trente pages dépasse `MAX_CONTROL_CHARS` et se ferait refuser en 413 par l'Edge.
      if (chars >= MAX_CONTROL_CHARS) {
        return { pages, textless, pageCount, truncated: pages.length < pageCount }
      }
    }
    return { pages, textless, pageCount, truncated: pageCount > limit }
  } finally {
    await task?.destroy()
  }
}

/**
 * Recompose le texte d'une page depuis les fragments pdf.js.
 *
 * Deux séparations, et l'absence de l'une comme de l'autre fabrique des mots inexistants dans le
 * corpus de contrôle — donc des citations introuvables, donc des rubriques « Non fourni » sur un
 * document juste. Le chemin TEXTUEL n'a aucune tolérance : côté moteur, une source `text` n'est
 * comparée que littéralement, et c'est le chemin de deux dossiers sur trois.
 *
 *  - `hasEOL` porte la fin de ligne réelle du document ;
 *  - un ÉCART HORIZONTAL entre deux fragments d'une même ligne vaut espace. pdf.js scinde à chaque
 *    changement de graisse ou de police — « 4.2 » puis « Posologie » arrivent en deux fragments —
 *    mais il scinde AUSSI au milieu d'un mot (« Wa » + « rfarine »). Insérer systématiquement
 *    couperait des mots, ne jamais insérer en souderait d'autres : l'écart tranche.
 */
function pageText(content: { items: unknown[] }): string {
  let out = ''
  let prevEnd: number | null = null
  for (const raw of content.items) {
    const item = raw as { str?: unknown; hasEOL?: unknown; width?: unknown; transform?: unknown }
    if (typeof item.str !== 'string') continue
    const x = Array.isArray(item.transform) ? Number(item.transform[4]) : NaN
    const width = typeof item.width === 'number' ? item.width : 0
    const needsGap =
      prevEnd !== null &&
      Number.isFinite(x) &&
      x - prevEnd > MIN_GAP_PT &&
      out.length > 0 &&
      !/\s$/.test(out) &&
      item.str.length > 0 &&
      !/^\s/.test(item.str)
    if (needsGap) out += ' '
    out += item.str
    prevEnd = Number.isFinite(x) ? x + width : null
    if (item.hasEOL === true) {
      out += '\n'
      prevEnd = null
    }
  }
  return out
}

/**
 * Écart horizontal, en points PostScript, au-delà duquel deux fragments sont des mots distincts.
 * Une espace fait ~2,5 pt en corps 10 ; un mot scindé par pdf.js a un écart nul. Le seuil se place
 * entre les deux, près de zéro : une espace en trop est absorbée par la normalisation du moteur,
 * une espace MANQUANTE est fatale.
 */
const MIN_GAP_PT = 1
