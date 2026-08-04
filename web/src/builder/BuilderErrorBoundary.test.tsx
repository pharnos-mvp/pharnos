import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { BuilderErrorBoundary } from './BuilderErrorBoundary'

/**
 * Une frontière d'erreur non testée n'en est pas une : elle ne sert que le jour où tout va mal,
 * c'est-à-dire le jour où personne ne la vérifiera à la main.
 *
 * Le cas réel qu'elle couvre : `useLiveQuery` RELANCE l'erreur pendant le rendu quand IndexedDB
 * refuse de s'ouvrir (navigation privée, stockage bloqué par une politique d'entreprise). Sans
 * frontière, React démonte la racine — page blanche, aucun message, sur un produit payant.
 */
function Explose(): never {
  throw new Error('MissingAPIError: IndexedDB API missing')
}

describe('BuilderErrorBoundary', () => {
  afterEach(() => vi.restoreAllMocks())

  it('laisse passer ses enfants quand tout va bien', () => {
    render(
      <BuilderErrorBoundary>
        <p>Vos dossiers</p>
      </BuilderErrorBoundary>,
    )
    expect(screen.getByText('Vos dossiers')).toBeInTheDocument()
  })

  it("remplace l'écran blanc par une explication actionnable, sans rien émettre", () => {
    // React journalise l'erreur rattrapée : on tait le bruit sans masquer le comportement testé.
    vi.spyOn(console, 'error').mockImplementation(() => {})

    render(
      <BuilderErrorBoundary>
        <Explose />
      </BuilderErrorBoundary>,
    )

    const alerte = screen.getByRole('alert')
    expect(alerte).toHaveTextContent('Vos dossiers sont inaccessibles sur ce poste.')
    // La cause probable est NOMMÉE : c'est ce qui fait la différence entre un message et une aide.
    expect(alerte).toHaveTextContent(/navigation privée/i)
    // Et la nature de l'erreur reste lisible pour un support technique.
    expect(alerte).toHaveTextContent(/IndexedDB API missing/)
  })
})
