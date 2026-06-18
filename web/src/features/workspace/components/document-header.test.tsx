// @vitest-environment jsdom
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { FileText } from 'lucide-react'

import { buildDocActions, type DocActionsContext, type TFn } from './document-header-model'
import { DocumentHeader } from './DocumentHeader'

const t: TFn = (m) => m.fr
const keys = (ctx: DocActionsContext) => buildDocActions(ctx, t).map((a) => a.key)

describe('buildDocActions — boutons adaptatifs par type de document', () => {
  it('lettre IA : Modifier→sep→Régénérer→Signer→En-tête→Télécharger→Téléverser→⋯', () => {
    expect(keys({ kind: 'letter', aiGenerated: true, handlers: {} })).toEqual([
      'edit',
      'sep1',
      'regenerate',
      'sign',
      'branding',
      'download',
      'upload',
      'more',
    ])
  })

  it('lettre non générée par IA : pas de « Régénérer »', () => {
    expect(keys({ kind: 'letter', aiGenerated: false, handlers: {} })).not.toContain('regenerate')
  })

  it('lettre analysable (traduction / version conforme) : « Analyser » présent, sauf Regafy masqué', () => {
    expect(keys({ kind: 'letter', analyzable: true, regafy: 'enabled', handlers: {} })).toContain(
      'analyze',
    )
    expect(
      keys({ kind: 'letter', analyzable: true, regafy: 'hidden', handlers: {} }),
    ).not.toContain('analyze')
    expect(keys({ kind: 'letter', handlers: {} })).not.toContain('analyze')
  })

  it('formulaire : Réinitialiser→Télécharger→Téléverser→⋯ ; Notice ajoute « Réglages »', () => {
    expect(keys({ kind: 'form', handlers: {} })).toEqual(['reset', 'download', 'upload', 'more'])
    expect(keys({ kind: 'form', hasGlobals: true, handlers: {} })).toEqual([
      'settings',
      'reset',
      'download',
      'upload',
      'more',
    ])
  })

  it('pièce : « Analyser » présent si Regafy actif/vitrine, absent si masqué', () => {
    expect(keys({ kind: 'piece', regafy: 'enabled', handlers: {} })).toEqual([
      'analyze',
      'download',
      'replace',
      'more',
    ])
    expect(keys({ kind: 'piece', regafy: 'teaser', handlers: {} })).toContain('analyze')
    expect(keys({ kind: 'piece', regafy: 'hidden', handlers: {} })).toEqual([
      'download',
      'replace',
      'more',
    ])
  })

  it('page de garde (Autogénéré, pressé) et nœud vide (Générer, solid) + Téléverser', () => {
    const cover = buildDocActions({ kind: 'cover', handlers: {} }, t)
    expect(cover.map((a) => a.key)).toEqual(['auto', 'upload'])
    expect(cover[0]!.pressed).toBe(true)
    // Nœud à template sans doc → Générer + Téléverser ; nœud sans template → Téléverser seul.
    const empty = buildDocActions({ kind: 'empty', canGenerate: true, handlers: {} }, t)
    expect(empty.map((a) => a.key)).toEqual(['generate', 'upload'])
    expect(empty[0]!.variant).toBe('solid')
    expect(buildDocActions({ kind: 'empty', handlers: {} }, t).map((a) => a.key)).toEqual([
      'upload',
    ])
  })

  it('Télécharger = menu PDF/DOCX ; ⋯ = Supprimer (destructif) ; handlers câblés', () => {
    const reset = vi.fn()
    const pdf = vi.fn()
    const remove = vi.fn()
    const acts = buildDocActions({ kind: 'form', handlers: { reset, downloadPdf: pdf, remove } }, t)
    const dl = acts.find((a) => a.key === 'download')!
    expect(dl.kind).toBe('menu')
    expect(dl.menu!.map((m) => m.key)).toEqual(['pdf', 'docx'])
    const more = acts.find((a) => a.key === 'more')!
    expect(more.menu![0]!.destructive).toBe(true)
    acts.find((a) => a.key === 'reset')!.onClick!()
    expect(reset).toHaveBeenCalledTimes(1)
    dl.menu!.find((m) => m.key === 'pdf')!.onSelect()
    expect(pdf).toHaveBeenCalledTimes(1)
  })

  it('Signer : désactivé hors mode édition, actif en édition (anti-mutation read-only)', () => {
    const view = buildDocActions({ kind: 'letter', handlers: {} }, t).find((a) => a.key === 'sign')!
    expect(view.disabled).toBe(true)
    const editing = buildDocActions({ kind: 'letter', editing: true, handlers: {} }, t).find(
      (a) => a.key === 'sign',
    )!
    expect(editing.disabled).toBe(false)
  })

  it('Analyser : désactivé si analyse réelle indisponible (activé) ; cliquable en Vitrine', () => {
    const off = buildDocActions(
      { kind: 'piece', regafy: 'enabled', analyzeDisabled: true, handlers: {} },
      t,
    ).find((a) => a.key === 'analyze')!
    expect(off.disabled).toBe(true)
    const teaser = buildDocActions(
      { kind: 'piece', regafy: 'teaser', analyzeDisabled: true, handlers: {} },
      t,
    ).find((a) => a.key === 'analyze')!
    expect(teaser.disabled).toBe(false)
  })

  it('pièce : « Générer » si nœud à template sans doc ; « Traduire » (upsell) en Vitrine', () => {
    expect(keys({ kind: 'piece', regafy: 'enabled', canGenerate: true, handlers: {} })).toContain(
      'generate',
    )
    expect(keys({ kind: 'piece', regafy: 'teaser', handlers: {} })).toContain('translate')
    expect(keys({ kind: 'piece', regafy: 'enabled', handlers: {} })).not.toContain('translate')
  })
})

describe('DocumentHeader — rendu (cadre unique, actions à droite)', () => {
  it('rend identité (numéro/titre/statut) + barre d’actions des boutons du type', () => {
    const actions = buildDocActions({ kind: 'letter', aiGenerated: true, handlers: {} }, t)
    render(
      <DocumentHeader
        number="1.1.1"
        title="Lettre de demande d'AMM"
        subtitle="Module 1 · Correspondance"
        status={{ tone: 'draft', label: 'Brouillon', icon: FileText }}
        actions={actions}
        toolbarLabel="Actions du document"
      />,
    )
    expect(screen.getByText('1.1.1')).toBeInTheDocument()
    expect(screen.getByText("Lettre de demande d'AMM")).toBeInTheDocument()
    expect(screen.getByText('Brouillon')).toBeInTheDocument()
    expect(screen.getByRole('toolbar', { name: 'Actions du document' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Modifier/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Régénérer/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Plus d’actions/ })).toBeInTheDocument()
  })

  it('« Modifier » est une bascule (aria-pressed) ; formatSlot rendu en édition', () => {
    const actions = buildDocActions(
      { kind: 'letter', aiGenerated: true, editing: true, handlers: {} },
      t,
    )
    render(
      <DocumentHeader
        title="Lettre"
        actions={actions}
        toolbarLabel="Actions"
        formatSlot={<div data-testid="fmt">FMT</div>}
      />,
    )
    expect(screen.getByRole('button', { name: /Modifier/ })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('fmt')).toBeInTheDocument()
  })

  it('un bouton déclenche son handler (Réinitialiser)', () => {
    const reset = vi.fn()
    const actions = buildDocActions({ kind: 'form', handlers: { reset } }, t)
    render(<DocumentHeader title="RCP" actions={actions} toolbarLabel="Actions" />)
    fireEvent.click(screen.getByRole('button', { name: /Réinitialiser/ }))
    expect(reset).toHaveBeenCalledTimes(1)
  })
})
