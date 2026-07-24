import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { HeaderSlotContext, type HeaderSlotSetter } from '@/components/layout/header-slot'
import { OrgContext } from '@/features/org/org-context'
import { db, type PartyRecord, type PartyRole } from '@/lib/db'
import { I18nProvider } from '@/lib/I18nProvider'
import { OrganisationCockpit } from './OrganisationCockpit'

const ORG = 'test-org'
const PARTY = 'p-org'

const party = (roles: PartyRole[]): PartyRecord => ({
  id: PARTY,
  orgId: ORG,
  nom: 'ABARIS HEALTHCARE',
  roles,
  pays: 'Inde',
  adresse: 'Mumbai',
  gmpCertificat: 'G/28/1628',
  gmpExpiry: '2028-04-22',
  contactEmail: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  deletedAt: null,
})

async function seed(roles: PartyRole[]) {
  await Promise.all([
    db.parties.clear(),
    db.products.clear(),
    db.documents.clear(),
    db.dossiers.clear(),
    db.correspondences.clear(),
    db.correspondenceMessages.clear(),
  ])
  await db.parties.put(party(roles))
}

function renderFiche(setHeaderSlot: HeaderSlotSetter = vi.fn()) {
  return render(
    <I18nProvider>
      <OrgContext.Provider value={ORG}>
        <HeaderSlotContext.Provider value={setHeaderSlot}>
          <MemoryRouter initialEntries={[`/catalogue/organisations/${PARTY}`]}>
            <Routes>
              <Route path="/catalogue/organisations/:partyId" element={<OrganisationCockpit />} />
            </Routes>
          </MemoryRouter>
        </HeaderSlotContext.Provider>
      </OrgContext.Provider>
    </I18nProvider>,
  )
}

const tabNames = () => screen.getAllByRole('tab').map((el) => el.textContent?.trim())

describe('OrganisationCockpit (chrome cockpit partagée avec la fiche produit)', () => {
  beforeEach(async () => {
    await seed(['titulaire'])
  })

  it('fabricant PUR : seulement Identification · Pièces admin · Justificatifs', async () => {
    await seed(['fabricant'])
    renderFiche()

    await screen.findByRole('tab', { name: 'Identification' })
    // Pas de Produits/AMM/Documents d'information : ils relèvent du titulaire d'AMM.
    expect(tabNames()).toEqual(['Identification', 'Pièces admin', 'Justificatifs'])
  })

  it('titulaire d’AMM : les 6 onglets', async () => {
    renderFiche()

    await screen.findByRole('tab', { name: 'Identification' })
    expect(tabNames()).toEqual([
      'Identification',
      'Produits',
      'AMM',
      'Pièces admin',
      'Documents d’information',
      'Justificatifs',
    ])
  })

  it('« Modifier » depuis le bandeau BASCULE sur Identification (sinon bouton mort)', async () => {
    const user = userEvent.setup()
    renderFiche()

    // On part sur un AUTRE onglet que celui qui porte le formulaire.
    await user.click(await screen.findByRole('tab', { name: 'Pièces admin' }))
    expect(screen.getByRole('tab', { name: 'Pièces admin' })).toHaveAttribute(
      'aria-selected',
      'true',
    )

    // Le bouton du bandeau est le premier « Modifier » (celui de la carte est dans le panneau).
    await user.click(screen.getAllByRole('button', { name: /Modifier/ })[0]!)

    // L'onglet Identification redevient actif ET le formulaire d'édition est rendu.
    await waitFor(() =>
      expect(screen.getByRole('tab', { name: 'Identification' })).toHaveAttribute(
        'aria-selected',
        'true',
      ),
    )
    expect(screen.getByRole('button', { name: 'Enregistrer' })).toBeInTheDocument()
  })

  it('pose le nom dans le bandeau applicatif et le LIBÈRE au démontage', async () => {
    const setHeaderSlot = vi.fn()
    const { unmount } = renderFiche(setHeaderSlot)

    // Le 1er appel est `null` (donnée pas encore chargée) : on attend celui qui porte le titre.
    await waitFor(() => expect(setHeaderSlot.mock.calls.some(([v]) => v !== null)).toBe(true))

    unmount()
    expect(setHeaderSlot).toHaveBeenLastCalledWith(null)
  })
})
