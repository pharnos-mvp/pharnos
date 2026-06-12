import { useEffect, useRef, useState } from 'react'

/**
 * Visionneuse PDF **local-first** basée sur PDF.js (rendu canvas, comme le viewer intégré de
 * Chrome) — aucun service externe, jamais bloquée par le sandbox/CSP d'un iframe.
 *
 * Performance (Correspondance v2 — dossiers 10-20 Mo) :
 *  • Source `url` : transport **HTTP Range** (`disableAutoFetch`) — pdf.js ne télécharge que la
 *    table xref + les objets des pages affichées : première page peinte en ~centaines de Ko au
 *    lieu du fichier entier. Si le serveur ne répond pas 206, pdf.js retombe tout seul sur le
 *    téléchargement complet (comportement d'avant, jamais pire).
 *  • Rendu **paresseux** : un conteneur dimensionné par page (gabarit = page 1), le canvas n'est
 *    créé que quand la page approche du viewport (IntersectionObserver) et il est LIBÉRÉ quand
 *    elle s'en éloigne — mémoire bornée même à 200 pages, y compris en source `blob`.
 *  • `watermark` : texte incrusté en diagonale sur chaque canvas (traçabilité reviewer, L1) —
 *    dessiné à l'affichage, ne modifie pas le fichier.
 */
interface PdfPage {
  getViewport: (o: { scale: number }) => { width: number; height: number }
  render: (p: {
    canvas: HTMLCanvasElement
    canvasContext: CanvasRenderingContext2D
    viewport: unknown
  }) => { promise: Promise<void> }
}
interface PdfDoc {
  numPages: number
  getPage: (n: number) => Promise<PdfPage>
}
interface PdfTask {
  promise: Promise<unknown>
  destroy: () => Promise<void>
}

const SCALE = 1.4
// Marge d'anticipation : on rend ~1 écran avant l'arrivée, on libère au-delà.
const OBSERVE_MARGIN = '900px 0px'
// Taille des requêtes Range (128 Ko : assez gros pour limiter les allers-retours, assez petit
// pour peindre vite la 1re page sur 3G/4G terrain).
const RANGE_CHUNK = 131072

function drawWatermark(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D, text: string) {
  ctx.save()
  ctx.globalAlpha = 0.13
  ctx.fillStyle = '#1e3a8a'
  ctx.font = `600 ${Math.max(14, canvas.width / 28)}px system-ui, sans-serif`
  ctx.translate(canvas.width / 2, canvas.height / 2)
  ctx.rotate(-Math.PI / 5)
  ctx.textAlign = 'center'
  // Trois lignes répétées : visible sur toute capture partielle de page.
  for (const dy of [-canvas.height / 3, 0, canvas.height / 3]) {
    ctx.fillText(text, 0, dy)
  }
  ctx.restore()
}

export function PdfViewer({
  blob,
  url,
  watermark,
  flow = false,
}: {
  /** Source locale (montage CTD, offline-first). */
  blob?: Blob
  /** Source distante (page publique) — streaming par requêtes Range. */
  url?: string
  /** Texte incrusté en diagonale sur chaque page (traçabilité — page publique). */
  watermark?: string
  flow?: boolean
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')

  useEffect(() => {
    let cancelled = false
    let task: PdfTask | undefined
    let observer: IntersectionObserver | undefined
    // File de rendu séquentielle : un canvas à la fois (pas de saturation CPU/réseau au scroll).
    let renderChain: Promise<void> = Promise.resolve()
    const rendered = new Set<number>()
    // Une page corrompue est re-tentée à chaque passage du viewport : ne logguer qu'une fois.
    const warned = new Set<number>()

    void (async () => {
      try {
        const pdfjs = await import('pdfjs-dist')
        const workerUrl = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
        pdfjs.GlobalWorkerOptions.workerSrc = workerUrl.default

        if (url) {
          task = pdfjs.getDocument({
            url,
            rangeChunkSize: RANGE_CHUNK,
            disableAutoFetch: true,
            disableStream: false,
          }) as unknown as PdfTask
        } else if (blob) {
          const data = new Uint8Array(await blob.arrayBuffer())
          task = pdfjs.getDocument({ data }) as unknown as PdfTask
        } else {
          setStatus('error')
          return
        }
        const doc = (await task.promise) as PdfDoc
        const container = containerRef.current
        if (cancelled || !container) return
        container.replaceChildren()

        // Gabarit : la page 1 donne les dimensions des conteneurs (les dossiers Pharnos sont
        // A4 homogène) ; une page d'un autre format s'ajustera à son rendu.
        const first = await doc.getPage(1)
        if (cancelled) return
        const ref = first.getViewport({ scale: SCALE })
        const ratio = window.devicePixelRatio || 1

        const holders: HTMLDivElement[] = []
        for (let p = 1; p <= doc.numPages; p++) {
          const holder = document.createElement('div')
          holder.dataset.page = String(p)
          holder.className = 'mx-auto mb-3 rounded border bg-white shadow'
          holder.style.maxWidth = `${ref.width}px`
          holder.style.width = '100%'
          holder.style.aspectRatio = `${ref.width} / ${ref.height}`
          container.appendChild(holder)
          holders.push(holder)
        }
        setStatus('ready')

        const renderPage = (holder: HTMLDivElement, pageNum: number) => {
          if (rendered.has(pageNum)) return
          rendered.add(pageNum)
          renderChain = renderChain.then(async () => {
            // Libérée (scroll rapide) ou démontée entre-temps : ne pas rendre pour rien.
            if (cancelled || !rendered.has(pageNum)) return
            try {
              const page = await doc.getPage(pageNum)
              if (cancelled || !rendered.has(pageNum)) return
              const viewport = page.getViewport({ scale: SCALE })
              const canvas = document.createElement('canvas')
              canvas.width = Math.floor(viewport.width * ratio)
              canvas.height = Math.floor(viewport.height * ratio)
              canvas.style.width = '100%'
              canvas.style.height = 'auto'
              canvas.className = 'block rounded'
              const ctx = canvas.getContext('2d')
              if (!ctx) return
              ctx.scale(ratio, ratio)
              await page.render({ canvas, canvasContext: ctx, viewport }).promise
              if (watermark) drawWatermark(canvas, ctx, watermark)
              if (cancelled || !rendered.has(pageNum)) return
              // Format différent du gabarit (page paysage…) : le conteneur épouse le rendu
              // réel — pas de réécriture (reflow) quand le ratio est déjà le bon.
              const ratioNow = `${viewport.width} / ${viewport.height}`
              if (holder.style.aspectRatio !== ratioNow) holder.style.aspectRatio = ratioNow
              holder.replaceChildren(canvas)
            } catch (e) {
              rendered.delete(pageNum)
              if (!cancelled && !warned.has(pageNum)) {
                warned.add(pageNum)
                console.warn('[pdf] rendu page', pageNum, ':', e)
              }
            }
          })
        }

        observer = new IntersectionObserver(
          (entries) => {
            for (const entry of entries) {
              const holder = entry.target as HTMLDivElement
              const pageNum = Number(holder.dataset.page)
              if (entry.isIntersecting) {
                renderPage(holder, pageNum)
              } else if (rendered.has(pageNum)) {
                // Page loin du viewport : canvas libéré (le conteneur garde sa taille →
                // aucun saut de scroll), re-rendu à l'approche suivante.
                rendered.delete(pageNum)
                holder.replaceChildren()
              }
            }
          },
          { root: flow ? null : container.parentElement, rootMargin: OBSERVE_MARGIN },
        )
        for (const h of holders) observer.observe(h)
      } catch (e) {
        console.error('[pdf] aperçu :', e)
        if (!cancelled) setStatus('error')
      }
    })()
    return () => {
      cancelled = true
      observer?.disconnect()
      // Optional call : ne plante jamais si l'API diffère selon la version de pdfjs.
      void task?.destroy?.()
    }
  }, [blob, url, watermark, flow])

  return (
    // `flow` : hauteur naturelle (défile avec la page, montage CTD) ; sinon scroll interne (dialog).
    <div className={flow ? 'bg-muted p-3' : 'bg-muted min-h-0 flex-1 overflow-auto p-3'}>
      <div ref={containerRef} />
      {status === 'loading' ? (
        <p className="text-muted-foreground py-8 text-center text-sm">Chargement de l'aperçu…</p>
      ) : null}
      {status === 'error' ? (
        <p className="text-muted-foreground py-8 text-center text-sm">
          Aperçu impossible — téléchargez le fichier.
        </p>
      ) : null}
    </div>
  )
}
