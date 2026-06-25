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
  it('header (produit/pays) + MULTI-sélecteurs de variants (mineure | majeure) + formulaire SANS condition', () => {
    renderFlow()
    // Header : Catalogue (ex-« Produit ») + pays cible + En-tête & signature, tout sur la même ligne.
    expect(screen.getByText('Catalogue')).toBeInTheDocument()
    expect(screen.getByText('Pays cible')).toBeInTheDocument()
    expect(screen.getByText('En-tête & signature')).toBeInTheDocument()
    expect(screen.getByText('Variation mineure')).toBeInTheDocument()
    expect(screen.getByText('Variation majeure')).toBeInTheDocument()
    // Bouton Réinitialiser (comme les autres formulaires).
    expect(screen.getByRole('button', { name: /Réinitialiser/i })).toBeInTheDocument()
    // Variants = MENUS DÉROULANTS À CASES (multi-sélection) → triggers « une ou plusieurs », pas
    // des <select> natifs : on peut cocher plusieurs natures de différents types d'un coup.
    expect(
      screen.getByRole('button', { name: /une ou plusieurs variations mineures/i }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /une ou plusieurs variations majeures/i }),
    ).toBeInTheDocument()
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
