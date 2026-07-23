import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { I18nProvider } from '@/lib/I18nProvider'
import { DocumentsSection } from './DocumentsSection'

// Pas de Dexie ni de réseau : on isole le formulaire (la liste `useLiveQuery` renvoie []).
vi.mock('./documents-repository', () => ({
  listDocuments: () => Promise.resolve([]),
  addDocument: vi.fn(() => Promise.resolve()),
  deleteDocument: vi.fn(() => Promise.resolve()),
  getDocumentBlob: vi.fn(() => Promise.resolve(null)),
}))
vi.mock('./catalogue-sync', () => ({ syncCatalogue: vi.fn() }))
vi.mock('./documents-sync', () => ({ downloadDocumentBlob: vi.fn(() => Promise.resolve(null)) }))

// radix Select s'appuie sur ces API de pointeur que jsdom n'implémente pas.
beforeAll(() => {
  Element.prototype.hasPointerCapture = () => false
  Element.prototype.setPointerCapture = () => {}
  Element.prototype.releasePointerCapture = () => {}
})

const renderI = (ui: React.ReactElement) => render(ui, { wrapper: I18nProvider })

describe('DocumentsSection — garde-fou dates (Monitor)', () => {
  it('AMM : émission postérieure à expiration → rouge + ajout bloqué ; changer de type lève le blocage', async () => {
    const user = userEvent.setup()
    const { container } = renderI(<DocumentsSection orgId="o1" productId="p1" category="admin" />)

    // Ouvre le formulaire (type par défaut = AMM → champs Date d'émission + Date d'expiration).
    await user.click(screen.getByRole('button', { name: 'Ajouter un document' }))
    const dates = () => container.querySelectorAll<HTMLInputElement>('input[type="date"]')
    fireEvent.change(dates()[0]!, { target: { value: '2031-05-01' } }) // émission
    fireEvent.change(dates()[1]!, { target: { value: '2031-01-01' } }) // expiration (antérieure)

    // Point 1 : rien pendant la frappe ; l'erreur n'apparaît qu'au blur.
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    fireEvent.blur(dates()[1]!)

    // Erreur signalée en rouge + submit verrouillé.
    expect(dates()[0]!).toHaveAttribute('aria-invalid', 'true')
    expect(dates()[1]!).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ajouter le document' })).toBeDisabled()

    // Bascule vers GMP (aucune date d'émission) : le garde-fou ne s'applique plus (isAmm=false) —
    // pas de formulaire figé sur un champ devenu invisible (le défaut corrigé). Deux comboboxes
    // en AMM (type + pays) → on cible explicitement celui du TYPE.
    await user.click(screen.getByRole('combobox', { name: 'Type de document' }))
    await user.click(screen.getByRole('option', { name: /GMP/ }))

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ajouter le document' })).toBeEnabled()
  })
})
