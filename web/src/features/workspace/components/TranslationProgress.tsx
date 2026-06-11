import { useEffect, useRef } from 'react'
import { Languages } from 'lucide-react'

/**
 * Progression de traduction en streaming (T11) : le texte traduit s'affiche au fil de l'eau,
 * auto-scrollé sur la fin — l'utilisateur voit le travail avancer au lieu d'attendre en aveugle
 * (décisif sur bas débit : premier texte ~2 s au lieu de 30-60 s).
 */
export function TranslationProgress({ text }: { text: string }) {
  const boxRef = useRef<HTMLPreElement>(null)

  useEffect(() => {
    const box = boxRef.current
    if (box) box.scrollTop = box.scrollHeight
  }, [text])

  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50/50 p-3">
      <p className="flex items-center gap-1.5 text-xs font-medium text-amber-800">
        <Languages className="size-4 shrink-0 animate-pulse" />
        Traduction en cours — le texte s'affiche au fil de l'eau…
      </p>
      <pre
        ref={boxRef}
        className="text-muted-foreground mt-2 max-h-56 overflow-auto font-sans text-xs whitespace-pre-wrap"
      >
        {text || '…'}
      </pre>
    </div>
  )
}
