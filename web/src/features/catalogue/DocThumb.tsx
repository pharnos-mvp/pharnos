import { useEffect, useRef, useState } from 'react'
import { FileText } from 'lucide-react'

import { useI18n } from '@/lib/i18n-context'
import { downloadDocumentBlob } from './documents-sync'
import { cacheDocumentBlob, getDocumentBlob } from './documents-repository'

/** Échelle de rendu de la vignette (page 1) — assez net en carte, sans coûter une page pleine. */
const THUMB_SCALE = 0.55

export interface ThumbDoc {
  id: string
  filePath: string | null
  fileName: string
}

/**
 * Vignette d'une pièce (page 1) + nombre de pages, rendus **PARESSEUSEMENT**.
 *
 * Une page de type de pièce peut aligner 20-30 documents : tout rendre au chargement figerait
 * l'écran. On n'ouvre donc le PDF que quand la carte APPROCHE du viewport (IntersectionObserver),
 * une seule fois, et le blob suit la règle offline-first du reste de l'app (Dexie d'abord, sinon
 * Storage puis épinglage local). `onPages` remonte le nombre de pages au parent (infobulle).
 */
export function DocThumb({ doc, onPages }: { doc: ThumbDoc; onPages?: (n: number) => void }) {
  const { t } = useI18n()
  const hostRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const startedRef = useRef(false)
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

  // 2) Rendu de la page 1 — UNE SEULE fois, à l'approche. Le garde est un ref (et non l'état) :
  // il ne dépend pas d'un rendu, donc un simple re-rendu du parent ne relance jamais le chargement.
  useEffect(() => {
    if (!near || startedRef.current) return
    startedRef.current = true
    let cancelled = false
    void (async () => {
      setState('loading')
      try {
        let blob = (await getDocumentBlob(doc.id)) ?? null
        if (!blob && doc.filePath) {
          blob = await downloadDocumentBlob(doc.filePath)
          // Épingle en local : la prochaine visite (même hors-ligne) affiche la vignette.
          if (blob) void cacheDocumentBlob(doc.id, blob)
        }
        if (cancelled || !blob) {
          if (!cancelled) setState('none')
          return
        }
        const isPdf = blob.type === 'application/pdf' || /\.pdf$/i.test(doc.fileName)
        if (!isPdf) {
          if (!cancelled) setState('none')
          return
        }
        const pdfjs = await import('pdfjs-dist')
        const workerUrl = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
        pdfjs.GlobalWorkerOptions.workerSrc = workerUrl.default
        const data = new Uint8Array(await blob.arrayBuffer())
        const pdf = await pdfjs.getDocument({ data }).promise
        if (cancelled) return
        onPages?.(pdf.numPages)
        const page = await pdf.getPage(1)
        const viewport = page.getViewport({ scale: THUMB_SCALE })
        const canvas = canvasRef.current
        if (cancelled || !canvas) return
        const ratio = window.devicePixelRatio || 1
        canvas.width = Math.floor(viewport.width * ratio)
        canvas.height = Math.floor(viewport.height * ratio)
        const ctx = canvas.getContext('2d')
        if (!ctx) return
        ctx.scale(ratio, ratio)
        await page.render({ canvas, canvasContext: ctx, viewport }).promise
        if (!cancelled) setState('done')
      } catch {
        // Une pièce illisible ne doit pas casser la grille : on retombe sur l'icône.
        if (!cancelled) setState('none')
      }
    })()
    return () => {
      cancelled = true
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
