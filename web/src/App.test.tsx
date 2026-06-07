import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import App from '@/App'

describe('App shell', () => {
  it('affiche la navigation et redirige vers le Catalogue par défaut', async () => {
    render(<App />)

    // La navigation principale (app-shell, non lazy) est présente immédiatement
    expect(screen.getByRole('link', { name: 'Catalogue' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'CTD Workspace' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Tableau de bord' })).toBeInTheDocument()

    // La route index redirige vers /catalogue (page chargée en lazy)
    expect(await screen.findByRole('heading', { level: 1, name: 'Catalogue' })).toBeInTheDocument()
  })
})
