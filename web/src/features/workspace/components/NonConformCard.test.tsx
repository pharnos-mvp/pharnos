import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import type { RegafyFinding } from '../regafy'
import { NonConformCard } from './NonConformCard'

const finding = (over: Partial<RegafyFinding> = {}): RegafyFinding => ({
  id: 'f1',
  nodeNumber: '1.3.1',
  nodeLabel: 'RCP',
  severity: 'warning',
  message:
    'RCP : non conforme au template en vigueur et rédigé en EN — langue officielle du Bénin : français.',
  source: 'ai',
  pieceId: 'p1',
  upgrade: true,
  ...over,
})

describe('NonConformCard (carte de constat — politique recette n°6)', () => {
  it('document à template non conforme ET non-FR : Remplir le template / Traduire / Remplacer', async () => {
    const onFill = vi.fn()
    const onTranslate = vi.fn()
    const onReplace = vi.fn()
    render(
      <NonConformCard
        finding={finding({ translate: true, language: 'en' })}
        docType="rcp"
        onFill={onFill}
        onTranslate={onTranslate}
        onReplace={onReplace}
        onDismiss={() => {}}
      />,
    )
    expect(screen.getByText('RCP')).toBeInTheDocument()
    expect(
      screen.getByText(/non conforme au template en vigueur et rédigé en EN/),
    ).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /Remplir le template/ }))
    expect(onFill).toHaveBeenCalledOnce()
    await userEvent.click(screen.getByRole('button', { name: /^Traduire$/ }))
    expect(onTranslate).toHaveBeenCalledOnce()
    await userEvent.click(screen.getByRole('button', { name: /Remplacer/ }))
    expect(onReplace).toHaveBeenCalledOnce()
  })

  it('document à template conforme à la structure mais non-FR : pas de Traduire sans flag', () => {
    render(
      <NonConformCard
        finding={finding({ translate: undefined })}
        docType="notice"
        onFill={() => {}}
        onTranslate={() => {}}
        onReplace={() => {}}
        onDismiss={() => {}}
      />,
    )
    expect(screen.getByRole('button', { name: /Remplir le template/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Traduire$/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Remplacer/ })).toBeInTheDocument()
  })

  it('pièce administrative (validité) : Remplacer uniquement', async () => {
    const onDismiss = vi.fn()
    render(
      <NonConformCard
        finding={finding({
          upgrade: undefined,
          message: 'GMP expiré (2026-04-29).',
          severity: 'error',
        })}
        docType="gmp"
        onFill={() => {}}
        onTranslate={() => {}}
        onReplace={() => {}}
        onDismiss={onDismiss}
      />,
    )
    expect(screen.getByText('GMP')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Remplir le template/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Traduire$/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Remplacer/ })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Masquer le signalement' }))
    expect(onDismiss).toHaveBeenCalledOnce()
  })
})
