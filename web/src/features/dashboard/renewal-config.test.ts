import { afterEach, describe, expect, it } from 'vitest'

import { renewalLeadDays } from './dashboard-data'
import { renewalLeadOverride, setRenewalLeadOverrides } from './renewal-config'

// Belt-and-suspenders : le setup global reset déjà après chaque test ; on le refait ici pour que
// ce fichier soit correct en isolation.
afterEach(() => setRenewalLeadOverrides(null))

describe('renewal-config — override des préavis (domaine B, config Relances)', () => {
  it('sans override → constantes par défaut (admin 180, COA 547, info 90)', () => {
    expect(renewalLeadDays('gmp')).toBe(180)
    expect(renewalLeadDays('coa')).toBe(547)
    expect(renewalLeadDays('rcp')).toBe(90)
    expect(renewalLeadOverride('gmp')).toBeUndefined()
  })

  it('override org → renewalLeadDays reflète les valeurs configurées', () => {
    setRenewalLeadOverrides({ gmp: 120, coa: 400 })
    expect(renewalLeadDays('gmp')).toBe(120)
    expect(renewalLeadDays('coa')).toBe(400)
    // Type non surchargé → constante par défaut conservée.
    expect(renewalLeadDays('copp')).toBe(180)
  })

  it('valeurs invalides (≤ 0, non finies) ignorées ; reset(null) revient aux défauts', () => {
    setRenewalLeadOverrides({ gmp: 0, copp: -5, fsc: Number.NaN, ml: 200 })
    expect(renewalLeadDays('gmp')).toBe(180) // 0 ignoré
    expect(renewalLeadDays('copp')).toBe(180) // négatif ignoré
    expect(renewalLeadDays('ml')).toBe(200) // valide appliqué
    setRenewalLeadOverrides(null)
    expect(renewalLeadDays('ml')).toBe(180)
  })
})
