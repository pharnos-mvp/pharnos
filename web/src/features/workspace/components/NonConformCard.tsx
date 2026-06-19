import { ClipboardList, Languages, RefreshCw, ShieldAlert, X } from 'lucide-react'

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
 * Carte de CONSTAT d'analyse Regafy — carte AMBRÉE du panneau Copilote (droite), style `.finding`
 * du mockup `ctd-builder-unified-header.html` (pass 2 : déplacée du canevas → rail). Titre bouclier
 * « Constat Regafy » + type + message réglementaire, puis ligne d'actions selon la politique :
 * document à template → Remplir le template [/ Traduire si langue ≠ FR] / Remplacer ; pièce
 * administrative → Remplacer. Masquable (le constat reste listé dans « Remarques »). Thème amber
 * via variantes `dark:` explicites (quelques teintes neutres/violet/amber en dur, côté clair).
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
    <div className="rounded-xl border border-amber-300/70 bg-amber-50 p-3 dark:border-amber-500/30 dark:bg-amber-500/10">
      <div className="flex items-start justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-xs font-semibold text-amber-800 dark:text-amber-300">
          <ShieldAlert className="size-4 shrink-0" aria-hidden />
          {t({ fr: 'Constat Regafy', en: 'Regafy finding' })}
        </h3>
        <button
          type="button"
          aria-label={t({ fr: 'Masquer le signalement', en: 'Hide finding' })}
          title={t({
            fr: 'Masquer (le constat reste dans le panneau Remarques)',
            en: 'Hide (the finding stays in the Notes panel)',
          })}
          onClick={onDismiss}
          className="-mt-0.5 -mr-0.5 rounded-full p-1 text-amber-700/70 hover:bg-amber-100 hover:text-amber-900 dark:hover:bg-amber-500/20 dark:hover:text-amber-100"
        >
          <X className="size-3.5" />
        </button>
      </div>
      <p className="mt-1 text-[11px] font-bold tracking-wide text-amber-900/80 uppercase dark:text-amber-200/80">
        {short ? t(short) : docType.toUpperCase()}
      </p>
      {/* finding.message = contenu réglementaire Regafy — NON traduit (langue officielle pays). */}
      <p className="mt-0.5 text-xs leading-snug text-amber-900 dark:text-amber-100/90">
        {finding.message}
      </p>
      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {isTemplate ? (
          <Button
            size="sm"
            variant="outline"
            onClick={onFill}
            className="h-7 flex-1 gap-1.5 border-violet-400 bg-white/70 px-2.5 text-violet-700 hover:bg-violet-50 hover:text-violet-800 dark:bg-transparent"
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
            className="h-7 flex-1 gap-1.5 border-amber-500 bg-white/70 px-2.5 text-amber-700 hover:bg-amber-100 hover:text-amber-800 dark:bg-transparent"
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
            className="h-7 flex-1 gap-1.5 border-neutral-300 bg-white/70 px-2.5 text-neutral-700 hover:bg-neutral-100 hover:text-neutral-900 dark:bg-transparent dark:text-neutral-200"
          >
            <RefreshCw className="size-3.5" />
            {t({ fr: 'Remplacer', en: 'Replace' })}
          </Button>
        ) : null}
      </div>
    </div>
  )
}
