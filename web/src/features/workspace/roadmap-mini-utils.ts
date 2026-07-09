import {
  Award,
  BellRing,
  ClipboardCheck,
  Landmark,
  type LucideIcon,
  Package,
  Receipt,
  Send,
} from 'lucide-react'

import type { Lang } from '@/lib/i18n-context'

import {
  LIFECYCLE_STAGE_ORDER,
  type LifecycleStage,
  type LifecycleStageId,
  type LifecycleState,
  type LifecycleStatus,
  stageOutcomeLabel,
} from './lifecycle-constants'

/**
 * Icône par étape (Tabler du mockup → équivalent lucide) — **source unique** partagée par la
 * Roadmap (`RoadmapPage`) ET la mini-roadmap (`RoadmapMini`). Présentation seulement ; la logique
 * d'étape reste dans `deriveLifecycle` (jamais dupliquée).
 */
export const STAGE_ICON: Record<LifecycleStageId, LucideIcon> = {
  montage: Package,
  revue: Send,
  decision: ClipboardCheck,
  depot: Landmark,
  soumission: Receipt,
  notifications: BellRing,
  amm: Award,
}

/**
 * Géométrie du rail, dérivée de l'état `deriveLifecycle` (fonction PURE, testée) : nœuds
 * `flex-1`, ligne encartée à 7 % → centre du nœud i à (i+0,5)/7, largeur du liseré = centre − 7.
 * Aucune couleur/logique d'étape ici. Quand `complete`, `deriveLifecycle` place déjà
 * `currentStageId` sur la dernière étape → idx = total−1 ; une seule formule couvre les deux cas.
 */
export function roadmapMiniGeometry(
  lifecycle: Pick<LifecycleState, 'currentStageId' | 'progress'>,
): {
  idx: number
  total: number
  complete: boolean
  fillPct: number
} {
  const total = lifecycle.progress.total
  const idx = Math.max(0, LIFECYCLE_STAGE_ORDER.indexOf(lifecycle.currentStageId))
  const complete = lifecycle.progress.done >= total
  const fillPct = Math.max(0, ((idx + 0.5) / total) * 100 - 7)
  return { idx, total, complete, fillPct }
}

/**
 * Ton du NŒUD de l'étape courante — l'étape où on est, colorée par « comment ça se passe »
 * (mockup C, GO CEO 2026-07-09) : rouge si le dossier est bloqué (rejet/refus), vert si le
 * parcours est terminé, orange (« en cours/attente ») sinon. Lisible sans légende.
 */
export function currentStageTone(status: LifecycleStatus): 'warning' | 'danger' | 'success' {
  if (status === 'rejected' || status === 'amm_refused') return 'danger'
  if (status === 'amm_granted') return 'success'
  return 'warning'
}

export type StageSubline =
  | { kind: 'outcome'; tone: 'success' | 'danger' | 'warning'; text: string }
  | { kind: 'wait'; text: string }
  | { kind: 'date'; text: string }
  | { kind: 'none'; text: '' }

/**
 * Sous-ligne d'une étape du rail (PURE, testée) — priorité : issue (Décision/AMM, colorée) >
 * attente sur l'étape courante (« attente N j ») > date où l'étape a été atteinte > rien.
 * `waitingDays` ne s'applique qu'à l'étape « current » (ancienneté du fil, même sémantique M5).
 */
export function stageSubline(
  stage: LifecycleStage,
  lang: Lang,
  waitingDays: number | null,
): StageSubline {
  if (stage.outcome) {
    const tone =
      stage.outcome === 'accepted' || stage.outcome === 'granted'
        ? 'success'
        : stage.outcome === 'suspended'
          ? 'warning'
          : 'danger'
    return { kind: 'outcome', tone, text: stageOutcomeLabel(stage.outcome, lang) }
  }
  if (stage.status === 'current' && waitingDays !== null && waitingDays >= 1) {
    return {
      kind: 'wait',
      text: lang === 'en' ? `waiting ${waitingDays} d` : `attente ${waitingDays} j`,
    }
  }
  if (stage.at) {
    const d = new Date(stage.at)
    if (!Number.isNaN(d.getTime())) {
      return {
        kind: 'date',
        text: new Intl.DateTimeFormat(lang === 'en' ? 'en-GB' : 'fr', {
          day: 'numeric',
          month: 'short',
        }).format(d),
      }
    }
  }
  return { kind: 'none', text: '' }
}
