// Tests de CARACTÉRISATION du workspace (T7.0, PLAN-V2) — figent le comportement observable
// AVANT le refactor (extractions de hooks/composants). Mode local (Supabase non configuré en
// test) : syncs no-op, copilote IA inactif → comportement 100 % déterministe.
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'

import { AuthContext, type AuthContextValue } from '@/features/auth/auth-context'
import { OrgContext } from '@/features/org/org-context'
import { db } from '@/lib/db'
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

function renderPage() {
  return render(
    <AuthContext.Provider value={auth}>
      <OrgContext.Provider value={ORG}>
        <MemoryRouter initialEntries={[`/workspace/${DOSSIER_ID}`]}>
          <Routes>
            <Route path="/workspace/:dossierId" element={<DossierWorkspacePage />} />
            <Route path="/workspace" element={<p>Liste des dossiers</p>} />
          </Routes>
        </MemoryRouter>
      </OrgContext.Provider>
    </AuthContext.Provider>,
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

  it('auto-sélection au chargement : première feuille (1.0) — comportement actuel', async () => {
    await seed()
    renderPage()
    // CARACTÉRISATION : l'intention du code est « première section documentée », mais une course
    // (docs vaut [] le temps du chargement quand l'effet se verrouille) fait retomber sur la
    // première feuille. Fig é tel quel — fix dans une PR dédiée post-refactor, pas en move-only.
    const heading = await screen.findByRole('heading', { level: 2 })
    expect(heading).toHaveTextContent('1.0 Table des matières (TdM)')
  })

  it('sélection manuelle du nœud documenté → aperçu du document (gmp.pdf)', async () => {
    await seed()
    renderPage()
    await screen.findByRole('heading', { level: 2 })
    const user = userEvent.setup()
    // Le badge de comptage du nœud 1.2 reflète le GMP auto-classé ; on clique le nœud.
    await user.click(await screen.findByText('Informations administratives'))
    expect(await screen.findByRole('heading', { level: 2 })).toHaveTextContent(
      '1.2 Informations administratives',
    )
    expect((await screen.findAllByText(/gmp\.pdf/i)).length).toBeGreaterThan(0)
  })

  it('affiche les actions cœur : Compiler, Téléverser, Enregistrer', async () => {
    await seed()
    renderPage()
    expect(await screen.findByRole('button', { name: /Compiler le PDF/ })).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: /Téléverser/ })).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: /Enregistrer/ })).toBeInTheDocument()
  })

  it('remarques déterministes : validité < 6 mois + titulaire ≠ fabricant', async () => {
    await seed()
    renderPage()
    await screen.findByRole('heading', { level: 2 })
    expect(await screen.findByText('Remarques pour la session')).toBeInTheDocument()
    // Messages exacts de regafy.ts (déterministes, IA inactive en mode local).
    expect(await screen.findByText(/Validité < 6 mois requise \(expire le /)).toBeInTheDocument()
    expect(
      await screen.findByText(
        /Titulaire ≠ fabricant : contrat \(licence\/fabrication\) non fourni\./,
      ),
    ).toBeInTheDocument()
    // Le donut affiche un pourcentage calculé (feuilles remplies / feuilles).
    const donut = await screen.findAllByRole('img', { name: /%$/ })
    expect(donut.length).toBeGreaterThan(0)
  })

  it('gate de compilation : remarques affichées AVANT compilation, option « Compiler quand même »', async () => {
    await seed()
    renderPage()
    const compile = await screen.findByRole('button', { name: /Compiler le PDF/ })
    compile.click()
    expect(await screen.findByText('Remarques avant compilation')).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: 'Compiler quand même' })).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: 'Corriger' })).toBeInTheDocument()
  })

  it('dossier vide : le gate signale « Dossier vide : aucun document. »', async () => {
    await seed({ withDoc: false })
    renderPage()
    const compile = await screen.findByRole('button', { name: /Compiler le PDF/ })
    compile.click()
    expect(await screen.findByText(/Dossier vide : aucun document\./)).toBeInTheDocument()
  })
})
