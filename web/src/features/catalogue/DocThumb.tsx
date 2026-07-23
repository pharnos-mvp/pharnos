import { useEffect, useRef, useState } from 'react'
import { FileText } from 'lucide-react'

import { useI18n } from '@/lib/i18n-context'
import { downloadDocumentBlob } from './documents-sync'
import { cacheDocumentBlob, getDocumentBlob } from './documents-repository'

/** Largeur cible de la vignette en px CSS (la carte l'affiche dans une boîte de 160 px de haut). */
const THUMB_WIDTH = 170
/** Densité max retenue : au-delà on paie de la mémoire canvas pour un gain invisible à cette taille. */
const MAX_DPR = 2

/**
 * File de rendu SÉRIELLE, partagée par toutes les vignettes de la page.
 *
 * L'IntersectionObserver ne diffère que les cartes hors écran : les ~25 visibles démarreraient
 * SIMULTANÉMENT (autant de parsings pdf.js, et autant de téléchargements Storage pouvant aller
 * jusqu'à 25 Mo chacun). Même parti-pris que `PdfViewer`, qui sérialise déjà ses rendus.
 */
let queue: Promise<void> = Promise.resolve()

interface PdfRenderTask {
  promise: Promise<void>
  cancel: () => void
}
interface PdfPage {
  getViewport: (o: { scale: number }) => { width: number; height: number }
  render: (p: {
    canvas: HTMLCanvasElement
    canvasContext: CanvasRenderingContext2D
    viewport: unknown
  }) => PdfRenderTask
}
interface PdfLoadingTask {
  promise: Promise<{ numPages: number; getPage: (n: number) => Promise<PdfPage> }>
  destroy: () => Promise<void>
}

export interface ThumbDoc {
  id: string
  filePath: string | null
  fileName: string
}

/**
 * Vignette d'une pièce (page 1) + nombre de pages, rendus **PARESSEUSEMENT**.
 *
 * Une page de type de pièce aligne facilement 20-30 documents : tout rendre au chargement figerait
 * l'écran. On n'ouvre donc le PDF que quand la carte APPROCHE du viewport, une seule fois, et via
 * la file sérielle ci-dessus. Le blob suit la règle offline-first du reste de l'app (Dexie d'abord,
 * sinon Storage puis épinglage local → la visite suivante marche hors-ligne).
 *
 * La tâche pdf.js est **détruite** dès la vignette peinte : `getDocument` sans port crée un worker
 * DÉDIÉ par document, qui survivrait au démontage (25 cartes = 25 workers pour la session).
 */
export function DocThumb({ doc, onPages }: { doc: ThumbDoc; onPages?: (n: number) => void }) {
  const { t } = useI18n()
  const hostRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  /** Clé de la tentative déjà lancée (`null` = aucune). Une tentative INTERROMPUE est remise à
   *  zéro par le nettoyage, sinon la vignette resterait vide à jamais. */
  const startedRef = useRef<string | null>(null)
  // Sans IntersectionObserver (jsdom / navigateur ancien) : « déjà proche » dès le départ — on rend
  // tout de suite plutôt que jamais. Test d'environnement pur, donc évaluable au premier rendu.
  const [near, setNear] = useState(() => typeof IntersectionObserver === 'undefined')
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'none'>('idle')

  // 1) Détection d'approche : on ne déclenche RIEN tant que la carte est loin.
  useEffect(() => {
    const el = hostRef.current
    if (!el || near) return
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setNear(true)
      },
      { rootMargin: '300px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [near])

  // 2) Rendu de la page 1, une seule fois par (pièce, chemin), en file sérielle.
  useEffect(() => {
    // La clé inclut `filePath` : une pièce créée hors-ligne l'obtient APRÈS son push. Sans ça, la
    // 1re tentative (sans blob ni chemin) verrouillerait la vignette même une fois le fichier tiré.
    const key = `${doc.id}|${doc.filePath ?? ''}`
    if (!near || startedRef.current === key) return
    startedRef.current = key
    let cancelled = false
    let completed = false
    let loading: PdfLoadingTask | undefined
    let rendering: PdfRenderTask | undefined

    queue = queue.then(async () => {
      if (cancelled) return
      setState('loading')
      try {
        let blob = (await getDocumentBlob(doc.id)) ?? null
        if (!blob && doc.filePath) {
          blob = await downloadDocumentBlob(doc.filePath)
          // Épingle en local : la prochaine visite (même hors-ligne) affiche la vignette.
          if (blob) void cacheDocumentBlob(doc.id, blob)
        }
        const isPdf = !!blob && (blob.type === 'application/pdf' || /\.pdf$/i.test(doc.fileName))
        if (cancelled || !blob || !isPdf) {
          if (!cancelled) {
            completed = true
            setState('none')
          }
          return
        }
        const pdfjs = await import('pdfjs-dist')
        const workerUrl = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
        pdfjs.GlobalWorkerOptions.workerSrc = workerUrl.default
        const data = new Uint8Array(await blob.arrayBuffer())
        loading = pdfjs.getDocument({ data }) as unknown as PdfLoadingTask
        const pdf = await loading.promise
        if (cancelled) return
        onPages?.(pdf.numPages)
        const page = await pdf.getPage(1)
        if (cancelled) return
        // Échelle DÉRIVÉE de la taille d'affichage : à échelle fixe, une A4 produisait un canvas
        // ~6× plus grand que sa boîte — de la mémoire pure perte, jamais libérée.
        const base = page.getViewport({ scale: 1 })
        const viewport = page.getViewport({ scale: THUMB_WIDTH / base.width })
        const canvas = canvasRef.current
        if (!canvas) return
        const ratio = Math.min(window.devicePixelRatio || 1, MAX_DPR)
        canvas.width = Math.floor(viewport.width * ratio)
        canvas.height = Math.floor(viewport.height * ratio)
        const ctx = canvas.getContext('2d')
        if (!ctx) return
        ctx.scale(ratio, ratio)
        rendering = page.render({ canvas, canvasContext: ctx, viewport })
        await rendering.promise
        if (!cancelled) {
          completed = true
          setState('done')
        }
      } catch {
        // Une pièce illisible (ou un rendu annulé au démontage) ne doit pas casser la grille.
        if (!cancelled) {
          completed = true
          setState('none')
        }
      } finally {
        rendering = undefined
        const task = loading
        loading = undefined
        // Libère le worker dédié dès la vignette peinte — la file étant sérielle, il n'en vit
        // jamais plus d'un à la fois.
        if (task) await task.destroy().catch(() => {})
      }
    })

    return () => {
      cancelled = true
      rendering?.cancel()
      void loading?.destroy().catch(() => {})
      // Tentative interrompue avant terme → on relibère la clé pour qu'un remontage réessaie
      // (StrictMode, ou `filePath` renseigné après le push d'une pièce créée hors-ligne).
      if (!completed) startedRef.current = null
    }
  }, [near, doc.id, doc.filePath, doc.fileName, onPages])

  return (
    <div
      ref={hostRef}
      className="bg-muted/30 flex h-40 items-center justify-center overflow-hidden rounded-lg border"
    >
      {/* Le canvas reste monté (la ref doit exister au moment du rendu) et se révèle une fois peint. */}
      <canvas ref={canvasRef} className={state === 'done' ? 'max-h-full w-auto' : 'hidden'} />
      {state !== 'done' ? (
        <span className="text-muted-foreground/60 flex flex-col items-center gap-1 text-[10px]">
          <FileText className="size-7" />
          {state === 'loading' ? t({ fr: 'Aperçu…', en: 'Preview…' }) : null}
        </span>
      ) : null}
    </div>
  )
}
