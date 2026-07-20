import { describe, expect, it } from 'vitest'

import { submissionLanguageMismatch } from './submission-language'

// Constat déterministe M4 : « langue du document ≠ langue de soumission du pays ». La langue de
// soumission provient de `officialLanguage` (roadmap-data) — FR par défaut UEMOA, EN pour les
// agences anglophones CEDEAO, PT pour la Guinée-Bissau.
describe('submissionLanguageMismatch — nudge langue de soumission (M4)', () => {
  it('ne renvoie rien sans pays sélectionné', () => {
    expect(submissionLanguageMismatch('fr', '')).toBeNull()
    expect(submissionLanguageMismatch('en', '')).toBeNull()
  })

  it('ne renvoie rien quand le document est déjà dans la langue de soumission', () => {
    // Pays francophones UEMOA → soumission FR.
    for (const c of ['BJ', 'CI', 'SN', 'TG', 'ML', 'NE', 'BF']) {
      expect(submissionLanguageMismatch('fr', c)).toBeNull()
    }
    // Pays anglophones CEDEAO → soumission EN.
    for (const c of ['NG', 'GH']) {
      expect(submissionLanguageMismatch('en', c)).toBeNull()
    }
  })

  it('signale FR quand le document est en EN pour un pays francophone (bascule possible)', () => {
    const m = submissionLanguageMismatch('en', 'BJ')
    expect(m).not.toBeNull()
    expect(m?.submissionLang).toBe('fr')
    expect(m?.canSwitch).toBe(true)
    expect(m?.submissionLangName).toEqual({ fr: 'français', en: 'French' })
  })

  it('signale EN quand le document est en FR pour un pays anglophone (bascule possible)', () => {
    const m = submissionLanguageMismatch('fr', 'NG')
    expect(m?.submissionLang).toBe('en')
    expect(m?.canSwitch).toBe(true)
    expect(m?.submissionLangName).toEqual({ fr: 'anglais', en: 'English' })
  })

  it('signale PT (Guinée-Bissau) sans bascule — l’éditeur ne produit pas le portugais', () => {
    expect(submissionLanguageMismatch('fr', 'GW')?.submissionLang).toBe('pt')
    expect(submissionLanguageMismatch('fr', 'GW')?.canSwitch).toBe(false)
    expect(submissionLanguageMismatch('en', 'GW')).toMatchObject({
      submissionLang: 'pt',
      canSwitch: false,
      submissionLangName: { fr: 'portugais', en: 'Portuguese' },
    })
  })

  it('pays inconnu → repli FR (comme officialLanguage)', () => {
    expect(submissionLanguageMismatch('fr', 'ZZ')).toBeNull()
    expect(submissionLanguageMismatch('en', 'ZZ')?.submissionLang).toBe('fr')
  })
})
