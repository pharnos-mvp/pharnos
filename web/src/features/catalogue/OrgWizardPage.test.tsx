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

  it('crée une agence locale (Terminer en session 3) et atterrit sur sa fiche', async () => {
    const user = userEvent.setup()
    renderWizard('agent')

    await user.type(screen.getByLabelText(/Nom/), 'PharmaConseil Bénin')
    await user.click(screen.getByRole('button', { name: /Suivant/ }))
    await user.click(screen.getByRole('button', { name: /Suivant/ }))
    await user.click(screen.getByRole('button', { name: /Terminer/ }))

    await waitFor(async () => {
      const p = await db.parties.get(partyId(ORG, 'PharmaConseil Bénin'))
      expect(p?.roles).toEqual(['agent'])
    })
    expect(await screen.findByText('FICHE')).toBeInTheDocument()
  })

  it('fabricant : champs GMP présents et enregistrés', async () => {
    const user = userEvent.setup()
    renderWizard('fabricant')

    await user.type(screen.getByLabelText(/Nom/), 'PHARMAX INDIA')
    await user.type(screen.getByLabelText('N° certificat GMP'), 'G/28/1628')
    await user.click(screen.getByRole('button', { name: /Suivant/ }))
    await user.click(screen.getByRole('button', { name: /Suivant/ }))
    await user.click(screen.getByRole('button', { name: /Terminer/ }))

    await waitFor(async () => {
      const p = await db.parties.get(partyId(ORG, 'PHARMAX INDIA'))
      expect(p?.gmpCertificat).toBe('G/28/1628')
    })
  })

  it('MAH : le signataire est persisté dans le branding party', async () => {
    const user = userEvent.setup()
    renderWizard('titulaire')

    await user.type(screen.getByLabelText(/Nom/), 'HOLDER SARL')
    await user.type(screen.getByLabelText('Signataire (lettres)'), 'Dr Aïcha Koné')
    await user.click(screen.getByRole('button', { name: /Suivant/ }))
    await user.click(screen.getByRole('button', { name: /Suivant/ }))
    await user.click(screen.getByRole('button', { name: /Terminer/ }))

    await waitFor(async () => {
      const id = partyId(ORG, 'HOLDER SARL')
      expect((await db.parties.get(id))?.roles).toEqual(['titulaire'])
      expect((await db.proSettings.get(`party:${id}`))?.signataire).toBe('Dr Aïcha Koné')
    })
  })

  it('sessions II/III : un doc d’info ajouté au wizard est persisté ORG-scopé (partyId)', async () => {
    const user = userEvent.setup()
    const { container } = renderWizard('agent')

    await user.type(screen.getByLabelText(/Nom/), 'PharmaConseil')
    await user.click(screen.getByRole('button', { name: /Suivant/ }))

    // Session II (Documents d'information) : l'ajout d'un doc d'info est DIRECT à la sélection du
    // fichier (DocTypeCards). 2 inputs par carte [ajout, remplacement] → le 1er de la 1re carte.
    const input = container.querySelectorAll<HTMLInputElement>('input[type="file"]')[0]!
    await user.upload(input, new File(['%PDF-1.4'], 'rcp.pdf', { type: 'application/pdf' }))

    await user.click(screen.getByRole('button', { name: /Suivant/ }))
    await user.click(screen.getByRole('button', { name: /Terminer/ }))

    await waitFor(async () => {
      const docs = await db.documents.toArray()
      expect(docs).toHaveLength(1)
      expect(docs[0]?.partyId).toBe(partyId(ORG, 'PharmaConseil'))
      expect(docs[0]?.productId).toBe('')
      expect(docs[0]?.category).toBe('info')
    })
  })

  it('Terminer sans nom → erreur, retour session 1, rien créé', async () => {
    const user = userEvent.setup()
    renderWizard('agent')

    await user.click(screen.getByRole('button', { name: /Suivant/ }))
    await user.click(screen.getByRole('button', { name: /Suivant/ }))
    await user.click(screen.getByRole('button', { name: /Terminer/ }))

    expect(toast.error).toHaveBeenCalled()
    // Retour session 1 : le champ Nom est de nouveau affiché.
    expect(await screen.findByLabelText(/Nom/)).toBeInTheDocument()
    expect(await db.parties.count()).toBe(0)
  })
})
