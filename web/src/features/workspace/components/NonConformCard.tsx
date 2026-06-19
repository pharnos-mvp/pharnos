import { ClipboardList, Languages, RefreshCw, ShieldAlert, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { useI18n } from '@/lib/i18n-context'
import { UPGRADE_DOC_TYPES } from '../regafy-ai'
import type { RegafyFinding } from '../regafy'

/**
 * Carte de CONSTAT Regafy — style `.finding` EXACT du mockup (rail Copilote droit) : fond ambré,
 * titre bouclier « Constat Regafy », message réglementaire, puis ligne de boutons navy-outline
 * pleine largeur. Actions selon la politique : document à template → Remplir [/ Traduire si
 * langue ≠ FR] / Remplacer ; pièce administrative → Remplacer. Masquable (× ; le constat reste
 * listé dans « Remarques »). Teintes ambrées exactes du mockup en clair + variantes `dark:`.
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
  // Bouton navy-outline du mockup (`.finding .row button` : flex:1, h28, radius7, border navy,
  // fond carte, texte navy, 12px/600) — token --brand → dark/light.
  const btn =
    'border-brand text-brand bg-card hover:bg-brand/5 h-7 flex-1 gap-1.5 rounded-[7px] border px-2 text-[12px] font-semibold shadow-none'
  return (
    <div className="rounded-[10px] border border-[#f3e2bf] bg-[#fbf0db] p-[11px] dark:border-amber-500/30 dark:bg-amber-500/10">
      <div className="flex items-center gap-1.5 text-[12.5px] font-semibold text-[#92590a] dark:text-amber-300">
        <ShieldAlert className="size-[15px] shrink-0" aria-hidden />
        {t({ fr: 'Constat Regafy', en: 'Regafy finding' })}
        <button
          type="button"
          aria-label={t({ fr: 'Masquer le signalement', en: 'Hide finding' })}
          title={t({
            fr: 'Masquer (le constat reste dans le panneau Remarques)',
            en: 'Hide (the finding stays in the Notes panel)',
          })}
          onClick={onDismiss}
          className="focus-visible:ring-ring/50 ml-auto rounded-full p-0.5 text-[#92590a]/60 outline-none hover:bg-amber-500/15 hover:text-[#92590a] focus-visible:ring-[3px] dark:text-amber-300/70 dark:hover:text-amber-200"
        >
          <X className="size-3.5" />
        </button>
      </div>
      {/* finding.message = contenu réglementaire Regafy — NON traduit (langue officielle du pays). */}
      <p className="mt-1.5 mb-2 text-[12px] leading-snug text-[#6b5212] dark:text-amber-100/80">
        {finding.message}
      </p>
      <div className="flex gap-1.5">
        {isTemplate ? (
          <Button size="sm" variant="outline" onClick={onFill} className={btn}>
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
            className={btn}
          >
            <Languages className="size-3.5" />
            {translating
              ? t({ fr: 'Traduction…', en: 'Translating…' })
              : t({ fr: 'Traduire', en: 'Translate' })}
          </Button>
        ) : null}
        {showReplace ? (
          <Button size="sm" variant="outline" onClick={onReplace} className={btn}>
            <RefreshCw className="size-3.5" />
            {t({ fr: 'Remplacer', en: 'Replace' })}
          </Button>
        ) : null}
      </div>
    </div>
  )
}
