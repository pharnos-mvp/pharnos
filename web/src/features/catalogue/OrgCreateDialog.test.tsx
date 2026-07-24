import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { OrgContext } from '@/features/org/org-context'
import { db } from '@/lib/db'
import { I18nProvider } from '@/lib/I18nProvider'
import { OrgCreateDialog } from './OrgCreateDialog'
import { upsertParty } from './parties-repository'

// Plan piloté par test ; `mahPartyLimit` reste réel.
let mockPlan = 'business'
vi.mock('@/features/org/use-org-plan', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/org/use-org-plan')>()
  return { ...actual, useOrgPlan: () => ({ data: { plan: mockPlan } }) }
})
vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}))
import { toast } from 'sonner'

const ORG = 'test-org'

function renderPicker() {
  return render(
    <I18nProvider>
      <OrgContext.Provider value={ORG}>
        <MemoryRouter initialEntries={['/catalogue/organisations']}>
          <Routes>
            <Route
              path="/catalogue/organisations"
              element={<OrgCreateDialog orgId={ORG} open onOpenChange={() => {}} />}
            />
            {/* Sonde : le wizard est atteint si un type développé est choisi. */}
            <Route path="/catalogue/organisations/nouvelle" element={<div>WIZARD</div>} />
          </Routes>
        </MemoryRouter>
      </OrgContext.Provider>
    </I18nProvider>,
  )
}

describe('OrgCreateDialog (étape 1 : choix du type SEUL)', () => {
  beforeEach(async () => {
    await db.parties.clear()
    mockPlan = 'business'
    vi.mocked(toast).mockClear()
  })

  it('propose 7 types — 4 développés (dont MAH + Fabricant), 3 annoncés « Bientôt »', () => {
    renderPicker()
    for (const nom of [
      "Titulaire d'AMM",
      'MAH \\+ Fabricant',
      'Agence locale / Représentant',
      'Agence Marketing',
      'Grossiste',
      'Agence RA',
    ]) {
      expect(screen.getByRole('button', { name: new RegExp(nom) })).toBeInTheDocument()
    }
    // « Fabricant » seul (désambiguïsé de « MAH + Fabricant » par son sous-titre).
    expect(screen.getByRole('button', { name: /Site de fabrication/ })).toBeInTheDocument()
    expect(screen.getAllByText('Bientôt')).toHaveLength(3)
  })

  it('« MAH + Fabricant » navigue vers le wizard avec les DEUX rôles', async () => {
    const user = userEvent.setup()
    renderPicker()
    await user.click(screen.getByRole('button', { name: /MAH \+ Fabricant/ }))
    expect(await screen.findByText('WIZARD')).toBeInTheDocument()
  })

  it('un type développé navigue vers la page de création (wizard)', async () => {
    const user = userEvent.setup()
    renderPicker()
    await user.click(screen.getByRole('button', { name: /Agence locale/ }))
    expect(await screen.findByText('WIZARD')).toBeInTheDocument()
  })

  it('un type « Bientôt » affiche « ça vient après » et NE navigue pas', async () => {
    const user = userEvent.setup()
    renderPicker()
    await user.click(screen.getByRole('button', { name: /Grossiste/ }))
    expect(toast).toHaveBeenCalled()
    expect(screen.queryByText('WIZARD')).toBeNull()
  })

  it('GATE : plan Free + 1 MAH existant → choisir MAH = upsell, pas de wizard', async () => {
    mockPlan = 'free'
    await upsertParty(ORG, { nom: 'KESHAVLAL', roles: ['titulaire'] })
    const user = userEvent.setup()
    renderPicker()

    await user.click(await screen.findByRole('button', { name: /Titulaire d'AMM/ }))
    expect(toast).toHaveBeenCalled()
    expect(screen.queryByText('WIZARD')).toBeNull()
  })

  it('GATE : Fabricant jamais gaté (plan Free, fabricant existant) → wizard atteint', async () => {
    mockPlan = 'free'
    await upsertParty(ORG, { nom: 'AUTRE FAB', roles: ['fabricant'] })
    const user = userEvent.setup()
    renderPicker()

    // « Fabricant » SEUL (le sous-titre le distingue de « MAH + Fabricant », qui lui est gaté).
    await user.click(screen.getByRole('button', { name: /Site de fabrication/ }))
    expect(await screen.findByText('WIZARD')).toBeInTheDocument()
    expect(toast).not.toHaveBeenCalled()
  })

  it('GATE : « MAH + Fabricant » est gaté comme un MAH (plan Free + 1 MAH existant)', async () => {
    mockPlan = 'free'
    await upsertParty(ORG, { nom: 'KESHAVLAL', roles: ['titulaire'] })
    const user = userEvent.setup()
    renderPicker()

    await user.click(await screen.findByRole('button', { name: /MAH \+ Fabricant/ }))
    expect(toast).toHaveBeenCalled()
    expect(screen.queryByText('WIZARD')).toBeNull()
  })
})
