// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { I18nContext, type I18nValue } from '@/lib/i18n-context'
import { OrgContext } from '@/features/org/org-context'
import { AuthContext, type AuthContextValue } from '@/features/auth/auth-context'
import { VariationLetterFlow } from './VariationLetterFlow'

const AUTH: AuthContextValue = {
  session: null,
  user: null,
  loading: false,
  recovery: false,
  clearRecovery: () => {},
  signOut: async () => {},
}

function renderFlow() {
  const i18n: I18nValue = { lang: 'fr', setLang: () => {}, t: (s) => s.fr }
  render(
    <I18nContext.Provider value={i18n}>
      <AuthContext.Provider value={AUTH}>
        <OrgContext.Provider value="org-test">
          <VariationLetterFlow onBack={() => {}} />
        </OrgContext.Provider>
      </AuthContext.Provider>
    </I18nContext.Provider>,
  )
}

describe('VariationLetterFlow', () => {
  it('phase formulaire : sélecteur 2 colonnes, intro, actions désactivées tant que rien n’est prêt', () => {
    renderFlow()
    expect(screen.getByText('Variation mineure')).toBeInTheDocument()
    expect(screen.getByText('Variation majeure')).toBeInTheDocument()
    expect(screen.getByText(/Cochez la \(les\) variation/)).toBeInTheDocument() // intro
    expect(screen.getByRole('button', { name: /Ouvrir la lettre/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: /Annexe/ })).toBeDisabled()
  })
})
