import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { NonConformCard } from './NonConformCard'

describe('NonConformCard (mockup CEO)', () => {
  it('affiche le type court, la phrase du mockup et le bouton violet « Upgrader ! »', async () => {
    const onUpgrade = vi.fn()
    const onDismiss = vi.fn()
    render(<NonConformCard docType="rcp" onUpgrade={onUpgrade} onDismiss={onDismiss} />)

    expect(screen.getByText(/« RCP »/)).toBeInTheDocument()
    expect(screen.getByText(/non conforme au template en vigueur/)).toBeInTheDocument()

    const btn = screen.getByRole('button', { name: /Upgrader/ })
    expect(btn.className).toContain('bg-violet-600') // violet, jamais de rouge
    await userEvent.click(btn)
    expect(onUpgrade).toHaveBeenCalledOnce()

    await userEvent.click(screen.getByRole('button', { name: 'Masquer le signalement' }))
    expect(onDismiss).toHaveBeenCalledOnce()
  })

  it('types courts : étiquetage et notice', () => {
    const { rerender } = render(
      <NonConformCard docType="labeling" onUpgrade={() => {}} onDismiss={() => {}} />,
    )
    expect(screen.getByText(/« Étiquetage »/)).toBeInTheDocument()
    rerender(<NonConformCard docType="notice" onUpgrade={() => {}} onDismiss={() => {}} />)
    expect(screen.getByText(/« Notice »/)).toBeInTheDocument()
  })
})
