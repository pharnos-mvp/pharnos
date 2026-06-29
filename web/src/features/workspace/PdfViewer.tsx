import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'

import { useI18n } from '@/lib/i18n-context'

/** Poignée impérative : faire défiler l'aperçu jusqu'à une page (table des matières cliquable). */
export interface PdfViewerHandle {
  scrollToPage: (page: number) => void
}

/**
 * Visionneuse PDF **local-first** basée sur PDF.js (rendu canvas, comme le viewer intégré de
 * Chrome) — aucun service externe, jamais bloquée par le sandbox/CSP d'un iframe.
 *
 * Performance (Correspondance v2 — dossiers 10-20 Mo) :
 *  • Source `url` (+ `size` connu) : transport **HTTP Range explicite** (PDFDataRangeTransport)
 *    — pdf.js ne télécharge que la table xref + les objets des pages affichées : première page
 *    peinte en ~centaines de Ko au lieu du fichier entier. Le transport est EXPLICITE car en
 *    cross-origin, `Accept-Ranges` n'est pas exposé par CORS (header non safelisted) : pdf.js
 *    seul croirait le serveur incapable de ranges et téléchargerait tout — alors que Supabase
 *    Storage répond bien 206 (vérifié) et que la taille est déjà dans le payload. Sans `size`,
 *    ou si le serveur répond 200, repli automatique sur le téléchargement complet (jamais pire).
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

export const PdfViewer = forwardRef<
  PdfViewerHandle,
  {
    /** Source locale (montage CTD, offline-first). */
    blob?: Blob
    /** Source distante (page publique) — streaming par requêtes Range. */
    url?: string
    /** Taille du fichier distant en octets — active le transport Range explicite. */
    size?: number
    /** Texte incrusté en diagonale sur chaque page (traçabilité — page publique). */
    watermark?: string
    flow?: boolean
  }
>(function PdfViewer({ blob, url, size, watermark, flow = false }, ref) {
  const { t } = useI18n()
  const containerRef = useRef<HTMLDivElement>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')

  // Saut à une page (TdM cliquable) : le conteneur dimensionné `[data-page]` existe dès le montage
  // (rendu paresseux du canvas à l'approche) → `scrollIntoView` défile l'ancêtre scrollable hôte.
  useImperativeHandle(ref, () => ({
    scrollToPage(page: number) {
      containerRef.current
        ?.querySelector<HTMLElement>(`[data-page="${page}"]`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    },
  }))

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

        if (url && size && size > 0) {
          // Transport Range EXPLICITE : chaque chunk = un GET `Range: bytes=a-b` (header
          // safelisted → pas de préflight) ; échec/200 → repli complet une seule fois.
          const transport = new pdfjs.PDFDataRangeTransport(size, null)
          let fellBack = false
          transport.requestDataRange = (begin: number, end: number) => {
            void (async () => {
              try {
                const r = await fetch(url, {
                  headers: { Range: `bytes=${begin}-${end - 1}` },
                })
                if (r.status !== 206) throw new Error(`status ${r.status}`)
                const buf = new Uint8Array(await r.arrayBuffer())
                if (!cancelled) transport.onDataRange(begin, buf)
              } catch (err) {
                // Serveur sans 206 / réseau : UN repli — tout le fichier, puis on sert les
                // chunks depuis la mémoire (équivalent de l'ancien comportement).
                if (fellBack || cancelled) return
                fellBack = true
                try {
                  const r = await fetch(url)
                  if (!r.ok) throw new Error(`status ${r.status}`, { cause: err })
                  const all = new Uint8Array(await r.arrayBuffer())
                  if (!cancelled) transport.onDataRange(0, all)
                } catch (e2) {
                  console.warn('[pdf] transport range + repli en échec :', err, e2)
                  if (!cancelled) setStatus('error')
                }
              }
            })()
          }
          task = pdfjs.getDocument({
            range: transport,
            rangeChunkSize: RANGE_CHUNK,
            disableAutoFetch: true,
            disableStream: true,
          }) as unknown as PdfTask
        } else if (url) {
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
        // Amorçage SANS attendre l'observer : son callback initial peut rater si le layout
        // n'est pas encore stabilisé à l'attache (constaté en recette : 0 canvas jusqu'au
        // premier scroll). Les 2 premières pages partent tout de suite — l'observer libérera
        // de toute façon ce qui sort du viewport.
        const bootstrapA = holders[0]
        const bootstrapB = holders[1]
        if (bootstrapA) renderPage(bootstrapA, 1)
        if (bootstrapB) renderPage(bootstrapB, 2)
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
  }, [blob, url, size, watermark, flow])

  return (
    // `flow` : hauteur naturelle, fond transparent → les pages (chacune bordée/ombrée) flottent comme
    // la feuille de l'éditeur (cadre UNIQUE, retour CEO) ; sinon scroll interne fond gris (dialog).
    <div className={flow ? '' : 'bg-muted min-h-0 flex-1 overflow-auto p-3'}>
      <div ref={containerRef} />
      {status === 'loading' ? (
        <p className="text-muted-foreground py-8 text-center text-sm">
          {t({ fr: "Chargement de l'aperçu…", en: 'Loading preview…' })}
        </p>
      ) : null}
      {status === 'error' ? (
        <p className="text-muted-foreground py-8 text-center text-sm">
          {t({
            fr: 'Aperçu impossible — téléchargez le fichier.',
            en: 'Preview unavailable — download the file.',
          })}
        </p>
      ) : null}
    </div>
  )
})
