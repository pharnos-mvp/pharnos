import { useEffect, useRef, useState } from 'react'

/**
 * Visionneuse PDF **local-first** basée sur PDF.js (rendu canvas dans l'app, comme le viewer
 * intégré de Chrome) — aucun service externe, jamais bloquée par le sandbox/CSP d'un iframe.
 * pdfjs-dist est chargé en import dynamique (chunk à la demande).
 *
 * Les types de pdfjs-dist varient selon les versions → on type localement le sous-ensemble utilisé.
 * La destruction se fait via le **loadingTask** (le PDFDocumentProxy n'expose pas toujours destroy()).
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

export function PdfViewer({ blob }: { blob: Blob }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')

  useEffect(() => {
    let cancelled = false
    let task: PdfTask | undefined
    void (async () => {
      try {
        const pdfjs = await import('pdfjs-dist')
        const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
        pdfjs.GlobalWorkerOptions.workerSrc = worker.default
        const data = new Uint8Array(await blob.arrayBuffer())
        task = pdfjs.getDocument({ data }) as unknown as PdfTask
        const doc = (await task.promise) as PdfDoc
        const container = containerRef.current
        if (cancelled || !container) return
        container.replaceChildren()
        const ratio = window.devicePixelRatio || 1
        for (let p = 1; p <= doc.numPages; p++) {
          const page = await doc.getPage(p)
          if (cancelled) return
          const viewport = page.getViewport({ scale: 1.4 })
          const canvas = document.createElement('canvas')
          canvas.width = Math.floor(viewport.width * ratio)
          canvas.height = Math.floor(viewport.height * ratio)
          canvas.style.maxWidth = `${viewport.width}px`
          canvas.style.width = '100%'
          canvas.style.height = 'auto'
          canvas.className = 'mx-auto mb-3 block rounded border bg-white shadow'
          const ctx = canvas.getContext('2d')
          if (ctx) {
            ctx.scale(ratio, ratio)
            await page.render({ canvas, canvasContext: ctx, viewport }).promise
          }
          if (cancelled) return
          container.appendChild(canvas)
        }
        if (!cancelled) setStatus('ready')
      } catch (e) {
        console.error('[pdf] aperçu :', e)
        if (!cancelled) setStatus('error')
      }
    })()
    return () => {
      cancelled = true
      // Optional call : ne plante jamais si l'API diffère selon la version de pdfjs.
      void task?.destroy?.()
    }
  }, [blob])

  return (
    <div className="bg-muted min-h-0 flex-1 overflow-auto p-3">
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
