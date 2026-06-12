import { ClipboardList, Languages, RefreshCw, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { UPGRADE_DOC_TYPES } from '../regafy-ai'
import type { RegafyFinding } from '../regafy'

/** Type court affiché sur la carte (mockup CEO). */
const SHORT_LABEL: Record<string, string> = {
  rcp: 'RCP',
  notice: 'Notice',
  labeling: 'Étiquetage',
  artwork: 'Étiquetage',
  cover: 'Cover letter',
  pght: 'Lettre de PGHT',
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
  onFill,
  onTranslate,
  onReplace,
  onDismiss,
}: {
  finding: RegafyFinding
  docType: string
  translating?: boolean
  onFill: () => void
  onTranslate: () => void
  onReplace: () => void
  onDismiss: () => void
}) {
  const isTemplate = UPGRADE_DOC_TYPES.has(docType)
  return (
    <div className="pointer-events-none absolute inset-0 z-10">
      <div className="sticky top-[30vh] flex justify-center p-4">
        <div className="pointer-events-auto relative flex max-w-sm flex-col items-center gap-4 rounded-2xl border bg-white px-7 py-6 text-center shadow-2xl">
          <button
            type="button"
            aria-label="Masquer le signalement"
            title="Masquer (le constat reste dans le panneau Remarques)"
            onClick={onDismiss}
            className="text-muted-foreground hover:bg-accent hover:text-foreground absolute top-2 right-2 rounded-full p-1"
          >
            <X className="size-3.5" />
          </button>
          <div className="space-y-1">
            <p className="text-sm font-bold text-neutral-900">
              {SHORT_LABEL[docType] ?? docType.toUpperCase()}
            </p>
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
                Remplir le template
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
                {translating ? 'Traduction…' : 'Traduire'}
              </Button>
            ) : null}
            <Button
              size="sm"
              variant="outline"
              onClick={onReplace}
              className="h-8 gap-1.5 rounded-full px-4"
            >
              <RefreshCw className="size-3.5" />
              Remplacer
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
