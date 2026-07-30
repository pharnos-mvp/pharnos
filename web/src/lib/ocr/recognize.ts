/**
 * Reconnaissance de caractères CÔTÉ NAVIGATEUR — seconde moitié du protocole à deux canaux.
 *
 * ⚠️ **Ce module ne sert pas à lire le document.** Opus 5 est multimodal : il lit l'image de la page,
 * nativement et mieux que Tesseract, et c'est de LUI que vient le contenu du livrable. Cette
 * reconnaissance produit un **corpus de contrôle indépendant**, et son indépendance est tout ce qui
 * compte : un contrôle produit par ce qu'il contrôle n'est pas un contrôle. Si le texte de référence
 * venait du modèle, sa citation serait comparée à sa propre lecture et toute invention cohérente avec
 * elle-même passerait. Ne JAMAIS remplacer ce module par un appel au modèle.
 *
 * Trois contraintes qui décident de sa forme :
 *
 *  1. **Chargement DIFFÉRÉ et conditionnel.** ~10 Mo mesurés (6,4 Mo de noyau — la colle `.wasm.js`
 *     puis le `.wasm` — et 3,5 Mo de modèles fra+eng) ne doivent atteindre que les utilisateurs qui
 *     déposent un scan : le marché est l'UEMOA, où la bande passante se paie. Import dynamique via
 *     `loadChunk`, et seulement après `classifyPdfPages`. Vérifié : un PDF textuel ne demande AUCUN
 *     asset `/ocr/` (11 pages lues en 1,4 s).
 *  2. **MÊME ORIGINE, sans exception.** La CSP de `app.pharnos.com` est `script-src 'self'` et
 *     `connect-src` limité : le CDN par défaut de tesseract.js serait bloqué. Et il ne s'agit pas
 *     que de CSP — faire télécharger les modèles depuis un tiers révélerait à ce tiers qu'un dossier
 *     est en cours de traitement. Les assets sont servis sous `/ocr/`.
 *  3. **Modèles `best_int` + noyau LSTM.** 3,5 Mo au lieu de 16,4 Mo pour les modèles standard, et
 *     une exactitude SUPÉRIEURE : les modèles standard embarquent en plus l'ancien moteur, que nous
 *     n'utilisons pas. Le noyau doit correspondre (`-lstm`), sinon l'OEM demandé n'existe pas.
 *
 * Mesuré sur un scan réel (guide de pharmacovigilance sénégalais, pages sans aucune police) :
 * **~3,8 s par page** à 200 dpi, ~2 600 caractères de corpus par page.
 */
import type { PDFPageProxy } from 'pdfjs-dist'

import { loadChunk } from '@/lib/lazy-chunk'
import { loadPdfjs, PDF_DOC_ASSETS } from '@/lib/pdfjs'

import { readingOrder, type LineBox } from './columns'
import { MAX_CONTROL_CHARS, MAX_READ_PAGES } from './pdf-text'

/** Racine des assets servis en même origine — voir le greffon `pharnos:ocr-assets` de Vite. */
const OCR_BASE = `${import.meta.env.BASE_URL}ocr`

/**
 * Résolution de rendu, en points par pouce. En dessous de 200, Tesseract perd les petits corps d'un
 * RCP (notes de bas de tableau, mentions en 7 points) ; au-dessus, le temps de reconnaissance croît
 * en carré sans gain mesurable. 200 dpi est la recommandation de Tesseract pour du texte imprimé.
 */
const RENDER_DPI = 200

/** pdf.js exprime les dimensions en points PostScript : 72 par pouce. */
const PDF_POINTS_PER_INCH = 72

/**
 * Langues reconnues. Les deux, toujours : la langue d'un scan n'est pas connue AVANT de le lire —
 * c'est le propre d'un scan — et un dossier UEMOA anglophone est un cas courant (Bénin, Nigéria
 * voisin). Charger la mauvaise langue dégraderait le corpus de contrôle là où il compte.
 */
const LANGS = 'fra+eng'

/** LSTM seul — cohérent avec le noyau `-lstm` et les modèles `best_int`. */
const OEM_LSTM_ONLY = 1

/**
 * Segmentation de page AUTOMATIQUE (`PSM.AUTO`) — le réglage le plus important de ce module, et
 * celui que le défaut de tesseract.js ne donne PAS.
 *
 * ⚠️ Constaté en direct sur une notice client réelle (KV-Kacin 500, dépliant bilingue FR/EN à deux
 * colonnes) : sans ce réglage, Tesseract traite la page comme un BLOC UNIQUE et balaie les lignes en
 * traversant les colonnes. Le corpus de contrôle ressortait avec l'anglais et le français soudés sur
 * la même ligne — 66 lignes pleine largeur au lieu de 141 lignes en colonnes — et une phrase
 * française coupée par quatre-vingt-dix caractères d'anglais.
 *
 * Le modèle, lui, lit l'image correctement et cite un passage français CONTIGU. Cette citation
 * n'existait alors nulle part dans le corpus : verdict `not_found`, rejeu, puis rubrique rétrogradée
 * en « Non fourni » sur un document parfaitement correct. Les notices bilingues à deux colonnes sont
 * la norme en UEMOA : ce n'était pas un cas limite.
 *
 * ⚠️ `AUTO` (3) et non `AUTO_OSD` (1) : la détection d'orientation exige `osd.traineddata`, que nous
 * ne servons pas. La demander ferait échouer l'initialisation pour un gain nul sur des pages droites.
 */
const PSM_AUTO = '3'

export interface RecognizeOptions {
  signal?: AbortSignal
  /** Progression 0→1 sur les pages reconnues. Une minute d'attente muette passe pour une panne. */
  onProgress?: (ratio: number, page: number, total: number) => void
  /**
   * Indices (0-based) des pages à océriser. Absent = toutes.
   *
   * ⚠️ C'est ce qui rend la fusion PAR PAGE possible : sur un document mixte, on ne reconstruit
   * que les pages SANS couche texte et on garde le texte exact des autres. Océriser une page qui a
   * déjà son texte remplacerait une source fidèle par une reconstruction — un recul, pas un service.
   */
  pages?: readonly number[]
}

export interface RecognizeResult {
  /** Texte reconstruit, indexé par le NUMÉRO DE PAGE d'origine (0-based). */
  pages: Map<number, string>
  /** Pages effectivement reconnues — bornées par `MAX_READ_PAGES` et par le budget de corpus. */
  recognized: number
  pageCount: number
  /**
   * `true` quand la reconnaissance s'est arrêtée avant la fin du document — pages restantes ou
   * budget de corpus épuisé. À DIRE au client : un corpus de contrôle amputé fait ressortir
   * « Non fourni » les rubriques citées dans les pages non lues, et il aurait l'air d'un défaut du
   * moteur alors que c'est une limite déclarée.
   */
  truncated: boolean
}

/**
 * Océrise un PDF page par page. Rend le texte par page ; l'assemblage et le retrait des ornements
 * appartiennent à `buildControlCorpus`.
 *
 * ⚠️ Séquentiel, délibérément. Chaque page mobilise le noyau WASM et plusieurs mégaoctets de canvas :
 * paralléliser sur un poste modeste fait rendre la main au navigateur au milieu du travail — un
 * échec bien plus coûteux que l'attente qu'il prétend éviter.
 */
export async function recognizePdf(
  data: ArrayBuffer | Uint8Array,
  { signal, onProgress, pages: only }: RecognizeOptions = {},
): Promise<RecognizeResult> {
  const pdfjs = await loadPdfjs()
  const bytes = data instanceof Uint8Array ? new Uint8Array(data) : new Uint8Array(data.slice(0))
  // ⚠️ Tâche pdf.js ET worker Tesseract créés DANS le `try`. Hors de lui, un PDF chiffré ou un asset
  // absent laissait vivre le worker et une copie complète du fichier à chaque tentative.
  let task: ReturnType<typeof pdfjs.getDocument> | undefined
  let worker: OcrWorker | undefined
  try {
    task = pdfjs.getDocument({ data: bytes, ...PDF_DOC_ASSETS })
    const doc = await task.promise
    const pageCount = doc.numPages
    const asked = only ?? [...Array(pageCount).keys()]
    const wanted = asked.filter((i) => i >= 0 && i < pageCount).slice(0, MAX_READ_PAGES)
    if (wanted.length === 0) return { pages: new Map(), recognized: 0, pageCount, truncated: false }
    worker = await createOcrWorker()
    const out = new Map<number, string>()
    let chars = 0
    for (const [done, index] of wanted.entries()) {
      signal?.throwIfAborted()
      const page = await doc.getPage(index + 1)
      let canvas: OffscreenCanvas | undefined
      try {
        canvas = await renderPage(page)
        // `blocks` et non `text` : la géométrie des lignes est indispensable pour rétablir l'ordre
        // de lecture d'une page à colonnes — voir `columns.ts`.
        const { data: result } = await worker.recognize(
          await canvas.convertToBlob(),
          {},
          { text: false, blocks: true },
        )
        const text = readingOrder(linesOf(result)).join('\n')
        out.set(index, text)
        chars += text.length
      } finally {
        // Libérer AVANT la page suivante : à 200 dpi une A4 pèse ~9 Mo en mémoire, et laisser vingt
        // pages vivantes suffit à faire tomber un navigateur mobile.
        if (canvas) releaseCanvas(canvas)
        page.cleanup()
      }
      onProgress?.((done + 1) / wanted.length, done + 1, wanted.length)
      // Budget de corpus épuisé : continuer coûterait quatre secondes par page pour du texte que
      // l'Edge refuserait (`413 control_truncated`). On s'arrête, et on le DIT.
      if (chars >= MAX_CONTROL_CHARS) {
        return { pages: out, recognized: out.size, pageCount, truncated: out.size < wanted.length }
      }
    }
    return { pages: out, recognized: out.size, pageCount, truncated: wanted.length < asked.length }
  } finally {
    await worker?.terminate()
    await task?.destroy()
  }
}

/** Ce que nous utilisons de tesseract.js — surface volontairement minuscule. */
interface OcrWorker {
  recognize: (
    image: unknown,
    options?: unknown,
    output?: unknown,
  ) => Promise<{ data: { blocks?: unknown } }>
  setParameters: (params: Record<string, string>) => Promise<unknown>
  terminate: () => Promise<unknown>
}

/**
 * Extrait les lignes AVEC LEUR GÉOMÉTRIE, au lieu de prendre le texte tout fait.
 *
 * ⚠️ C'est ce qui permet de rétablir l'ordre de lecture d'une page à colonnes (`readingOrder`).
 * Le champ `text` de Tesseract est un balayage LIGNE PAR LIGNE qui traverse les colonnes : sur une
 * notice bilingue, il entrelace le français et l'anglais et coupe les phrases. Sans la géométrie,
 * rien ne permet de le démêler.
 */
function linesOf(data: { blocks?: unknown }): LineBox[] {
  const out: LineBox[] = []
  for (const block of asArray(data.blocks)) {
    for (const par of asArray((block as { paragraphs?: unknown }).paragraphs)) {
      for (const line of asArray((par as { lines?: unknown }).lines)) {
        const l = line as { text?: unknown; bbox?: { x0?: unknown; y0?: unknown; x1?: unknown } }
        const text = typeof l.text === 'string' ? l.text.replace(/\s+$/, '') : ''
        if (text.trim().length === 0) continue
        out.push({
          x0: Number(l.bbox?.x0 ?? 0),
          y0: Number(l.bbox?.y0 ?? 0),
          x1: Number(l.bbox?.x1 ?? 0),
          text,
        })
      }
    }
  }
  return out
}

const asArray = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])

/**
 * Crée le worker Tesseract avec des chemins EXPLICITES.
 *
 * Rien n'est laissé à la résolution automatique : les valeurs par défaut de tesseract.js pointent
 * vers un CDN, que la CSP bloquerait — et le message d'erreur d'un chargement bloqué ne dit pas
 * qu'il s'agissait d'un CDN. Poser les trois chemins ici rend la panne impossible plutôt que
 * diagnosticable.
 */
async function createOcrWorker(): Promise<OcrWorker> {
  const mod = await loadChunk<typeof import('tesseract.js')>(() =>
    import('tesseract.js').then((m) => ({ default: m })),
  )
  const start = mod.default.createWorker(LANGS, OEM_LSTM_ONLY, {
    workerPath: `${OCR_BASE}/worker.min.js`,
    corePath: `${OCR_BASE}/core`,
    langPath: `${OCR_BASE}/lang`,
    // Les modèles sont servis compressés (`.traineddata.gz`) : le dire évite un second aller-retour
    // pour la variante non compressée, qui n'existe pas côté serveur.
    gzip: true,
  })
  // ⚠️ Délai OBLIGATOIRE. La chaîne d'initialisation de tesseract.js se termine par un
  // `.catch(() => {})` : un modèle illisible — et `public/_redirects` sert `index.html` en 200 pour
  // toute URL absente, donc un asset manquant EST un modèle illisible — fait échouer l'init sans
  // jamais rejeter la promesse. Sans ce garde-fou, l'utilisateur reste sur « Reconnaissance… »
  // indéfiniment, sans erreur et sans recours.
  const worker = await withTimeout(start as unknown as Promise<OcrWorker>, WORKER_INIT_TIMEOUT_MS)
  await worker.setParameters({
    tessedit_pageseg_mode: PSM_AUTO,
    // Résolution DÉCLARÉE. Sans elle, Tesseract la devine — 143 dpi au lieu de 200 sur la notice
    // KV-Kacin — et cale ses seuils de segmentation sur une valeur fausse.
    user_defined_dpi: String(RENDER_DPI),
  })
  return worker
}

/**
 * Délai d'initialisation du moteur. Large : il couvre le téléchargement de ~7,5 Mo d'assets sur une
 * connexion lente, ce qui est le cas d'usage normal en UEMOA. Il ne sert qu'à transformer un gel
 * définitif en erreur affichable.
 */
const WORKER_INIT_TIMEOUT_MS = 180_000

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () =>
            reject(
              new Error(
                'Moteur de reconnaissance indisponible : ses composants n’ont pas pu être chargés.',
              ),
            ),
          ms,
        )
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

/**
 * Rend une page HORS ÉCRAN, à `RENDER_DPI`, dans la limite de `MAX_CANVAS_PIXELS`.
 *
 * `OffscreenCanvas` et non un canvas du DOM : le rendu ne dépend alors d'aucune composition, donc il
 * aboutit même quand l'onglet passe en arrière-plan — un utilisateur qui change d'onglet pendant une
 * reconnaissance de deux minutes ne doit pas la voir se figer.
 *
 * Typé avec le VRAI `PDFPageProxy` : pdf.js v6 exige `canvas` en plus de `canvasContext`, et un type
 * approximatif l'aurait laissé passer — le rendu échouerait à l'exécution.
 */
async function renderPage(page: PDFPageProxy): Promise<OffscreenCanvas> {
  const full = RENDER_DPI / PDF_POINTS_PER_INCH
  const base = page.getViewport({ scale: full })
  // ⚠️ Plafond de SURFACE. Au-delà, Safari et iOS rendent un canvas BLANC sans lever la moindre
  // erreur : la page ressortirait vide, la rubrique « Non fourni », et rien n'en dirait la cause.
  // Une page A0 ou un scan surdimensionné atteignent la limite à 200 dpi.
  const pixels = base.width * base.height
  const scale = pixels > MAX_CANVAS_PIXELS ? full * Math.sqrt(MAX_CANVAS_PIXELS / pixels) : full
  const viewport = page.getViewport({ scale })
  const canvas = new OffscreenCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height))
  const ctx = canvas.getContext('2d', { alpha: false })
  if (!ctx) throw new Error('Rendu impossible : contexte 2D indisponible.')
  // Fond BLANC explicite. Un canvas neuf est transparent, et Tesseract lit alors du noir sur noir :
  // le texte reconnu serait vide sans qu'aucune erreur ne le signale.
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  await page.render({
    canvasContext: ctx as unknown as CanvasRenderingContext2D,
    canvas: canvas as unknown as HTMLCanvasElement,
    viewport,
  }).promise
  return canvas
}

/** ~16 Mpx : au-delà, Safari/iOS rendent un canvas blanc SANS erreur (limite de surface). */
const MAX_CANVAS_PIXELS = 16_000_000

/** Rend la mémoire du canvas immédiatement, sans attendre le ramasse-miettes. */
function releaseCanvas(canvas: OffscreenCanvas): void {
  canvas.width = 0
  canvas.height = 0
}
