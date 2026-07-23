import { describe, expect, it } from 'vitest'

import { statCls } from './dashboard-ui'

describe('statCls (micro-stats des tuiles pays)', () => {
  it('inactif → la classe de base seule', () => {
    expect(statCls(false, 'danger')).toBe('ctry-stat')
  })

  it('actif → base + tonalité, SÉPARÉES PAR UNE ESPACE (sinon la classe ne matche rien)', () => {
    expect(statCls(true, 'danger')).toBe('ctry-stat is-danger')
    expect(statCls(true, 'info')).toBe('ctry-stat is-info')
    // Le garde-fou : les deux classes doivent être distinctes après découpage.
    expect(statCls(true, 'danger').split(' ')).toEqual(['ctry-stat', 'is-danger'])
  })
})
