import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { TopbarConfigContext } from '@/components/layout/topbar'
import { OrgContext } from '@/features/org/org-context'
import { db } from '@/lib/db'
import { I18nProvider } from '@/lib/I18nProvider'
import { OrgWizardPage } from './OrgWizardPage'
import { partyId } from './parties-repository'

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}))
import { toast } from 'sonner'

const ORG = 'test-org'

function renderWizard(type: string) {
  return render(
    <I18nProvider>
      <OrgContext.Provider value={ORG}>
        <TopbarConfigContext.Provider value={vi.fn()}>
          <MemoryRouter initialEntries={[`/catalogue/organisations/nouvelle?type=${type}`]}>
            <Routes>
              <Route path="/catalogue/organisations/nouvelle" element={<OrgWizardPage />} />
              {/* Sondes : fiche créée / retour au choix. */}
              <Route path="/catalogue/organisations/:partyId" element={<div>FICHE</div>} />
              <Route path="/catalogue/organisations" element={<div>LISTE</div>} />
            </Routes>
          </MemoryRouter>
        </TopbarConfigContext.Provider>
      </OrgContext.Provider>
    </I18nProvider>,
  )
}

describe('OrgWizardPage (création — wizard 3 sessions, chrome Nouveau produit)', () => {
  beforeEach(async () => {
    await Promise.all([
      db.parties.clear(),
      db.proSettings.clear(),
      db.outbox.clear(),
      db.documents.clear(),
      db.documentBlobs.clear(),
    ])
    vi.mocked(toast.success).mockClear()
    vi.mocked(toast.error).mockClear()
  })

  it('type inconnu / absent → renvoyé à la liste des organisations', () => {
    renderWizard('grossiste')
    expect(screen.getByText('LISTE')).toBeInTheDocument()
  })

  it('agence locale : 2 sessions (Identification · Pièces admin) → fiche', async () => {
    const user = userEvent.setup()
    renderWizard('agent')

    // Pas de sessions Docs d'info / AMM pour une agence (matrice par rôle).
    expect(screen.queryByText('Documents d’information')).toBeNull()
    expect(screen.queryByText('AMM')).toBeNull()

    await user.type(screen.getByLabelText(/Nom/), 'PharmaConseil Bénin')
    await user.click(screen.getByRole('button', { name: /Suivant/ }))
    await user.click(screen.getByRole('button', { name: /Terminer/ }))

    await waitFor(async () => {
      const p = await db.parties.get(partyId(ORG, 'PharmaConseil Bénin'))
      expect(p?.roles).toEqual(['agent'])
    })
    expect(await screen.findByText('FICHE')).toBeInTheDocument()
  })

  it('fabricant : 2 sessions, champs GMP enregistrés, SANS champ « Titulaire » sur les pièces', async () => {
    const user = userEvent.setup()
    renderWizard('fabricant')

    await user.type(screen.getByLabelText(/Nom/), 'PHARMAX INDIA')
    await user.type(screen.getByLabelText('N° certificat GMP'), 'G/28/1628')
    await user.click(screen.getByRole('button', { name: /Suivant/ }))

    // Session Pièces admin : la carte GMP existe, la carte AMM n'y est PAS (session dédiée MAH),
    // et le formulaire d'une pièce n'expose pas « Titulaire » (contexte org : on est chez lui).
    expect(screen.getByText(/GMP \(Bonnes Pratiques/)).toBeInTheDocument()
    expect(screen.queryByText(/AMM \(Autorisation/)).toBeNull()
    expect(screen.queryByLabelText('Titulaire')).toBeNull()

    await user.click(screen.getByRole('button', { name: /Terminer/ }))
    await waitFor(async () => {
      const p = await db.parties.get(partyId(ORG, 'PHARMAX INDIA'))
      expect(p?.gmpCertificat).toBe('G/28/1628')
    })
  })

  it('MAH : 4 sessions ; Pièces admin = CONTRAT seul ; signataire persisté (branding party)', async () => {
    const user = userEvent.setup()
    renderWizard('titulaire')

    await user.type(screen.getByLabelText(/Nom/), 'HOLDER SARL')
    await user.type(screen.getByLabelText('Signataire (lettres)'), 'Dr Aïcha Koné')
    await user.click(screen.getByRole('button', { name: /Suivant/ })) // → Docs d'info
    await user.click(screen.getByRole('button', { name: /Suivant/ })) // → Pièces admin (contrat)

    // Amendement CEO : le contrat vit aussi côté MAH — et RIEN d'autre (pas de GMP/COA).
    expect(screen.getByText(/Contrat titulaire/)).toBeInTheDocument()
    expect(screen.queryByText(/GMP \(Bonnes Pratiques/)).toBeNull()

    await user.click(screen.getByRole('button', { name: /Suivant/ })) // → AMM
    expect(screen.getByText(/AMM \(Autorisation/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Terminer/ }))
    await waitFor(async () => {
      const id = partyId(ORG, 'HOLDER SARL')
      expect((await db.parties.get(id))?.roles).toEqual(['titulaire'])
      expect((await db.proSettings.get(`party:${id}`))?.signataire).toBe('Dr Aïcha Koné')
    })
  })

  it('MAH + Fabricant (?type=titulaire,fabricant) : rôles CUMULÉS + GMP + signataire', async () => {
    const user = userEvent.setup()
    renderWizard('titulaire,fabricant')

    // Les champs des DEUX rôles sont présents en Identification.
    await user.type(screen.getByLabelText(/Nom/), 'INTEGRA PHARMA')
    await user.type(screen.getByLabelText('N° certificat GMP'), 'G/99/0001')
    await user.type(screen.getByLabelText('Signataire (lettres)'), 'Dr K.')
    await user.click(screen.getByRole('button', { name: /Suivant/ })) // Docs d'info
    await user.click(screen.getByRole('button', { name: /Suivant/ })) // Pièces admin (tout)
    expect(screen.getByText(/GMP \(Bonnes Pratiques/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Suivant/ })) // AMM
    await user.click(screen.getByRole('button', { name: /Terminer/ }))

    await waitFor(async () => {
      const p = await db.parties.get(partyId(ORG, 'INTEGRA PHARMA'))
      // L'ordre de stockage des rôles n'est pas un contrat (upsertParty normalise) — le CONTENU si.
      expect([...(p?.roles ?? [])].sort()).toEqual(['fabricant', 'titulaire'])
      expect(p?.gmpCertificat).toBe('G/99/0001')
    })
  })

  it('sessions docs : un doc d’info ajouté au wizard MAH est persisté ORG-scopé (partyId)', async () => {
    const user = userEvent.setup()
    const { container } = renderWizard('titulaire')

    await user.type(screen.getByLabelText(/Nom/), 'HOLDER DOCS')
    await user.click(screen.getByRole('button', { name: /Suivant/ })) // → Docs d'info

    // L'ajout d'un doc d'info est DIRECT à la sélection du fichier (DocTypeCards).
    const input = container.querySelectorAll<HTMLInputElement>('input[type="file"]')[0]!
    await user.upload(input, new File(['%PDF-1.4'], 'rcp.pdf', { type: 'application/pdf' }))

    await user.click(screen.getByRole('button', { name: /Suivant/ })) // Pièces admin
    await user.click(screen.getByRole('button', { name: /Suivant/ })) // AMM
    await user.click(screen.getByRole('button', { name: /Terminer/ }))

    await waitFor(async () => {
      const docs = await db.documents.toArray()
      expect(docs).toHaveLength(1)
      expect(docs[0]?.partyId).toBe(partyId(ORG, 'HOLDER DOCS'))
      expect(docs[0]?.productId).toBe('')
      expect(docs[0]?.category).toBe('info')
    })
  })

  it('Terminer sans nom → erreur, retour session 1, rien créé', async () => {
    const user = userEvent.setup()
    renderWizard('agent')

    await user.click(screen.getByRole('button', { name: /Suivant/ }))
    await user.click(screen.getByRole('button', { name: /Terminer/ }))

    expect(toast.error).toHaveBeenCalled()
    // Retour session 1 : le champ Nom est de nouveau affiché.
    expect(await screen.findByLabelText(/Nom/)).toBeInTheDocument()
    expect(await db.parties.count()).toBe(0)
  })
})
