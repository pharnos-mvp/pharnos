import { describe, expect, it } from 'vitest'

import type { PghtEntry } from '@/lib/db'
import { pghtFcfaForCountry } from './pght'

const entries: PghtEntry[] = [
  { country: 'BJ', currency: 'EUR', amount: '3' },
  { country: 'CI', currency: 'XOF', amount: '2500' },
  { country: 'SN', currency: 'XOF', amount: '2400' },
]

describe('pghtFcfaForCountry', () => {
  it('convertit un montant EUR du pays en FCFA (parité fixe — exemple CEO Bénin 3 €)', () => {
    expect(pghtFcfaForCountry(entries, 'BJ', 'fr')).toBe('1967,87')
    expect(pghtFcfaForCountry(entries, 'BJ', 'en')).toBe('1967.87')
  })

  it('reprend un montant déjà en FCFA tel quel', () => {
    expect(pghtFcfaForCountry(entries, 'CI')).toBe('2500')
    expect(pghtFcfaForCountry(entries, 'SN')).toBe('2400')
  })

  it('rend une chaîne vide → marqueur éditable conservé (pays absent, table vide, montant invalide)', () => {
    expect(pghtFcfaForCountry(entries, 'TG')).toBe('')
    expect(pghtFcfaForCountry(undefined, 'BJ')).toBe('')
    expect(pghtFcfaForCountry([], 'BJ')).toBe('')
    expect(pghtFcfaForCountry([{ country: 'TG', currency: 'XOF', amount: '' }], 'TG')).toBe('')
  })
})
