import { describe, expect, it } from 'vitest'

import type { LifecycleEventType } from '@/lib/db'
import { LIFECYCLE_STAGE_ORDER } from './lifecycle-constants'
import { nextLifecycleActions } from './lifecycle-actions'

describe('nextLifecycleActions — actions Labo par étape courante (M2)', () => {
  it('Dépôt → une seule action : Transmettre (deposited)', () => {
    const actions = nextLifecycleActions('depot')
    expect(actions.map((a) => a.type)).toEqual(['deposited'])
    expect(actions[0]?.form).toBe('confirm')
    expect(actions[0]?.variant).toBe('primary')
  })

  it('Soumission → Marquer comme soumis (submitted) avec formulaire mode+preuve', () => {
    const actions = nextLifecycleActions('soumission')
    expect(actions.map((a) => a.type)).toEqual(['submitted'])
    expect(actions[0]?.form).toBe('submit')
  })

  it('Notifications (aucune notification encore) → pas de « réponse » (ordre du journal)', () => {
    const actions = nextLifecycleActions('notifications')
    expect(actions.map((a) => a.type)).toEqual(['authority_query', 'amm_granted', 'amm_refused'])
  })

  it('Notifications après une notification → « réponse au complément » débloquée', () => {
    const actions = nextLifecycleActions('notifications', { hasAuthorityQuery: true })
    expect(actions.map((a) => a.type)).toEqual([
      'authority_query',
      'authority_response',
      'amm_granted',
      'amm_refused',
    ])
    // Le refus est la seule action destructive ; l'octroi est primary.
    expect(actions.find((a) => a.type === 'amm_refused')?.variant).toBe('destructive')
    expect(actions.find((a) => a.type === 'amm_granted')?.variant).toBe('primary')
  })

  it('étapes amont (montage/revue/decision) → aucune action journal (correspondance)', () => {
    expect(nextLifecycleActions('montage')).toEqual([])
    expect(nextLifecycleActions('revue')).toEqual([])
    expect(nextLifecycleActions('decision')).toEqual([])
  })

  it('terminal (AMM rendue) → aucune action', () => {
    expect(nextLifecycleActions('amm')).toEqual([])
  })

  it('chaque type émis appartient au vocabulaire contrôlé (miroir CHECK 0047)', () => {
    const allowed: LifecycleEventType[] = [
      'deposited',
      'submitted',
      'authority_query',
      'authority_response',
      'amm_granted',
      'amm_refused',
    ]
    const emitted = LIFECYCLE_STAGE_ORDER.flatMap((stage) =>
      nextLifecycleActions(stage).map((a) => a.type),
    )
    expect(emitted.length).toBeGreaterThan(0)
    for (const type of emitted) expect(allowed).toContain(type)
  })

  it('les identifiants d’action sont uniques par étape (pas de doublon de bouton)', () => {
    for (const stage of LIFECYCLE_STAGE_ORDER) {
      const ids = nextLifecycleActions(stage).map((a) => a.id)
      expect(new Set(ids).size).toBe(ids.length)
    }
  })
})
