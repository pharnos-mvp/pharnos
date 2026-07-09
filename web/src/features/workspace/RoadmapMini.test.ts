import { describe, expect, it } from 'vitest'

import type { LifecycleStage, LifecycleStageId } from './lifecycle-constants'
import { currentStageTone, roadmapMiniGeometry, stageSubline } from './roadmap-mini-utils'

const geo = (currentStageId: LifecycleStageId, done: number) =>
  roadmapMiniGeometry({ currentStageId, progress: { done, total: 7 } })

describe('roadmapMiniGeometry', () => {
  it('montage (début) : liseré à ~0, non complet', () => {
    const g = geo('montage', 0)
    expect(g.idx).toBe(0)
    expect(g.complete).toBe(false)
    // 0,5/7·100 − 7 ≈ 0,14 (borne max(0,·) laisse passer)
    expect(g.fillPct).toBeCloseTo(0.14, 2)
  })

  it('notifications (idx 5) : liseré partiel', () => {
    const g = geo('notifications', 5)
    expect(g.idx).toBe(5)
    expect(g.complete).toBe(false)
    expect(g.fillPct).toBeCloseTo(71.57, 2) // 5,5/7·100 − 7
  })

  it('amm rendu (complet) : liseré au maximum', () => {
    const g = geo('amm', 7)
    expect(g.idx).toBe(6)
    expect(g.complete).toBe(true)
    expect(g.fillPct).toBeCloseTo(85.86, 2) // 6,5/7·100 − 7
  })

  it('jamais négatif', () => {
    expect(geo('montage', 0).fillPct).toBeGreaterThanOrEqual(0)
  })
})

describe('currentStageTone', () => {
  it('bloqué (rejet/refus) → danger', () => {
    expect(currentStageTone('rejected')).toBe('danger')
    expect(currentStageTone('amm_refused')).toBe('danger')
  })
  it('terminé (enregistré) → success', () => {
    expect(currentStageTone('amm_granted')).toBe('success')
  })
  it('en cours (tous les autres) → warning', () => {
    expect(currentStageTone('montage')).toBe('warning')
    expect(currentStageTone('in_review')).toBe('warning')
    expect(currentStageTone('suspended')).toBe('warning')
    expect(currentStageTone('in_notification')).toBe('warning')
  })
})

const stage = (over: Partial<LifecycleStage>): LifecycleStage => ({
  id: 'decision',
  status: 'done',
  at: null,
  ...over,
})

describe('stageSubline', () => {
  it("l'issue prime sur la date (Décision : Accepté)", () => {
    const s = stageSubline(stage({ outcome: 'accepted', at: '2026-05-06T12:00:00Z' }), 'fr', null)
    expect(s).toEqual({ kind: 'outcome', tone: 'success', text: 'Accepté' })
  })

  it('issue négative → ton danger (Rejeté)', () => {
    expect(stageSubline(stage({ outcome: 'rejected' }), 'fr', null)).toMatchObject({
      kind: 'outcome',
      tone: 'danger',
    })
    expect(stageSubline(stage({ outcome: 'refused' }), 'fr', null)).toMatchObject({
      tone: 'danger',
    })
  })

  it('complément (suspended) → ton warning', () => {
    expect(stageSubline(stage({ outcome: 'suspended' }), 'fr', null)).toMatchObject({
      tone: 'warning',
    })
  })

  it("attente sur l'étape courante (waitingDays ≥ 1), FR puis EN", () => {
    const cur = stage({ status: 'current' })
    expect(stageSubline(cur, 'fr', 11)).toEqual({ kind: 'wait', text: 'attente 11 j' })
    expect(stageSubline(cur, 'en', 11)).toEqual({ kind: 'wait', text: 'waiting 11 d' })
  })

  it('pas d’attente affichée hors étape courante ni sous 1 j', () => {
    expect(stageSubline(stage({ status: 'done', at: null }), 'fr', 11).kind).toBe('none')
    expect(stageSubline(stage({ status: 'current' }), 'fr', 0).kind).toBe('none')
  })

  it('date atteinte formatée court (fr : « 6 mai »)', () => {
    const s = stageSubline(stage({ at: '2026-05-06T12:00:00Z' }), 'fr', null)
    expect(s.kind).toBe('date')
    expect(s.text).toMatch(/6\s?mai/)
  })

  it('date invalide ou absente → rien', () => {
    expect(stageSubline(stage({ at: 'garbage' }), 'fr', null).kind).toBe('none')
    expect(stageSubline(stage({ at: null }), 'fr', null).kind).toBe('none')
  })
})
