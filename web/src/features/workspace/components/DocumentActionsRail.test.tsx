import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { buildDocActions, type TFn } from './document-header-model'
import { DocumentActionsRail } from './DocumentActionsRail'

const t: TFn = (m) => m.fr

describe('DocumentActionsRail (rail vertical < lg)', () => {
  it('barre d’outils verticale nommée + actions en icône seule (noms accessibles préservés)', () => {
    const actions = buildDocActions({ kind: 'piece', regafy: 'teaser', handlers: {} }, t)
    render(<DocumentActionsRail actions={actions} toolbarLabel="Actions du document" />)
    const tb = screen.getByRole('toolbar', { name: 'Actions du document' })
    expect(tb).toHaveAttribute('aria-orientation', 'vertical')
    expect(screen.getByRole('button', { name: 'Analyser' })).toBeInTheDocument()
    // Régression : « Traduire » a désormais une icône → bouton non vide dans le rail icône-seule.
    expect(screen.getByRole('button', { name: 'Traduire' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Remplacer' })).toBeInTheDocument()
  })

  it('un bouton déclenche son handler', () => {
    const reset = vi.fn()
    const actions = buildDocActions({ kind: 'form', handlers: { reset } }, t)
    render(<DocumentActionsRail actions={actions} toolbarLabel="Actions" />)
    fireEvent.click(screen.getByRole('button', { name: 'Réinitialiser' }))
    expect(reset).toHaveBeenCalledTimes(1)
  })

  it('bascule « Modifier » : aria-pressed reflète l’état d’édition', () => {
    const actions = buildDocActions(
      { kind: 'letter', aiGenerated: true, editing: true, handlers: {} },
      t,
    )
    render(<DocumentActionsRail actions={actions} toolbarLabel="Actions" />)
    expect(screen.getByRole('button', { name: 'Modifier' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('menus présents (Télécharger / Plus d’actions) et séparateurs sans bouton', () => {
    const actions = buildDocActions({ kind: 'letter', aiGenerated: true, handlers: {} }, t)
    render(<DocumentActionsRail actions={actions} toolbarLabel="Actions" />)
    expect(screen.getByRole('button', { name: 'Plus d’actions' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Téléverser' })).toBeInTheDocument()
    // Un séparateur ne produit pas de bouton : #boutons === #actions non-séparateur.
    const nonSep = actions.filter((a) => a.kind !== 'separator')
    expect(screen.getAllByRole('button')).toHaveLength(nonSep.length)
  })
})
