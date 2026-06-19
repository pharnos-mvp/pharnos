import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import App from '@/App'

describe('App shell', () => {
  it('affiche la navigation et redirige vers le Catalogue par défaut', async () => {
    render(<App />)

    // La navigation PRINCIPALE (sidebar app-shell, non lazy) est présente immédiatement.
    // Scopée au landmark « Navigation principale » : le pied de page reprend les mêmes libellés
    // (nav distincte « Liens de pied de page ») → on cible explicitement la barre latérale.
    const nav = screen.getByRole('navigation', { name: 'Navigation principale' })
    expect(within(nav).getByRole('link', { name: 'Catalogue' })).toBeInTheDocument()
    expect(within(nav).getByRole('link', { name: 'CTD Workspace' })).toBeInTheDocument()
    expect(within(nav).getByRole('link', { name: 'Tableau de bord' })).toBeInTheDocument()

    // La route index redirige vers /catalogue (page chargée en lazy)
    expect(await screen.findByRole('heading', { level: 1, name: 'Catalogue' })).toBeInTheDocument()
  })
})
