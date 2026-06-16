import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { I18nProvider } from '@/lib/I18nProvider'
import { LoginPage } from './LoginPage'
import { signInWithGoogle } from './auth-repository'

// Drapeau OFF par défaut en prod (tant que le provider Google n'est pas configuré côté
// Supabase) ; on l'active ici pour vérifier le rendu et le câblage du bouton.
vi.mock('@/lib/env', () => ({
  env: {
    googleAuthEnabled: true,
    isSupabaseConfigured: false,
    supabaseUrl: '',
    supabaseAnonKey: '',
    sentryDsn: '',
  },
}))

vi.mock('./auth-repository', () => ({
  requestPasswordReset: vi.fn(),
  resendSignupConfirmation: vi.fn(),
  signInWithGoogle: vi.fn().mockResolvedValue(undefined),
}))

afterEach(() => {
  vi.clearAllMocks()
})

describe('LoginPage (bascule des modes)', () => {
  it('passe en « mot de passe oublié » : masque le mot de passe et change le bouton', async () => {
    const user = userEvent.setup()
    render(
      <I18nProvider>
        <LoginPage />
      </I18nProvider>,
    )

    expect(screen.getByLabelText('Mot de passe')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Se connecter' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Mot de passe oublié ?' }))

    expect(screen.queryByLabelText('Mot de passe')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Envoyer le lien' })).toBeInTheDocument()
  })

  it('passe en inscription : champ mot de passe conservé, bouton « Créer le compte »', async () => {
    const user = userEvent.setup()
    render(
      <I18nProvider>
        <LoginPage />
      </I18nProvider>,
    )

    await user.click(screen.getByRole('button', { name: 'Pas encore de compte ? Créer un compte' }))

    expect(screen.getByLabelText('Mot de passe')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Créer le compte' })).toBeInTheDocument()
  })

  it('affiche le bouton Google et déclenche la connexion OAuth au clic', async () => {
    const user = userEvent.setup()
    render(
      <I18nProvider>
        <LoginPage />
      </I18nProvider>,
    )

    await user.click(screen.getByRole('button', { name: 'Continuer avec Google' }))
    expect(vi.mocked(signInWithGoogle)).toHaveBeenCalledOnce()
  })

  it('masque le bouton Google en mode « mot de passe oublié »', async () => {
    const user = userEvent.setup()
    render(
      <I18nProvider>
        <LoginPage />
      </I18nProvider>,
    )

    expect(screen.getByRole('button', { name: 'Continuer avec Google' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Mot de passe oublié ?' }))
    expect(screen.queryByRole('button', { name: 'Continuer avec Google' })).not.toBeInTheDocument()
  })
})
