import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { HeaderSlotContext, type HeaderSlotSetter } from '@/components/layout/header-slot'
import { OrgContext } from '@/features/org/org-context'
import { getPartyBranding } from '@/features/profile/pro-settings-repository'
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
    db.proSettings.clear(),
    db.outbox.clear(),
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

  it('fabricant PUR : Identification · Pièces admin · Justificatifs (ni Marque ni Produits/AMM)', async () => {
    await seed(['fabricant'])
    renderFiche()

    await screen.findByRole('tab', { name: 'Identification' })
    // Marque = branding MAH → absente pour un fabricant pur, comme Produits/AMM/Docs info.
    expect(tabNames()).toEqual(['Identification', 'Pièces admin', 'Justificatifs'])
  })

  it('titulaire d’AMM : les 7 onglets, dont « Marque » (branding MAH)', async () => {
    renderFiche()

    await screen.findByRole('tab', { name: 'Identification' })
    expect(tabNames()).toEqual([
      'Identification',
      'Marque',
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

  it('le signataire d’un MAH est persisté dans le branding party (store séparé)', async () => {
    const user = userEvent.setup()
    renderFiche()

    await user.click(await screen.findByRole('tab', { name: 'Identification' }))
    await user.click(screen.getAllByRole('button', { name: /Modifier/ })[0]!)

    const nom = await screen.findByLabelText('Signataire (lettres)')
    const role = screen.getByLabelText('Rôle du signataire')
    await user.type(nom, 'Dr Aïcha Koné')
    await user.type(role, 'Pharmacien responsable')
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }))

    await waitFor(async () => {
      const b = await getPartyBranding(PARTY)
      expect(b?.signataire).toBe('Dr Aïcha Koné')
      expect(b?.poste).toBe('Pharmacien responsable')
      expect(b?.kind).toBe('partyBranding')
    })
  })

  it('ANTI-CLOBBER : éditer un champ NON signataire (adresse) ne crée pas de branding null', async () => {
    // Régression du BLOQUANT de revue : sans garde `dirty`, enregistrer après avoir corrigé une
    // adresse écrirait un record branding tout-à-null → efface logo/en-tête côté serveur.
    const user = userEvent.setup()
    renderFiche()

    await user.click(await screen.findByRole('tab', { name: 'Identification' }))
    await user.click(screen.getAllByRole('button', { name: /Modifier/ })[0]!)

    const adresse = await screen.findByLabelText('Adresse')
    await user.clear(adresse)
    await user.type(adresse, '12 rue de la Paix, Cotonou')
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }))

    // La partie est bien enregistrée…
    await waitFor(async () =>
      expect((await db.parties.get(PARTY))?.adresse).toBe('12 rue de la Paix, Cotonou'),
    )
    // …mais AUCUN record de branding n'a été touché (signataire inchangé).
    expect(await getPartyBranding(PARTY)).toBeUndefined()
  })

  it('éditer le signataire PRÉSERVE les images du branding (patch signataire seul)', async () => {
    const user = userEvent.setup()
    await db.proSettings.put({
      id: `party:${PARTY}`,
      orgId: ORG,
      kind: 'partyBranding',
      entreprise: null,
      poste: 'Ancien rôle',
      signataire: 'Ancien Nom',
      pays: null,
      headerImage: null,
      footerImage: null,
      logoImage: 'data:image/png;base64,LOGO',
      signatureImage: null,
      updatedAt: '2026-01-01T00:00:00.000Z',
      deletedAt: null,
    })
    renderFiche()

    await user.click(await screen.findByRole('tab', { name: 'Identification' }))
    await user.click(screen.getAllByRole('button', { name: /Modifier/ })[0]!)

    const nom = await screen.findByLabelText('Signataire (lettres)')
    // Le formulaire est HYDRATÉ depuis le branding local (pas vide).
    await waitFor(() => expect(nom).toHaveValue('Ancien Nom'))
    await user.clear(nom)
    await user.type(nom, 'Nouveau Nom')
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }))

    await waitFor(async () => {
      const b = await getPartyBranding(PARTY)
      expect(b?.signataire).toBe('Nouveau Nom')
      // Le logo n'est PAS effacé (patch signataire seul, merge sur le record existant).
      expect(b?.logoImage).toBe('data:image/png;base64,LOGO')
    })
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
