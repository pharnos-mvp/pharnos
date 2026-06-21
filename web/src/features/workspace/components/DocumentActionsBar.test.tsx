// @vitest-environment jsdom
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { buildDocActions, type TFn } from './document-header-model'
import { DocumentActionsBar } from './DocumentActionsBar'

const t: TFn = (m) => m.fr

describe('DocumentActionsBar (barre d’onglets compacte < lg)', () => {
  it('barre d’outils nommée + actions en icône seule (noms accessibles préservés)', () => {
    const actions = buildDocActions({ kind: 'piece', regafy: 'teaser', handlers: {} }, t)
    render(<DocumentActionsBar actions={actions} toolbarLabel="Actions du document" />)
    expect(screen.getByRole('toolbar', { name: 'Actions du document' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Analyser' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Traduire' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Remplacer' })).toBeInTheDocument()
  })

  it('un bouton déclenche son handler', () => {
    const reset = vi.fn()
    const actions = buildDocActions({ kind: 'form', handlers: { reset } }, t)
    render(<DocumentActionsBar actions={actions} toolbarLabel="Actions" />)
    fireEvent.click(screen.getByRole('button', { name: 'Réinitialiser' }))
    expect(reset).toHaveBeenCalledTimes(1)
  })

  it('bascule « Modifier » : aria-pressed reflète l’état d’édition', () => {
    const actions = buildDocActions(
      { kind: 'letter', aiGenerated: true, editing: true, handlers: {} },
      t,
    )
    render(<DocumentActionsBar actions={actions} toolbarLabel="Actions" />)
    expect(screen.getByRole('button', { name: 'Modifier' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('tablette : « Supprimer » surfacé = bouton ROUGE direct (pas de menu ⋯) et déclenche le handler', () => {
    const remove = vi.fn()
    const actions = buildDocActions({ kind: 'piece', surfaceRemove: true, handlers: { remove } }, t)
    render(<DocumentActionsBar actions={actions} toolbarLabel="Actions" />)
    expect(screen.queryByRole('button', { name: 'Plus d’actions' })).not.toBeInTheDocument()
    const del = screen.getByRole('button', { name: 'Supprimer' })
    expect(del.className).toContain('text-destructive') // variante danger → rouge
    fireEvent.click(del)
    expect(remove).toHaveBeenCalledTimes(1)
  })

  it('séparateurs sans bouton (#boutons === #actions non-séparateur)', () => {
    const actions = buildDocActions({ kind: 'letter', aiGenerated: true, handlers: {} }, t)
    render(<DocumentActionsBar actions={actions} toolbarLabel="Actions" />)
    const nonSep = actions.filter((a) => a.kind !== 'separator')
    expect(screen.getAllByRole('button')).toHaveLength(nonSep.length)
  })
})
