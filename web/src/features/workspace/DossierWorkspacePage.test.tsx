// Tests de CARACTÉRISATION du workspace (T7.0, PLAN-V2) — figent le comportement observable
// AVANT le refactor (extractions de hooks/composants). Mode local (Supabase non configuré en
// test) : syncs no-op, copilote IA inactif → comportement 100 % déterministe.
import { useState, type ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { configure, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'

import { HeaderSlotContext } from '@/components/layout/header-slot'

// Sous la charge d'une suite complète (workers parallèles), le premier rendu async de la page
// (liveQuery Dexie + auto-sélection) peut dépasser la seconde par défaut des findBy* — sans
// lien avec le comportement testé. Timeout élargi pour TOUT le fichier (anti-flaky).
configure({ asyncUtilTimeout: 5000 })

import { AuthContext, type AuthContextValue } from '@/features/auth/auth-context'
import { OrgContext } from '@/features/org/org-context'
import { db } from '@/lib/db'
import { I18nProvider } from '@/lib/I18nProvider'
import { DossierWorkspacePage } from './DossierWorkspacePage'
import { getModule1Tree } from './module1-tree'

const ORG = 'org-test'
const DOSSIER_ID = 'd-0001'
const PRODUCT_ID = 'p-0001'
const NOW = new Date().toISOString()

const auth: AuthContextValue = {
  session: null,
  user: null,
  loading: false,
  recovery: false,
  clearRecovery: () => {},
  signOut: () => Promise.resolve(),
}

/** Mini-shell de test : fournit le header-slot (la page y injecte titre + Compiler le PDF). */
function TestShell() {
  const [slot, setSlot] = useState<ReactNode>(null)
  return (
    <HeaderSlotContext.Provider value={setSlot}>
      <header>{slot}</header>
      <Routes>
        <Route path="/workspace/:dossierId" element={<DossierWorkspacePage />} />
        <Route path="/workspace" element={<p>Liste des dossiers</p>} />
      </Routes>
    </HeaderSlotContext.Provider>
  )
}

function renderPage() {
  // Client neuf par rendu (isolation). useCurrentOrg garde sa query `enabled: false` ici
  // (session null) → memberships=[] → canSubmit=false : aucun impact sur la caractérisation.
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  // Plan d'org : Regafy « Activée » → le bouton Analyser (on-demand) s'affiche. staleTime du hook
  // useOrgPlan = 5 min → la donnée seedée est fraîche : pas de refetch qui l'écraserait en test.
  queryClient.setQueryData(['my-org-plan'], { features: { regafy: 'enabled' } })
  return render(
    <QueryClientProvider client={queryClient}>
      <I18nProvider>
        <AuthContext.Provider value={auth}>
          <OrgContext.Provider value={ORG}>
            <MemoryRouter initialEntries={[`/workspace/${DOSSIER_ID}`]}>
              <TestShell />
            </MemoryRouter>
          </OrgContext.Provider>
        </AuthContext.Provider>
      </I18nProvider>
    </QueryClientProvider>,
  )
}

async function seed({ withDoc = true }: { withDoc?: boolean } = {}) {
  await db.products.add({
    id: PRODUCT_ID,
    orgId: ORG,
    nomCommercial: 'KV-Kacin 500',
    dci: 'Amikacine',
    dosage: '500 mg / 2 ml',
    forme: 'Solution injectable',
    presentation: 'flacon de 2 ml',
    classeTherapeutique: 'Antibiotique',
    codeAtc: 'J01GB06',
    titulaire: 'KESHAVLAL VAJECHAND',
    // Titulaire ≠ fabricant sans contrat → constat déterministe attendu (caractérisation).
    fabricant: 'PHARMAX INDIA',
    createdAt: NOW,
    updatedAt: NOW,
    deletedAt: null,
  })
  await db.dossiers.add({
    id: DOSSIER_ID,
    orgId: ORG,
    productId: PRODUCT_ID,
    productName: 'KV-Kacin 500',
    format: 'ctd',
    activity: 'new_ma',
    country: 'CI',
    status: 'draft',
    tree: getModule1Tree('ctd'),
    excludedDocIds: [],
    createdAt: NOW,
    updatedAt: NOW,
    deletedAt: null,
  })
  if (withDoc) {
    await db.documents.add({
      id: 'doc-gmp-1',
      orgId: ORG,
      productId: PRODUCT_ID,
      category: 'admin',
      docType: 'gmp',
      fileName: 'gmp.pdf',
      mimeType: 'application/pdf',
      size: 1000,
      language: 'fr',
      // Expire dans ~2 mois (< 6 requis) → constat de validité déterministe (warning).
      expiryDate: new Date(Date.now() + 61 * 24 * 3600 * 1000).toISOString().slice(0, 10),
      status: 'active',
      filePath: null,
      uploaded: false,
      createdAt: NOW,
      updatedAt: NOW,
      deletedAt: null,
    })
  }
}

beforeEach(async () => {
  await Promise.all([
    db.products.clear(),
    db.dossiers.clear(),
    db.documents.clear(),
    db.generatedDocs.clear(),
    db.dossierAttachments.clear(),
    db.outbox.clear(),
  ])
  localStorage.clear()
})

describe('DossierWorkspacePage — caractérisation (avant refactor T7)', () => {
  it('dossier introuvable → message + retour aux dossiers', async () => {
    renderPage() // rien en base
    expect(await screen.findByText('Dossier introuvable.')).toBeInTheDocument()
  })

  it('auto-sélection au chargement : première section documentée (fix T7bis)', async () => {
    await seed()
    renderPage()
    // Le GMP auto-classé vit sous 1.2 : l'utilisateur voit immédiatement ses pièces sans
    // chercher (l'ancien bug — course docs=[] → verrouillage sur 1.0 — est corrigé).
    const heading = await screen.findByRole('heading', { level: 2 })
    expect(heading).toHaveTextContent('1.2 Informations administratives')
  })

  it('auto-sélection sans aucun document : première feuille (1.0)', async () => {
    await seed({ withDoc: false })
    renderPage()
    const heading = await screen.findByRole('heading', { level: 2 })
    expect(heading).toHaveTextContent('1.0 Table des matières (TdM)')
  })

  it('sélection manuelle de la feuille documentée → aperçu du document (gmp.pdf)', async () => {
    await seed()
    renderPage()
    await screen.findByRole('heading', { level: 2 })
    const user = userEvent.setup()
    // Recette n°7 : le GMP auto-classé vit sous la FEUILLE 1.2.4.1 (BPF) — la section 1.2
    // est une page de garde et ne regroupe plus les documents de ses sous-sections.
    await user.click(await screen.findByText('Bonnes pratiques de fabrication (BPF)'))
    expect(await screen.findByRole('heading', { level: 2 })).toHaveTextContent('1.2.4.1')
    expect((await screen.findAllByText(/gmp\.pdf/i)).length).toBeGreaterThan(0)
  })

  it('affiche les actions cœur : Compiler (bandeau) et Téléverser', async () => {
    await seed()
    renderPage()
    // Attendre l'état stable (section auto-sélectionnée) : Téléverser/Enregistrer n'existent
    // qu'une fois `selected` posé — sans ça le test est sensible à la charge de la machine.
    await screen.findByRole('heading', { level: 2 })
    expect(await screen.findByRole('button', { name: /Compiler le PDF/ })).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: /Téléverser/ })).toBeInTheDocument()
  })

  it('Monitor toujours actif (déterministe, gratuit) + Regafy IA à la demande', async () => {
    await seed()
    renderPage()
    await screen.findByRole('heading', { level: 2 })
    const user = userEvent.setup()
    await user.click(await screen.findByText('Bonnes pratiques de fabrication (BPF)'))
    await screen.findAllByText(/gmp\.pdf/i)
    // Jalon O : Monitor (vérifs DÉTERMINISTES, gratuites) est TOUJOURS actif — le GMP expire à
    // < 6 mois → le constat apparaît SANS action utilisateur (l'IA Regafy, elle, reste à la demande).
    expect(await screen.findByText('Remarques pour la session')).toBeInTheDocument()
    expect(await screen.findByText(/Validité < 6 mois requise/)).toBeInTheDocument()
    // Regafy IA reste À LA DEMANDE : le bouton Analyser accompagne la pièce (désactivé hors-ligne).
    expect(await screen.findByRole('button', { name: /Analyser/ })).toBeInTheDocument()
    // Le donut affiche un pourcentage calculé (feuilles remplies / feuilles).
    const donut = await screen.findAllByRole('img', { name: /%$/ })
    expect(donut.length).toBeGreaterThan(0)
  })

  it('section de garde (1.2) : page épurée Autogénéré + Téléverser, sans documents des enfants', async () => {
    await seed()
    renderPage()
    // L'auto-sélection retient 1.2 (première section documentée) — désormais page de garde.
    const heading = await screen.findByRole('heading', { level: 2 })
    expect(heading).toHaveTextContent('1.2 Informations administratives')
    expect(await screen.findByText(/Page de garde générée automatiquement/)).toBeInTheDocument()
    const auto = await screen.findByRole('button', { name: 'Autogénéré' })
    expect(auto).toHaveAttribute('aria-pressed', 'true')
    expect(await screen.findByRole('button', { name: /Téléverser/ })).toBeInTheDocument()
    // Le GMP (classé sous 1.2.4.1) n'est PLUS regroupé sur la page de la section 1.2.
    expect(screen.queryByText(/gmp\.pdf/i)).not.toBeInTheDocument()
  })

  it('compiler : le gate présente les constats Monitor + « Compiler quand même »', async () => {
    await seed()
    renderPage()
    // État stable d'abord (docs chargés → auto-sélection 1.2), sinon le gate voit un dossier vide.
    expect(await screen.findByRole('heading', { level: 2 })).toHaveTextContent('1.2')
    const compile = await screen.findByRole('button', { name: /Compiler le PDF/ })
    compile.click()
    // Monitor étant toujours actif, le gate liste ses constats déterministes (GMP < 6 mois) — plus de
    // « Aucune analyse effectuée » — et propose Audit Global (IA) / Compiler quand même (jamais bloquant).
    expect(await screen.findByText(/Validité < 6 mois requise/)).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: /Audit Global/ })).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: 'Compiler quand même' })).toBeInTheDocument()
  })

  it('dossier vide : le gate signale « Dossier vide : aucun document. »', async () => {
    await seed({ withDoc: false })
    renderPage()
    const compile = await screen.findByRole('button', { name: /Compiler le PDF/ })
    compile.click()
    expect(await screen.findByText(/Dossier vide : aucun document\./)).toBeInTheDocument()
  })
})
