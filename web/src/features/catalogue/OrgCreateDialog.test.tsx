import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { OrgContext } from '@/features/org/org-context'
import { db } from '@/lib/db'
import { I18nProvider } from '@/lib/I18nProvider'
import { OrgCreateDialog } from './OrgCreateDialog'
import { partyId, upsertParty } from './parties-repository'

// Plan piloté par test (le vrai useOrgPlan = react-query + Supabase) ; `mahPartyLimit` reste réel.
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

function renderDialog() {
  return render(
    <I18nProvider>
      <OrgContext.Provider value={ORG}>
        <MemoryRouter>
          <OrgCreateDialog orgId={ORG} open onOpenChange={() => {}} />
        </MemoryRouter>
      </OrgContext.Provider>
    </I18nProvider>,
  )
}

describe('OrgCreateDialog (création directe d’une organisation)', () => {
  beforeEach(async () => {
    await Promise.all([db.parties.clear(), db.proSettings.clear(), db.outbox.clear()])
    mockPlan = 'business'
    vi.mocked(toast).mockClear()
    vi.mocked(toast.success).mockClear()
  })

  it('crée une AGENCE réglementaire (rôle agent) — jamais gatée', async () => {
    mockPlan = 'free' // même en Free : l'agence n'est pas plafonnée
    const user = userEvent.setup()
    renderDialog()

    await user.click(screen.getByRole('radio', { name: /Agence réglementaire/ }))
    await user.type(screen.getByLabelText('Nom *'), 'PharmaConseil Bénin')
    await user.click(screen.getByRole('button', { name: 'Créer' }))

    await waitFor(async () => {
      const p = await db.parties.get(partyId(ORG, 'PharmaConseil Bénin'))
      expect(p?.roles).toEqual(['agent'])
    })
    expect(toast.success).toHaveBeenCalled()
  })

  it('GATE : plan Free + 1 MAH existant → note d’upsell visible et création MAH bloquée', async () => {
    mockPlan = 'free'
    await upsertParty(ORG, { nom: 'KESHAVLAL', roles: ['titulaire'] })
    const user = userEvent.setup()
    renderDialog()

    // Le type par défaut est MAH → la note d'upsell est affichée d'emblée.
    expect(await screen.findByText(/Un seul titulaire d’AMM est inclus/)).toBeInTheDocument()

    await user.type(screen.getByLabelText('Nom *'), 'NOUVEAU MAH')
    await user.click(screen.getByRole('button', { name: 'Créer' }))

    // Upsell au submit, AUCUNE partie créée.
    expect(toast).toHaveBeenCalled()
    expect(await db.parties.get(partyId(ORG, 'NOUVEAU MAH'))).toBeUndefined()
  })

  it('le FABRICANT n’est pas gaté (plan Free, fabricant existant) ; GMP enregistré', async () => {
    mockPlan = 'free'
    await upsertParty(ORG, { nom: 'AUTRE FAB', roles: ['fabricant'] })
    const user = userEvent.setup()
    renderDialog()

    await user.click(screen.getByRole('radio', { name: /Fabricant/ }))
    await user.type(screen.getByLabelText('Nom *'), 'PHARMAX INDIA')
    await user.type(screen.getByLabelText('N° certificat GMP'), 'G/28/1628')
    await user.click(screen.getByRole('button', { name: 'Créer' }))

    await waitFor(async () => {
      const p = await db.parties.get(partyId(ORG, 'PHARMAX INDIA'))
      expect(p?.roles).toEqual(['fabricant'])
      expect(p?.gmpCertificat).toBe('G/28/1628')
    })
  })

  it('MAH sous le plafond : créé avec signataire persisté dans le branding party', async () => {
    mockPlan = 'free' // 0 MAH existant → le 1er est libre
    const user = userEvent.setup()
    renderDialog()

    await user.type(screen.getByLabelText('Nom *'), 'HOLDER SARL')
    await user.type(screen.getByLabelText('Signataire (lettres)'), 'Dr Aïcha Koné')
    await user.click(screen.getByRole('button', { name: 'Créer' }))

    await waitFor(async () => {
      const id = partyId(ORG, 'HOLDER SARL')
      expect((await db.parties.get(id))?.roles).toEqual(['titulaire'])
      const branding = await db.proSettings.get(`party:${id}`)
      expect(branding?.signataire).toBe('Dr Aïcha Koné')
    })
  })
})
