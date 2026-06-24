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
  it('header compact (produit/pays) + VariationPicker 2 colonnes (mineure | majeure) + formulaire SANS condition', () => {
    renderFlow()
    // Header compact : produit + pays cible = simples raccourcis.
    expect(screen.getByText('Produit')).toBeInTheDocument()
    expect(screen.getByText('Pays cible')).toBeInTheDocument()
    // Natures de variation via le VariationPicker (2 colonnes À COCHER, comme le CTD workspace) :
    // bornées/scrollables, le texte s'enroule → jamais de débordement (≠ <select> natif).
    expect(screen.getByText('Variation mineure')).toBeInTheDocument()
    expect(screen.getByText('Variation majeure')).toBeInTheDocument()
    expect(screen.getAllByRole('checkbox').length).toBeGreaterThan(10)
    // Corps en deux onglets.
    expect(screen.getByRole('tab', { name: 'Lettre' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /Tableau/ })).toBeInTheDocument()
    // Le formulaire à cases s'affiche SANS produit/variation enregistré (clic carte → formulaire).
    expect(screen.getByText(/Objet/)).toBeInTheDocument()
    // Les actions (PDF/DOCX) ne sont que des raccourcis → toujours disponibles.
    expect(screen.getByRole('button', { name: /PDF/ })).toBeEnabled()
    expect(screen.getByRole('button', { name: /DOCX/ })).toBeEnabled()
  })
})
