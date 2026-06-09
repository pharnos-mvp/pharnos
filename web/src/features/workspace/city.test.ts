import { describe, expect, it } from 'vitest'

import { extractCity } from './city'

describe('extractCity (ville depuis l’adresse du titulaire)', () => {
  it('extrait la ville juste avant le code postal', () => {
    expect(
      extractCity('Aban House, 1st Floor, 25/31 Rope Walk Street, Fort, Mumbai - 400023'),
    ).toBe('Mumbai')
    expect(extractCity('Zone industrielle, Casablanca 20000')).toBe('Casablanca')
  })

  it('gère « Ville, Pays »', () => {
    expect(extractCity('12 rue de la Santé, Cotonou, Bénin')).toBe('Cotonou')
  })

  it('garde le dernier segment après un tiret', () => {
    expect(extractCity('Survey No 2458, Rajpur, Dist. - Mehsana - 384440, Gujarat, Inde')).toBe(
      'Mehsana',
    )
  })

  it('renvoie null pour une adresse vide', () => {
    expect(extractCity('')).toBeNull()
    expect(extractCity(null)).toBeNull()
    expect(extractCity(undefined)).toBeNull()
  })
})
