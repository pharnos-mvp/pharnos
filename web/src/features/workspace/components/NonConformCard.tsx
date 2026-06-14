import { ClipboardList, Languages, RefreshCw, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { useI18n, type Translatable } from '@/lib/i18n-context'
import { UPGRADE_DOC_TYPES } from '../regafy-ai'
import type { RegafyFinding } from '../regafy'

/** Type court affiché sur la carte (mockup CEO). */
const SHORT_LABEL: Record<string, Translatable> = {
  rcp: { fr: 'RCP', en: 'SmPC' },
  notice: { fr: 'Notice', en: 'Leaflet' },
  labeling: { fr: 'Étiquetage', en: 'Labeling' },
  artwork: { fr: 'Étiquetage', en: 'Labeling' },
  cover: { fr: 'Cover letter', en: 'Cover letter' },
  pght: { fr: 'Lettre de PGHT', en: 'GHTL letter' },
}

/**
 * Carte de CONSTAT d'analyse Regafy — flottante au centre de l'aperçu (mockup CEO).
 * Actions selon la politique : document à template → Remplir le template [/ Traduire si
 * langue ≠ FR] / Remplacer ; pièce administrative → Remplacer. À poser dans un conteneur
 * `relative` ; le fond reste lisible (overlay pointer-events-none, carte sticky au scroll).
 */
export function NonConformCard({
  finding,
  docType,
  translating,
  showReplace = true,
  onFill,
  onTranslate,
  onReplace,
  onDismiss,
}: {
  finding: RegafyFinding
  docType: string
  translating?: boolean
  /** Masqué pour un document généré (traduction/version conforme) — rien à téléverser. */
  showReplace?: boolean
  onFill: () => void
  onTranslate: () => void
  onReplace: () => void
  onDismiss: () => void
}) {
  const { t } = useI18n()
  const isTemplate = UPGRADE_DOC_TYPES.has(docType)
  const short = SHORT_LABEL[docType]
  return (
    <div className="pointer-events-none absolute inset-0 z-10">
      <div className="sticky top-[30vh] flex justify-center p-4">
        <div className="pointer-events-auto relative flex max-w-sm flex-col items-center gap-4 rounded-2xl border bg-white px-7 py-6 text-center shadow-2xl">
          <button
            type="button"
            aria-label={t({ fr: 'Masquer le signalement', en: 'Hide finding' })}
            title={t({
              fr: 'Masquer (le constat reste dans le panneau Remarques)',
              en: 'Hide (the finding stays in the Notes panel)',
            })}
            onClick={onDismiss}
            className="absolute top-2 right-2 rounded-full p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
          >
            <X className="size-3.5" />
          </button>
          <div className="space-y-1">
            <p className="text-sm font-bold text-neutral-900">
              {short ? t(short) : docType.toUpperCase()}
            </p>
            {/* finding.message = contenu réglementaire Regafy — NON traduit (langue officielle pays). */}
            <p className="text-xs leading-snug font-medium text-neutral-700">{finding.message}</p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2">
            {isTemplate ? (
              <Button
                size="sm"
                variant="outline"
                onClick={onFill}
                className="h-8 gap-1.5 rounded-full border-violet-500 px-4 text-violet-700 hover:bg-violet-50 hover:text-violet-800"
              >
                <ClipboardList className="size-3.5" />
                {t({ fr: 'Remplir le template', en: 'Fill the template' })}
              </Button>
            ) : null}
            {isTemplate && finding.translate ? (
              <Button
                size="sm"
                variant="outline"
                disabled={translating}
                onClick={onTranslate}
                className="h-8 gap-1.5 rounded-full border-amber-500 px-4 text-amber-700 hover:bg-amber-50 hover:text-amber-800"
              >
                <Languages className="size-3.5" />
                {translating
                  ? t({ fr: 'Traduction…', en: 'Translating…' })
                  : t({ fr: 'Traduire', en: 'Translate' })}
              </Button>
            ) : null}
            {showReplace ? (
              <Button
                size="sm"
                variant="outline"
                onClick={onReplace}
                className="h-8 gap-1.5 rounded-full border-neutral-300 bg-white px-4 text-neutral-700 hover:bg-neutral-100 hover:text-neutral-900"
              >
                <RefreshCw className="size-3.5" />
                {t({ fr: 'Remplacer', en: 'Replace' })}
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}
