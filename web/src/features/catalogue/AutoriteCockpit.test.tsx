/**
 * Fiche AUTORITÉ — chrome cockpit partagée (bandeau + méta + onglets) et contenu de chaque onglet.
 *
 * Ces tests portent surtout sur ce que la fiche PROMET : un onglet qui annonce des produits doit
 * montrer les produits engagés devant CETTE agence, pas le catalogue entier. La version
 * précédente affichait deux compteurs muets ; le risque en les remplaçant par des listes est
 * exactement là — élargir la question sans le dire.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { HeaderSlotContext, type HeaderSlotSetter } from '@/components/layout/header-slot'
import { AuthContext, type AuthContextValue } from '@/features/auth/auth-context'
import { OrgContext } from '@/features/org/org-context'
import { db } from '@/lib/db'
import { I18nProvider } from '@/lib/I18nProvider'
import { AutoriteCockpit } from './AutoriteCockpit'

const ORG = 'test-org'

/** `RefUpdateBanner` et `RefOverrideDialog` demandent la session (droits d'admin d'org). */
const AUTH: AuthContextValue = {
  session: null,
  user: { id: 'u1', email: 'ra@ex.com' } as AuthContextValue['user'],
  loading: false,
  recovery: false,
  clearRecovery: () => {},
  signOut: async () => {},
}

async function seed() {
  await Promise.all([
    db.products.clear(),
    db.documents.clear(),
    db.dossiers.clear(),
    db.orgRefOverrides.clear(),
    db.orgRefAdoptions.clear(),
    db.outbox.clear(),
  ])
}

function renderFiche(code = 'CI', setHeaderSlot: HeaderSlotSetter = vi.fn()) {
  // Client neuf par rendu (isolation). `useCurrentOrg` interroge les adhésions pour savoir si
  // l'utilisateur est admin d'org — sans session, la query reste désactivée : la bannière de mise
  // à jour et le dialogue d'adaptation se taisent, ce qui n'affecte aucune assertion d'onglet.
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <I18nProvider>
        <AuthContext.Provider value={AUTH}>
          <OrgContext.Provider value={ORG}>
            <HeaderSlotContext.Provider value={setHeaderSlot}>
              <MemoryRouter initialEntries={[`/catalogue/autorites/${code}`]}>
                <Routes>
                  <Route path="/catalogue/autorites/:code" element={<AutoriteCockpit />} />
                </Routes>
              </MemoryRouter>
            </HeaderSlotContext.Provider>
          </OrgContext.Provider>
        </AuthContext.Provider>
      </I18nProvider>
    </QueryClientProvider>,
  )
}

const tabNames = () => screen.getAllByRole('tab').map((el) => el.textContent?.trim())
const ouvrir = async (nom: string) => userEvent.click(await screen.findByRole('tab', { name: nom }))

const product = (id: string, nom: string) => ({
  id,
  orgId: ORG,
  nomCommercial: nom,
  dci: 'Paracétamol',
  dosage: '500 mg',
  forme: 'Comprimé',
  presentation: '',
  classeTherapeutique: '',
  codeAtc: '',
  titulaire: '',
  fabricant: '',
  titulaireId: null,
  fabricantId: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  deletedAt: null,
})

const amm = (id: string, productId: string, country: string) => ({
  id,
  orgId: ORG,
  productId,
  partyId: null,
  category: 'admin' as const,
  docType: 'amm',
  fileName: `${id}.pdf`,
  mimeType: 'application/pdf',
  size: 10,
  language: null,
  expiryDate: '2030-05-31',
  issueDate: '2025-06-01',
  reference: 'AMM_2025_0042',
  country,
  status: 'active',
  filePath: null,
  uploaded: false,
  createdAt: '2026-01-02T00:00:00.000Z',
  updatedAt: '2026-01-02T00:00:00.000Z',
  deletedAt: null,
})

const dossier = (id: string, productId: string, productName: string, country: string) => ({
  id,
  orgId: ORG,
  productId,
  productName,
  format: 'ctd' as const,
  activity: 'new_ma',
  country,
  status: 'montage',
  tree: [],
  excludedDocIds: [],
  createdAt: '2026-01-03T00:00:00.000Z',
  updatedAt: '2026-01-03T00:00:00.000Z',
  deletedAt: null,
})

describe('AutoriteCockpit — chrome cockpit et onglets', () => {
  beforeEach(seed)

  it('porte les six onglets, dans l’ordre où la question se pose', async () => {
    renderFiche()
    await screen.findByRole('tab', { name: 'Identification' })
    expect(tabNames()).toEqual([
      'Identification',
      'Exigences',
      'Modèles',
      'Produits',
      'AMM',
      'Dossiers',
    ])
  })

  it('n’appelle AUCUN onglet « Activités » — le mot désigne l’acte réglementaire', async () => {
    // « Activité » = enregistrement / renouvellement / variation, partout ailleurs dans Pharnos
    // (sélecteur du builder, lettres). Deux sens pour un mot, sur une page lue par des experts RA.
    renderFiche()
    await screen.findByRole('tab', { name: 'Identification' })
    expect(tabNames()).not.toContain('Activités')
  })

  it('ouvre sur Identification, et y nomme le destinataire des lettres', async () => {
    renderFiche()
    // DEUX occurrences attendues — la bande méta (toujours visible) et l'onglet (le détail) : le
    // même redoublement que la fiche Organisation, où adresse et certificat GMP figurent aux deux
    // endroits. La bande répond « à qui j'écris » sans changer d'onglet.
    expect((await screen.findAllByText(/Destinataire des lettres/)).length).toBe(2)
    // L'AIRP : la civilité et le directeur viennent du référentiel d'agences, pas d'une saisie.
    expect(screen.getAllByText(/AIRP/).length).toBeGreaterThan(0)
  })

  it('Exigences : le barème du pays, redevances comprises', async () => {
    renderFiche()
    await ouvrir('Exigences')
    expect(await screen.findByText('Redevances')).toBeInTheDocument()
  })

  it('Modèles : les gabarits servis sous ce drapeau, et l’accès à la bibliothèque', async () => {
    renderFiche()
    await ouvrir('Modèles')
    expect(await screen.findByRole('link', { name: /Ouvrir la bibliothèque/ })).toHaveAttribute(
      'href',
      expect.stringContaining('pays=ci'),
    )
  })

  it('Modèles : un pays sans gabarit le DIT, au lieu d’un onglet vide', async () => {
    // Le Ghana est au référentiel d'agences mais la bibliothèque ne le sert pas.
    renderFiche('GH')
    await ouvrir('Modèles')
    expect(await screen.findByText(/Aucun modèle pour ce pays/)).toBeInTheDocument()
  })

  it('AMM : les autorisations de CE pays, avec numéro et échéance', async () => {
    await db.products.put(product('p1', 'KV-Kacin 500'))
    await db.documents.bulkPut([amm('a1', 'p1', 'CI'), amm('a2', 'p1', 'SN')])
    renderFiche()
    await ouvrir('AMM')
    await waitFor(() => expect(screen.getAllByText('KV-Kacin 500').length).toBe(1))
    expect(screen.getByText(/AMM_2025_0042/)).toBeInTheDocument()
  })

  it('Produits : SEULEMENT ceux engagés ici — pas le catalogue entier', async () => {
    // Le piège de la reprise : « Produits » ne peut pas devenir la liste de tous les produits de
    // l'org. `Ailleurs-1` n'a d'AMM qu'au Sénégal et n'a rien à faire sur la fiche ivoirienne.
    await db.products.bulkPut([product('p1', 'Engagé-CI'), product('p2', 'Ailleurs-1')])
    await db.documents.bulkPut([amm('a1', 'p1', 'CI'), amm('a2', 'p2', 'SN')])
    renderFiche()
    await ouvrir('Produits')
    await waitFor(() => expect(screen.getByText('Engagé-CI')).toBeInTheDocument())
    expect(screen.queryByText('Ailleurs-1')).not.toBeInTheDocument()
  })

  it('Produits : un dossier suffit à engager un produit, sans AMM', async () => {
    await db.products.put(product('p3', 'En cours de montage'))
    await db.dossiers.put(dossier('d1', 'p3', 'En cours de montage', 'CI'))
    renderFiche()
    await ouvrir('Produits')
    await waitFor(() => expect(screen.getByText('En cours de montage')).toBeInTheDocument())
  })

  it('Dossiers : ceux du pays, ouvrables — pas un compteur muet', async () => {
    await db.dossiers.bulkPut([
      dossier('d1', 'p1', 'Dossier ivoirien', 'CI'),
      dossier('d2', 'p2', 'Dossier sénégalais', 'SN'),
    ])
    renderFiche()
    await ouvrir('Dossiers')
    const lien = await screen.findByRole('link', { name: 'Dossier ivoirien' })
    expect(lien).toHaveAttribute('href', '/workspace/d1')
    expect(screen.queryByText('Dossier sénégalais')).not.toBeInTheDocument()
  })

  it('les onglets vides expliquent leur vide au lieu de le laisser nu', async () => {
    renderFiche()
    await ouvrir('AMM')
    expect(await screen.findByText(/Aucune AMM enregistrée/)).toBeInTheDocument()
    await ouvrir('Dossiers')
    expect(await screen.findByText(/Aucun dossier pour ce pays/)).toBeInTheDocument()
  })

  it('pose le nom de l’agence dans l’en-tête applicatif, et le libère au démontage', async () => {
    const setHeaderSlot = vi.fn()
    const { unmount } = renderFiche('CI', setHeaderSlot)
    await waitFor(() => expect(setHeaderSlot).toHaveBeenCalled())
    unmount()
    expect(setHeaderSlot).toHaveBeenLastCalledWith(null)
  })
})
