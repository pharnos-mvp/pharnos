import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import type { PartyRecord } from '@/lib/db'
import { I18nProvider } from '@/lib/I18nProvider'
import { INFO_DOC_TYPES, adminDocTypesForPartyRoles } from './doc-types'
import { OrgDocAddButton } from './OrgDocAddButton'
import { addPartyDocument } from './documents-repository'

vi.mock('./documents-repository', () => ({
  addPartyDocument: vi.fn(() => Promise.resolve({})),
}))
vi.mock('./catalogue-sync', () => ({ syncCatalogue: vi.fn() }))

const renderI = (ui: React.ReactElement) => render(ui, { wrapper: I18nProvider })

const party = (roles: string[]): PartyRecord =>
  ({
    id: 'party-1',
    orgId: 'o1',
    nom: 'Sahel Pharma SARL',
    roles,
    deletedAt: null,
  }) as PartyRecord

describe('OrgDocAddButton — upload fiche org (§3, matrice §1)', () => {
  it('aucun type autorisé (distributeur) → AUCUN bouton', () => {
    const { container } = renderI(
      <OrgDocAddButton
        orgId="o1"
        party={party(['distributeur'])}
        types={adminDocTypesForPartyRoles(['distributeur'])}
        category="admin"
      />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('dépose une pièce dans la base PROPRE de l’org (addPartyDocument) puis referme', async () => {
    const user = userEvent.setup()
    const { baseElement } = renderI(
      <OrgDocAddButton
        orgId="o1"
        party={party(['titulaire'])}
        types={INFO_DOC_TYPES}
        category="info"
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Ajouter' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(/Ajouter à la base de Sahel Pharma SARL/)).toBeInTheDocument()

    // Type par défaut = 1er type proposé (RCP) — un doc d'info n'exige aucune date.
    const fileInput = baseElement.querySelector<HTMLInputElement>('input[type="file"]')!
    const pdf = new File(['%PDF-1.4'], 'rcp.pdf', { type: 'application/pdf' })
    fireEvent.change(fileInput, { target: { files: [pdf] } })
    await user.click(within(dialog).getByRole('button', { name: 'Ajouter le document' }))

    await waitFor(() => expect(addPartyDocument).toHaveBeenCalledTimes(1))
    const [orgId, partyId, input] = vi.mocked(addPartyDocument).mock.calls[0]!
    expect(orgId).toBe('o1')
    expect(partyId).toBe('party-1')
    expect(input.docType).toBe(INFO_DOC_TYPES[0]!.code)
    expect(input.category).toBe('info')
    expect(input.file.name).toBe('rcp.pdf')
    // Ajout réussi → le dialog se referme.
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })
})
