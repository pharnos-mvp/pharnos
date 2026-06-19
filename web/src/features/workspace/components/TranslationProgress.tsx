import { Languages } from 'lucide-react'

import { useI18n } from '@/lib/i18n-context'

/**
 * Indicateur SOBRE de traduction / mise en conformité en cours (T11 / U4) — **hauteur FIXE** :
 * icône + libellé + barre indéterminée. Ne fait plus défiler le texte généré au fil de l'eau
 * (qui enflait et déformait le panneau central) → la feuille reste stable pendant l'opération
 * (demande CEO). Le `text` streamé n'est plus affiché ; la prop reste tolérée pour les appelants.
 */
export function TranslationProgress({ label }: { text?: string; label?: string }) {
  const { t } = useI18n()
  const displayLabel = label ?? t({ fr: 'Traduction en cours…', en: 'Translating…' })
  return (
    <div
      role="status"
      aria-live="polite"
      className="border-brand/30 bg-brand/5 flex items-center gap-2 rounded-lg border px-3 py-2"
    >
      <Languages className="text-brand size-4 shrink-0 animate-pulse" aria-hidden />
      <span className="text-brand text-xs font-medium">{displayLabel}</span>
      <span
        className="bg-brand/15 ml-auto h-1 w-24 shrink-0 overflow-hidden rounded-full"
        aria-hidden
      >
        <span className="tr-bar bg-brand block h-full w-1/2 rounded-full" />
      </span>
    </div>
  )
}
