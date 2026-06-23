// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { I18nContext, type I18nValue, type Lang } from '@/lib/i18n-context'
import { VariationsPage } from './VariationsPage'

function renderPage(lang: Lang = 'fr') {
  const value: I18nValue = { lang, setLang: () => {}, t: (s) => s[lang] }
  return render(
    <I18nContext.Provider value={value}>
      <VariationsPage />
    </I18nContext.Provider>,
  )
}

describe('VariationsPage (encyclopédie)', () => {
  it('rend le titre, le compteur (42) et une variation connue', () => {
    renderPage('fr')
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Variations')
    expect(screen.getByRole('button', { name: /Toutes/ }).textContent).toContain('42')
    expect(screen.getByText('Diminution du prix')).toBeInTheDocument()
  })

  it('affiche par défaut le détail de la variation n°1 (pièces du jeu mineur)', () => {
    renderPage('fr')
    expect(screen.getByText('Pièces à fournir')).toBeInTheDocument()
    expect(screen.getByText('Lettre de demande')).toBeInTheDocument()
    expect(screen.getByText('Échantillon et/ou maquette')).toBeInTheDocument()
    expect(screen.getByText('Sans Module 1')).toBeInTheDocument()
  })

  it('le filtre « Majeures » retire les mineures (n°8) et garde les majeures (n°39)', () => {
    renderPage('fr')
    fireEvent.click(screen.getByRole('button', { name: /Majeures/ }))
    expect(screen.queryByText('Diminution du prix')).not.toBeInTheDocument()
    expect(screen.getByText('Augmentation du prix')).toBeInTheDocument()
  })

  it('sélectionner une variation montre sa note (n°8 = lettre seule)', () => {
    renderPage('fr')
    fireEvent.click(screen.getByText('Diminution du prix'))
    expect(screen.getByText(/seule variation à ne pas exiger/)).toBeInTheDocument()
  })

  it('rend en anglais et inclut le filet « Autre »', () => {
    renderPage('en')
    expect(screen.getByText('Price decrease')).toBeInTheDocument()
    expect(screen.getByText('Other variation — not listed')).toBeInTheDocument()
  })
})
