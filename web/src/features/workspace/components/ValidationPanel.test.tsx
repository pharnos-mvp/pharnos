import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import type { ReactElement } from 'react'

import { I18nProvider } from '@/lib/I18nProvider'
import type { CtdNodeDef } from '../module1-tree'
import type { RegafyFinding } from '../regafy'
import { ValidationPanel } from './ValidationPanel'

const renderI = (ui: ReactElement) => render(ui, { wrapper: I18nProvider })

const NODES: CtdNodeDef[] = [
  { id: 'n1', number: '1.1', label: 'Introduction' },
  { id: 'n2', number: '1.2.1', label: 'Analyse' },
]

const FINDINGS: RegafyFinding[] = [
  {
    id: 'e1',
    nodeNumber: '1.2.1',
    nodeLabel: 'Analyse',
    severity: 'error',
    message: 'Référence introuvable.',
    source: 'monitor',
  },
  {
    id: 'w1',
    nodeNumber: '1.1',
    nodeLabel: 'Introduction',
    severity: 'warning',
    message: 'Titre trop long.',
    source: 'monitor',
  },
  {
    id: 'o1',
    nodeNumber: '1.1',
    nodeLabel: 'Introduction',
    severity: 'warning',
    message: 'Structure validée.',
    source: 'monitor',
    ok: true,
  },
]

function setup(over: Partial<Parameters<typeof ValidationPanel>[0]> = {}) {
  const onSelectNode = vi.fn()
  renderI(
    <ValidationPanel
      pct={40}
      okCount={2}
      total={5}
      allFindings={FINDINGS}
      flatNodes={NODES}
      onSelectNode={onSelectNode}
      {...over}
    />,
  )
  return { onSelectNode }
}

describe('ValidationPanel (panneau flottant < lg)', () => {
  it('rend le donut + 3 compteurs (Validés / Avertissements / Erreurs) avec les bons comptes', () => {
    setup()
    expect(screen.getByRole('img', { name: '40%' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '1 Validés' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '1 Avertissements' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '1 Erreurs' })).toBeInTheDocument()
  })

  it('clic sur Erreurs → pop-over avec la remarque ; clic remarque → navigue + ferme', async () => {
    const { onSelectNode } = setup()
    await userEvent.click(screen.getByRole('button', { name: '1 Erreurs' }))
    const dialog = screen.getByRole('dialog', { name: 'Erreurs' })
    expect(within(dialog).getByText('Référence introuvable.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '1 Erreurs' })).toHaveAttribute(
      'aria-expanded',
      'true',
    )

    await userEvent.click(within(dialog).getByText('Référence introuvable.'))
    expect(onSelectNode).toHaveBeenCalledWith(NODES[1])
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('Échap ferme le pop-over', async () => {
    setup()
    await userEvent.click(screen.getByRole('button', { name: '1 Avertissements' }))
    expect(screen.getByRole('dialog', { name: 'Avertissements' })).toBeInTheDocument()
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('repli ‹ → masque le panneau et expose une languette de réouverture', async () => {
    setup()
    await userEvent.click(screen.getByRole('button', { name: 'Réduire le panneau' }))
    expect(screen.queryByRole('button', { name: '1 Erreurs' })).not.toBeInTheDocument()
    const reopen = screen.getByRole('button', { name: 'Afficher la validation' })
    await userEvent.click(reopen)
    expect(screen.getByRole('button', { name: '1 Erreurs' })).toBeInTheDocument()
  })

  it('constat Regafy actif → carte affichée', () => {
    setup({
      finding: {
        finding: FINDINGS[1]!,
        docType: 'rcp',
        onFill: () => {},
        onTranslate: () => {},
        onReplace: () => {},
        onDismiss: () => {},
      },
    })
    expect(screen.getByText('Constat Regafy')).toBeInTheDocument()
  })
})
