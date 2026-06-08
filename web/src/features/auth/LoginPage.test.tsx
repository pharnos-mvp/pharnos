import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { LoginPage } from './LoginPage'

describe('LoginPage (bascule des modes)', () => {
  it('passe en « mot de passe oublié » : masque le mot de passe et change le bouton', async () => {
    const user = userEvent.setup()
    render(<LoginPage />)

    expect(screen.getByLabelText('Mot de passe')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Se connecter' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Mot de passe oublié ?' }))

    expect(screen.queryByLabelText('Mot de passe')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Envoyer le lien' })).toBeInTheDocument()
  })

  it('passe en inscription : champ mot de passe conservé, bouton « Créer le compte »', async () => {
    const user = userEvent.setup()
    render(<LoginPage />)

    await user.click(
      screen.getByRole('button', { name: 'Pas encore de compte ? Créer un compte' }),
    )

    expect(screen.getByLabelText('Mot de passe')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Créer le compte' })).toBeInTheDocument()
  })
})
