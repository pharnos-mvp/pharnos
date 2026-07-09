import { useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'

import { StatusBadge } from '@/components/ui/status-badge'
import { useI18n } from '@/lib/i18n-context'
import { cn } from '@/lib/utils'

import {
  LIFECYCLE_STAGES,
  LIFECYCLE_STATUS_TONE,
  lifecycleStatusLabel,
  type LifecycleStage,
  type LifecycleStageId,
  type LifecycleState,
} from './lifecycle-constants'
import {
  currentStageTone,
  roadmapMiniGeometry,
  STAGE_ICON,
  stageSubline,
} from './roadmap-mini-utils'

const STAGE_DEF = Object.fromEntries(LIFECYCLE_STAGES.map((s) => [s.id, s])) as Record<
  LifecycleStageId,
  (typeof LIFECYCLE_STAGES)[number]
>

// Nœud par état — mêmes tons que la page Roadmap (DOT_CLASS) ; l'étape COURANTE prend en plus la
// couleur du statut global (mockup C) : orange = en cours/attente, rouge = rejeté/refusé.
const NODE_DONE = 'bg-success text-white'
const NODE_TODO = 'bg-muted text-muted-foreground border border-border'
const NODE_CUR: Record<'warning' | 'danger' | 'success', string> = {
  warning: 'bg-warning ring-warning-subtle text-white ring-4',
  danger: 'bg-danger ring-danger-subtle text-white ring-4',
  success: 'bg-success ring-success-subtle text-white ring-4',
}

const SUB_CLASS: Record<string, string> = {
  date: 'text-muted-foreground font-mono',
  wait: 'text-warning font-bold',
  'outcome-success': 'text-success font-bold',
  'outcome-danger': 'text-danger font-bold',
  'outcome-warning': 'text-warning font-bold',
}

// Préférence UI globale (tous fils, toutes surfaces) : rail déplié par défaut.
const OPEN_KEY = 'pharnos.roadmapmini.open'

/**
 * Mini-roadmap « rail permanent » (mockup C, GO CEO 2026-07-09) affichée sous l'en-tête de CHAQUE
 * conversation : les 7 étapes de la spine étiquetées (libellé + issue/date/attente), liseré de
 * progression, bloc statut (badge + n/7). **Dérive entièrement de `deriveLifecycle`** — mêmes
 * étapes, mêmes tons que la Roadmap, aucune logique dupliquée. Sous ~640 px utiles, le bloc
 * statut passe sous le rail (flex-wrap) puis le rail défile horizontalement (min-width).
 * **Rétractable verticalement** (retour recette CEO 2026-07-09) : replié = résumé UNE ligne
 * (étape courante + attente + badge + n/7) — « où en est le dossier » reste lisible même replié.
 * Préférence mémorisée (localStorage), déplié par défaut. Padding porté ICI (les deux états).
 */
export function RoadmapMini({
  lifecycle,
  waitingDays = null,
  className,
}: {
  lifecycle: LifecycleState
  /** Ancienneté d'attente (j) sous l'étape courante ; `null` = masquée. */
  waitingDays?: number | null
  className?: string
}) {
  const { t, lang } = useI18n()
  const [open, setOpen] = useState(() => localStorage.getItem(OPEN_KEY) !== '0')
  const { stages, currentStageId, status, progress } = lifecycle
  const { fillPct } = roadmapMiniGeometry(lifecycle)
  const curTone = currentStageTone(status)
  const currentDef = STAGE_DEF[currentStageId]
  const CurrentIcon = STAGE_ICON[currentStageId]

  function toggle() {
    setOpen((o) => {
      localStorage.setItem(OPEN_KEY, o ? '0' : '1')
      return !o
    })
  }
  const toggleLabel = open
    ? t({ fr: 'Replier le parcours', en: 'Collapse the path' })
    : t({ fr: 'Déplier le parcours', en: 'Expand the path' })

  if (!open) {
    // ── Replié : résumé une ligne — cliquer n'importe où redéplie. ──
    return (
      <button
        type="button"
        aria-expanded={false}
        // Le nom accessible PORTE l'état (l'aria-label d'un bouton masque son contenu aux
        // lecteurs d'écran — revue CTO) : étape courante, statut, avancement, puis l'action.
        aria-label={`${t(currentDef.label)}, ${lifecycleStatusLabel(status, lang)}, ${progress.done}/${progress.total} — ${toggleLabel}`}
        title={toggleLabel}
        onClick={toggle}
        className={cn(
          'hover:bg-muted flex w-full cursor-pointer items-center gap-2 px-4 py-1.5 text-left transition-colors',
          className,
        )}
      >
        <span
          className={cn(
            'grid size-5 shrink-0 place-items-center rounded-full',
            NODE_CUR[curTone],
            'ring-2', // twMerge écrase le ring-4 de NODE_CUR (résumé compact) — voulu
          )}
        >
          <CurrentIcon className="size-3" />
        </span>
        <span className="min-w-0 truncate text-xs font-bold">{t(currentDef.label)}</span>
        {waitingDays !== null && waitingDays >= 1 ? (
          <span className="text-warning shrink-0 text-[11px] font-medium">
            · {t({ fr: `attente ${waitingDays} j`, en: `waiting ${waitingDays} d` })}
          </span>
        ) : null}
        <span className="ml-auto flex shrink-0 items-center gap-2">
          <StatusBadge tone={LIFECYCLE_STATUS_TONE[status]}>
            {lifecycleStatusLabel(status, lang)}
          </StatusBadge>
          <span className="text-muted-foreground font-mono text-[11px] font-bold">
            {progress.done}/{progress.total}
          </span>
          <ChevronDown className="text-muted-foreground size-3.5" />
        </span>
      </button>
    )
  }

  return (
    <div
      className={cn('flex items-start gap-1 px-4 pt-2.5 pb-1.5', className)}
      role="group"
      aria-label={t({
        fr: `Parcours du dossier : ${t(currentDef.label)}, ${progress.done}/${progress.total} étapes, ${lifecycleStatusLabel(status, lang)}`,
        en: `Dossier path: ${t(currentDef.label)}, ${progress.done}/${progress.total} steps, ${lifecycleStatusLabel(status, lang)}`,
      })}
    >
      <div className="min-w-0 flex-1 overflow-x-auto">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <div className="relative flex min-w-[512px] flex-1">
            {/* Liseré : encart 7 % = centre du premier/dernier nœud (nœuds flex-1) */}
            <div className="bg-border absolute top-[13px] right-[7%] left-[7%] h-0.5 rounded-full" />
            <div
              className="bg-success absolute top-[13px] left-[7%] h-0.5 rounded-full"
              style={{ width: `${fillPct}%` }}
            />
            {stages.map((s) => (
              <RailStep key={s.id} stage={s} curTone={curTone} waitingDays={waitingDays} />
            ))}
          </div>
          <div className="ml-auto flex shrink-0 flex-col items-end gap-1">
            <StatusBadge tone={LIFECYCLE_STATUS_TONE[status]}>
              {lifecycleStatusLabel(status, lang)}
            </StatusBadge>
            <span className="text-muted-foreground font-mono text-[11px] font-bold">
              {progress.done}/{progress.total} {t({ fr: 'étapes', en: 'steps' })}
            </span>
          </div>
        </div>
      </div>
      <button
        type="button"
        aria-expanded={true}
        aria-label={toggleLabel}
        title={toggleLabel}
        onClick={toggle}
        className="text-muted-foreground hover:bg-muted hover:text-foreground grid size-6 shrink-0 cursor-pointer place-items-center rounded-md transition-colors"
      >
        <ChevronUp className="size-3.5" />
      </button>
    </div>
  )
}

function RailStep({
  stage,
  curTone,
  waitingDays,
}: {
  stage: LifecycleStage
  curTone: 'warning' | 'danger' | 'success'
  waitingDays: number | null
}) {
  const { t, lang } = useI18n()
  const Icon = STAGE_ICON[stage.id]
  const def = STAGE_DEF[stage.id]
  const sub = stageSubline(stage, lang, waitingDays)
  const subClass =
    sub.kind === 'outcome' ? SUB_CLASS[`outcome-${sub.tone}`] : (SUB_CLASS[sub.kind] ?? '')

  return (
    <div className="relative z-[1] flex min-w-0 flex-1 flex-col items-center gap-1 text-center">
      <span
        className={cn(
          'grid size-7 shrink-0 place-items-center rounded-full',
          stage.status === 'done' && NODE_DONE,
          stage.status === 'current' && NODE_CUR[curTone],
          stage.status === 'todo' && NODE_TODO,
        )}
      >
        <Icon className="size-3.5" />
      </span>
      <span
        className={cn(
          'text-[10.5px] leading-tight font-bold',
          stage.status === 'todo' && 'text-muted-foreground font-medium',
        )}
      >
        {t(def.label)}
      </span>
      {/* min-h réservée : les étapes sans sous-ligne gardent l'alignement du rail. */}
      <span className={cn('min-h-[13px] text-[9.5px] leading-tight', subClass)}>{sub.text}</span>
    </div>
  )
}
