import { describe, expect, it } from 'vitest'

import { COUNTRY_OFFICIAL_LANG, officialLang } from './recipient-lang'

// Parité CONTRACTUELLE avec le cœur Edge (`_shared/lifecycle-reminders-core.ts` :
// COUNTRY_OFFICIAL_LANG / officialLang). Ce littéral est la copie attendue ; toute divergence
// entre le web et l'Edge casse ce test → on répercute des deux côtés (le cron applique CE défaut
// quand `recipient_lang` est null). Les Edge Functions ne peuvent pas importer `web/src`.
const EXPECTED: Record<string, 'fr' | 'en'> = {
  BJ: 'fr',
  BF: 'fr',
  CI: 'fr',
  GW: 'fr', // Guinée-Bissau lusophone → repli FR (app FR/EN)
  ML: 'fr',
  NE: 'fr',
  SN: 'fr',
  TG: 'fr',
  NG: 'en',
  GH: 'en',
}

describe('officialLang — langue par défaut du destinataire selon le pays', () => {
  it('correspond au référentiel de parité (miroir du cœur Edge)', () => {
    expect({ ...COUNTRY_OFFICIAL_LANG }).toEqual(EXPECTED)
  })

  it('résout chaque pays du référentiel', () => {
    for (const [country, lang] of Object.entries(EXPECTED)) {
      expect(officialLang(country)).toBe(lang)
    }
  })

  it('pays inconnu → repli FR', () => {
    expect(officialLang('ZZ')).toBe('fr')
    expect(officialLang('')).toBe('fr')
  })
})
