import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import App from '@/App'

describe('App shell', () => {
  it('affiche la navigation et redirige vers le Dashboard par défaut', async () => {
    render(<App />)

    // La navigation PRINCIPALE (sidebar app-shell, non lazy) est présente immédiatement.
    // Scopée au landmark « Navigation principale » : le pied de page reprend les mêmes libellés
    // (nav distincte « Liens de pied de page ») → on cible explicitement la barre latérale.
    const nav = screen.getByRole('navigation', { name: 'Navigation principale' })
    expect(within(nav).getByRole('link', { name: 'Catalogue' })).toBeInTheDocument()
    expect(within(nav).getByRole('link', { name: 'CTD Workspace' })).toBeInTheDocument()
    expect(within(nav).getByRole('link', { name: 'Tableau de bord' })).toBeInTheDocument()

    // La route index redirige désormais vers /dashboard (page chargée en lazy ; sans utilisateur,
    // le titre du greeting retombe sur « Tableau de bord »).
    // Timeout élargi : sous charge (suite complète, workers parallèles) l'import du chunk
    // lazy de la DashboardPage peut dépasser le défaut de 1000 ms (le h1 lui est rendu
    // synchronement, sans attendre les données).
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Tableau de bord' }, { timeout: 5000 }),
    ).toBeInTheDocument()
  })
})
