import { describe, expect, it } from 'vitest'

import { featureState, isEnabled, isTeaser, isVisible, type FeatureState } from './feature-state'

describe('featureState', () => {
  it('reads the 3 states', () => {
    expect(featureState({ regafy: 'enabled' }, 'regafy')).toBe('enabled')
    expect(featureState({ regafy: 'teaser' }, 'regafy')).toBe('teaser')
    expect(featureState({ regafy: 'hidden' }, 'regafy')).toBe('hidden')
  })

  it('defaults to hidden for missing / null / unknown (fail-safe: never over-grant)', () => {
    expect(featureState({}, 'regafy')).toBe('hidden')
    expect(featureState(null, 'regafy')).toBe('hidden')
    expect(featureState(undefined, 'regafy')).toBe('hidden')
    expect(featureState({ regafy: 'bogus' as FeatureState }, 'regafy')).toBe('hidden')
  })

  it('tolerates the legacy boolean format (transition window / rollback)', () => {
    expect(featureState({ team: true }, 'team')).toBe('enabled')
    expect(featureState({ team: false }, 'team')).toBe('teaser')
  })
})

describe('isEnabled / isTeaser / isVisible', () => {
  it('isEnabled only for Activée (and legacy true)', () => {
    expect(isEnabled({ x: 'enabled' }, 'x')).toBe(true)
    expect(isEnabled({ x: true }, 'x')).toBe(true)
    expect(isEnabled({ x: 'teaser' }, 'x')).toBe(false)
    expect(isEnabled({ x: 'hidden' }, 'x')).toBe(false)
    expect(isEnabled({}, 'x')).toBe(false)
  })

  it('isTeaser only for Vitrine (and legacy false)', () => {
    expect(isTeaser({ x: 'teaser' }, 'x')).toBe(true)
    expect(isTeaser({ x: false }, 'x')).toBe(true)
    expect(isTeaser({ x: 'enabled' }, 'x')).toBe(false)
    expect(isTeaser({ x: 'hidden' }, 'x')).toBe(false)
  })

  it('isVisible for Vitrine or Activée, not Masquée', () => {
    expect(isVisible({ x: 'enabled' }, 'x')).toBe(true)
    expect(isVisible({ x: 'teaser' }, 'x')).toBe(true)
    expect(isVisible({ x: 'hidden' }, 'x')).toBe(false)
    expect(isVisible({}, 'x')).toBe(false)
  })
})
