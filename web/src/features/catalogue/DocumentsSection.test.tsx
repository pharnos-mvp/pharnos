import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { db, type DocumentRecord, type PartyRecord, type ProductRecord } from '@/lib/db'
import { I18nProvider } from '@/lib/I18nProvider'
import { DocumentsSection } from './DocumentsSection'
import { copyDocumentToProduct } from './documents-reuse'

// Pas de Dexie ni de réseau : on isole le formulaire (la liste `useLiveQuery` renvoie []).
vi.mock('./documents-repository', () => ({
  listDocuments: () => Promise.resolve([]),
  addDocument: vi.fn(() => Promise.resolve()),
  deleteDocument: vi.fn(() => Promise.resolve()),
  getDocumentBlob: vi.fn(() => Promise.resolve(null)),
  cacheDocumentBlob: vi.fn(() => Promise.resolve()),
}))
vi.mock('./catalogue-sync', () => ({ syncCatalogue: vi.fn() }))
vi.mock('./documents-sync', () => ({ downloadDocumentBlob: vi.fn(() => Promise.resolve(null)) }))
// La COPIE réelle (blob) est testée dans documents-reuse.test — ici on vérifie le CBLAGE UI.
vi.mock('./documents-reuse', async (importOriginal) => {
  const real = await importOriginal<typeof import('./documents-reuse')>()
  return { ...real, copyDocumentToProduct: vi.fn(() => Promise.resolve({})) }
})

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

describe('DocumentsSection — « Depuis la base » (§2, pioche org → produit)', () => {
  beforeEach(async () => {
    await db.products.clear()
    await db.parties.clear()
    await db.documents.clear()
  })

  it('AMM de la base du MAH lié → bouton de pioche, le choix déclenche la copie liée', async () => {
    const user = userEvent.setup()
    await db.products.put({
      id: 'p1',
      orgId: 'o1',
      nomCommercial: 'Doliprane',
      titulaireId: 'party-mah',
      fabricantId: 'party-fab',
      deletedAt: null,
    } as ProductRecord)
    await db.parties.put({
      id: 'party-mah',
      orgId: 'o1',
      nom: 'Sahel Pharma SARL',
      roles: ['titulaire'],
      deletedAt: null,
    } as PartyRecord)
    await db.documents.put({
      id: 'src-amm',
      orgId: 'o1',
      productId: '',
      partyId: 'party-mah',
      category: 'admin',
      docType: 'amm',
      fileName: 'amm-ci.pdf',
      status: 'active',
      language: null,
      expiryDate: '2030-01-01',
      filePath: null,
      uploaded: false,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      deletedAt: null,
    } as DocumentRecord)

    renderI(<DocumentsSection orgId="o1" productId="p1" category="admin" />)
    await user.click(screen.getByRole('button', { name: 'Ajouter un document' }))

    // Type par défaut = AMM → la base du MAH a 1 pièce de ce type : le chemin pioche apparaît.
    const pickBtn = await screen.findByRole('button', {
      name: /Depuis la base de Sahel Pharma SARL/,
    })
    await user.click(pickBtn)
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: /amm-ci\.pdf/ }))

    expect(copyDocumentToProduct).toHaveBeenCalledWith('o1', 'p1', 'src-amm')
  })

  it('aucune source du type choisi → pas de bouton de pioche (upload seul)', async () => {
    const user = userEvent.setup()
    await db.products.put({
      id: 'p1',
      orgId: 'o1',
      nomCommercial: 'Doliprane',
      titulaireId: 'party-mah',
      fabricantId: null,
      deletedAt: null,
    } as ProductRecord)

    renderI(<DocumentsSection orgId="o1" productId="p1" category="admin" />)
    await user.click(screen.getByRole('button', { name: 'Ajouter un document' }))

    expect(screen.queryByRole('button', { name: /Depuis la base/ })).not.toBeInTheDocument()
  })
})
