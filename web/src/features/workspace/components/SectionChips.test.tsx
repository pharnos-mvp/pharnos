import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import type { ReactElement } from 'react'

import { I18nProvider } from '@/lib/I18nProvider'
import type { CtdNodeDef } from '../module1-tree'
import { buildSectionChips } from './section-chips-model'
import { SectionChips } from './SectionChips'

const renderI = (ui: ReactElement) => render(ui, { wrapper: I18nProvider })

const NODES: CtdNodeDef[] = [
  { id: 'n0', number: '1.0', label: 'Table des matières' },
  { id: 'n1', number: '1.1', label: 'Introduction' },
  { id: 'n2', number: '1.2', label: 'Développement' },
]

describe('buildSectionChips (dérivation pure)', () => {
  it('marque l’actif, le contenu et le signalement', () => {
    const countFor = (n: CtdNodeDef) => (n.number === '1.1' ? 2 : 0)
    const flagged = new Set(['1.2'])
    const chips = buildSectionChips(NODES, NODES[1]!, countFor, flagged)

    expect(chips.map((c) => c.number)).toEqual(['1.0', '1.1', '1.2'])
    expect(chips[1]).toMatchObject({ active: true, hasContent: true, flagged: false })
    expect(chips[0]).toMatchObject({ active: false, hasContent: false, flagged: false })
    expect(chips[2]).toMatchObject({ active: false, hasContent: false, flagged: true })
  })

  it('aucune sélection → aucune pastille active', () => {
    const chips = buildSectionChips(NODES, null, () => 0, new Set())
    expect(chips.some((c) => c.active)).toBe(false)
  })
})

describe('SectionChips (composant)', () => {
  const chips = () =>
    buildSectionChips(NODES, NODES[0]!, (n) => (n.number === '1.1' ? 1 : 0), new Set(['1.2']))

  it('rend une pastille par section avec nom accessible « n° libellé » et aria-current sur l’actif', () => {
    renderI(<SectionChips chips={chips()} onSelect={() => {}} />)
    const nav = screen.getByRole('navigation', { name: 'Sections du dossier' })
    expect(nav).toBeInTheDocument()
    const active = screen.getByRole('button', { name: '1.0 Table des matières' })
    expect(active).toHaveAttribute('aria-current', 'true')
    expect(active).toHaveAttribute('tabindex', '0')
    // Pastille non active : hors séquence de tabulation (roving tabindex).
    expect(screen.getByRole('button', { name: '1.1 Introduction' })).toHaveAttribute(
      'tabindex',
      '-1',
    )
  })

  it('clic sur une pastille → onSelect avec le nœud', async () => {
    const onSelect = vi.fn()
    renderI(<SectionChips chips={chips()} onSelect={onSelect} />)
    await userEvent.click(screen.getByRole('button', { name: '1.2 Développement' }))
    expect(onSelect).toHaveBeenCalledWith(NODES[2])
  })

  it('←/→ déplacent le focus entre pastilles sans sélectionner', async () => {
    const onSelect = vi.fn()
    renderI(<SectionChips chips={chips()} onSelect={onSelect} />)
    const first = screen.getByRole('button', { name: '1.0 Table des matières' })
    first.focus()
    await userEvent.keyboard('{ArrowRight}')
    expect(screen.getByRole('button', { name: '1.1 Introduction' })).toHaveFocus()
    expect(onSelect).not.toHaveBeenCalled()
    await userEvent.keyboard('{End}')
    expect(screen.getByRole('button', { name: '1.2 Développement' })).toHaveFocus()
  })
})
