import { describe, expect, it } from 'vitest'

import { LIFECYCLE_COUNTRIES, lifecycleConfigFor, submissionModeLabel } from './lifecycle-config'

const MVP_COUNTRIES = ['BJ', 'BF', 'CI', 'GW', 'ML', 'NE', 'SN', 'TG', 'NG', 'GH']

describe('country_regulatory_config — seed des 10 pays MVP', () => {
  it('couvre exactement les 10 pays du MVP', () => {
    expect([...LIFECYCLE_COUNTRIES].sort()).toEqual([...MVP_COUNTRIES].sort())
  })

  it('tous : agent local requis + autorisation d’import d’échantillons', () => {
    for (const code of MVP_COUNTRIES) {
      const c = lifecycleConfigFor(code)
      expect(c.localAgentRequired, code).toBe(true)
      expect(c.sampleImportAuthRequired, code).toBe(true)
    }
  })

  it('modes de soumission conformes à la liste CEO', () => {
    expect(lifecycleConfigFor('BJ').submissionMode).toBe('portal_physical')
    expect(lifecycleConfigFor('CI').submissionMode).toBe('portal_physical')
    expect(lifecycleConfigFor('NG').submissionMode).toBe('portal')
    expect(lifecycleConfigFor('GH').submissionMode).toBe('paper')
    expect(lifecycleConfigFor('TG').submissionMode).toBe('physical')
  })

  it('pays « à confirmer » → défaut prudent marqué unconfirmed', () => {
    expect(lifecycleConfigFor('SN').unconfirmed).toBe(true)
    expect(lifecycleConfigFor('BJ').unconfirmed).toBeUndefined()
  })

  it('pays hors référentiel → défaut prudent (physique, à confirmer)', () => {
    const c = lifecycleConfigFor('ZZ')
    expect(c.submissionMode).toBe('physical')
    expect(c.unconfirmed).toBe(true)
  })

  it('libellés de mode bilingues', () => {
    expect(submissionModeLabel('portal_physical')).toBe('Portail + dossier physique')
    expect(submissionModeLabel('paper', 'en')).toBe('Paper (CTD)')
  })
})
