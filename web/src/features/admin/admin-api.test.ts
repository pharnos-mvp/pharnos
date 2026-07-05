import { describe, expect, it } from 'vitest'

import {
  bytesToGbInput,
  formatInt,
  gbToBytes,
  parseCapInput,
  parseStorageGbInput,
  pct,
  trend,
} from './admin-api'

describe('parseCapInput (garde god mode : jamais « ∞ » par accident)', () => {
  it('vide → null (illimité / défaut du plan)', () => {
    expect(parseCapInput('')).toBeNull()
    expect(parseCapInput('   ')).toBeNull()
  })
  it('entier ≥ 0 → valeur (décimales tronquées)', () => {
    expect(parseCapInput('0')).toBe(0)
    expect(parseCapInput('250000')).toBe(250000)
    expect(parseCapInput('12.9')).toBe(12)
  })
  it('saisie invalide → undefined (bloque l’enregistrement, ne devient PAS illimité)', () => {
    expect(parseCapInput('abc')).toBeUndefined()
    expect(parseCapInput('-5')).toBeUndefined()
    expect(parseCapInput('1e999')).toBeUndefined() // notation exponentielle refusée
    expect(parseCapInput('0x10')).toBeUndefined() // hex refusé (Number() l'accepterait : 16)
    expect(parseCapInput('1,5')).toBeUndefined() // virgule décimale FR → champ attend un point
  })
})

describe('parseStorageGbInput', () => {
  it('vide → null ; Go décimaux → octets ; invalide → undefined', () => {
    expect(parseStorageGbInput('')).toBeNull()
    expect(parseStorageGbInput('1')).toBe(1024 ** 3)
    expect(parseStorageGbInput('0.5')).toBe(gbToBytes(0.5))
    expect(parseStorageGbInput('-1')).toBeUndefined()
    expect(parseStorageGbInput('beaucoup')).toBeUndefined()
  })
})

describe('bytesToGbInput (pré-remplissage du champ)', () => {
  it('null/undefined → vide ; arrondi 2 décimales sinon', () => {
    expect(bytesToGbInput(null)).toBe('')
    expect(bytesToGbInput(undefined)).toBe('')
    expect(bytesToGbInput(gbToBytes(2))).toBe('2')
    expect(bytesToGbInput(gbToBytes(1.5))).toBe('1.5')
  })
})

describe('pct / trend (jauges & croissance)', () => {
  it('pct borné [0,100], cap 0 → 0', () => {
    expect(pct(50, 100)).toBe(50)
    expect(pct(200, 100)).toBe(100)
    expect(pct(5, 0)).toBe(0)
  })
  it('trend signe le delta', () => {
    expect(trend(5, 2)).toEqual({ delta: 3, up: true })
    expect(trend(1, 4)).toEqual({ delta: -3, up: false })
  })
})

describe('formatInt localisé', () => {
  it('sépare les milliers selon la langue', () => {
    // fr-FR sépare par espace fine insécable (U+202F) ou insécable (U+00A0) selon la version
    // ICU → on normalise vers l'espace simple pour une assertion stable (piège connu fr-FR).
    expect(formatInt(1234567, 'fr').replace(/[\u202F\u00A0]/g, ' ')).toBe('1 234 567')
    expect(formatInt(1234567, 'en')).toBe('1,234,567')
  })
})
