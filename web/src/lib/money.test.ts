import { describe, expect, it } from 'vitest'

import { EUR_TO_XOF, eurStringToFcfa, eurToXof, formatMoney, parseAmount, zoneFcfa } from './money'

describe('parité EUR↔XOF (BCEAO, fixe)', () => {
  it('applique la parité officielle immuable 1 EUR = 655,957 XOF', () => {
    expect(EUR_TO_XOF).toBe(655.957)
    // Exemple CEO : 3 € → 1967,87 FCFA.
    expect(eurToXof(3)).toBeCloseTo(1967.871, 3)
  })
})

describe('parseAmount', () => {
  it('accepte entiers, décimales (virgule ou point) et espaces de milliers', () => {
    expect(parseAmount('2500')).toBe(2500)
    expect(parseAmount('3,5')).toBe(3.5)
    expect(parseAmount('3.5')).toBe(3.5)
    expect(parseAmount('1 000')).toBe(1000)
  })

  it('rejette vide, non numérique et négatif → null', () => {
    expect(parseAmount('')).toBeNull()
    expect(parseAmount('  ')).toBeNull()
    expect(parseAmount('abc')).toBeNull()
    expect(parseAmount('-1')).toBeNull()
  })

  it('rejette hexadécimal, notation scientifique et point final (formes exotiques de Number())', () => {
    expect(parseAmount('0x10')).toBeNull()
    expect(parseAmount('1e3')).toBeNull()
    expect(parseAmount('3.')).toBeNull()
  })
})

describe('formatMoney', () => {
  it('formate avec la virgule décimale en fr, le point en en, sans séparateur de milliers', () => {
    expect(formatMoney(1967.871, 'fr')).toBe('1967,87')
    expect(formatMoney(1967.871, 'en')).toBe('1967.87')
    expect(formatMoney(2500, 'fr')).toBe('2500')
  })
})

describe('eurStringToFcfa', () => {
  it('convertit une saisie EUR en FCFA formaté (exemple CEO)', () => {
    expect(eurStringToFcfa('3', 'fr')).toBe('1967,87')
    expect(eurStringToFcfa('3', 'en')).toBe('1967.87')
  })

  it('rend une chaîne vide sur saisie invalide', () => {
    expect(eurStringToFcfa('', 'fr')).toBe('')
    expect(eurStringToFcfa('abc', 'fr')).toBe('')
  })
})

describe('zoneFcfa — « euro (FCFA) » en Afrique, euro seul ailleurs', () => {
  /** Force le fuseau rendu par `Intl` le temps d'un cas ; `null` simule un `Intl` cassé. */
  function avecFuseau(tz: string | null, verifier: () => void) {
    const vrai = Intl.DateTimeFormat
    Intl.DateTimeFormat = function (...args: unknown[]) {
      const inst = new (vrai as unknown as new (...a: unknown[]) => Intl.DateTimeFormat)(...args)
      if (tz === null) throw new Error('Intl indisponible')
      return { ...inst, resolvedOptions: () => ({ ...inst.resolvedOptions(), timeZone: tz }) }
    } as unknown as typeof Intl.DateTimeFormat
    try {
      verifier()
    } finally {
      Intl.DateTimeFormat = vrai
    }
  }

  it('montre le FCFA sur le continent, y compris hors zone franc et sur les îles', () => {
    for (const tz of [
      'Africa/Porto-Novo',
      'Africa/Abidjan',
      'Africa/Dakar',
      'Africa/Cairo',
      'Indian/Antananarivo',
      'Atlantic/Cape_Verde',
    ]) {
      avecFuseau(tz, () => expect(zoneFcfa(), tz).toBe(true))
    }
  })

  it("l'omet sur les autres continents", () => {
    for (const tz of ['Europe/Paris', 'America/New_York', 'Asia/Tokyo', 'Australia/Sydney']) {
      avecFuseau(tz, () => expect(zoneFcfa(), tz).toBe(false))
    }
  })

  // Le contrat de cette fonction. Cacher le FCFA à qui paiera en FCFA est l'erreur qui coûte
  // (cf. le commentaire de `prixDouble` côté landing) ; l'inverse ne coûte rien.
  it('retombe sur « les deux devises » quand le fuseau est absent, inconnu ou illisible', () => {
    avecFuseau('', () => expect(zoneFcfa()).toBe(true))
    avecFuseau(null, () => expect(zoneFcfa()).toBe(true))
  })
})
