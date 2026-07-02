// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AuthContext, type AuthContextValue } from '@/features/auth/auth-context'
import { OrgContext } from '@/features/org/org-context'
import { I18nContext, type I18nValue } from '@/lib/i18n-context'
import type { LifecycleEventRecord } from '@/lib/db'

import { LifecycleConditionsPanel } from './LifecycleConditionsPanel'
import { deriveSubmissionConditions } from './lifecycle-conditions'

// État mutable partagé (même harnais que LifecycleActionCard.test).
const ADMIN = { orgId: 'org-test', role: 'admin', orgName: 'Labo' }
const state = vi.hoisted(() => ({
  memberships: [{ orgId: 'org-test', role: 'admin', orgName: 'Labo' }],
  loading: false,
}))
const appendMock = vi.hoisted(() => vi.fn())
const syncMock = vi.hoisted(() => vi.fn())
const uploadMock = vi.hoisted(() => vi.fn())

vi.mock('@/features/org/use-current-org', () => ({
  useCurrentOrg: () => ({ ...state, orgId: 'org-test', refresh: async () => {} }),
}))
vi.mock('./lifecycle-repository', () => ({ appendLifecycleEvent: appendMock }))
vi.mock('./lifecycle-sync', () => ({ syncLifecycle: syncMock }))
vi.mock('./lifecycle-docs', () => ({
  uploadLifecycleDoc: uploadMock,
  removeLifecycleDocs: vi.fn(),
  openLifecycleDoc: vi.fn(),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const AUTH: AuthContextValue = {
  session: null,
  user: { id: 'u1', email: 'labo@ex.com' } as AuthContextValue['user'],
  loading: false,
  recovery: false,
  clearRecovery: () => {},
  signOut: async () => {},
}

const ev = (over: Partial<LifecycleEventRecord>): LifecycleEventRecord => ({
  id: crypto.randomUUID(),
  orgId: 'org-test',
  dossierId: 'd1',
  type: 'deposited',
  actorId: 'u1',
  actorEmail: 'labo@ex.com',
  occurredAt: '2026-06-10T00:00:00.000Z',
  payload: {},
  docRefs: [],
  createdAt: '2026-06-10T00:00:00.000Z',
  ...over,
})

function renderPanel(events: LifecycleEventRecord[] = [], over: { submitted?: boolean } = {}) {
  const conditions = deriveSubmissionConditions({
    dossierId: 'd1',
    events,
    sampleImportAuthRequired: true,
  })
  const i18n: I18nValue = { lang: 'fr', setLang: () => {}, t: (s) => s.fr }
  return render(
    <I18nContext.Provider value={i18n}>
      <AuthContext.Provider value={AUTH}>
        <OrgContext.Provider value="org-test">
          <LifecycleConditionsPanel
            dossierId="d1"
            conditions={conditions}
            defaultCurrency="FCFA"
            submitted={over.submitted ?? false}
          />
        </OrgContext.Provider>
      </AuthContext.Provider>
    </I18nContext.Provider>,
  )
}

beforeEach(() => {
  state.memberships = [{ ...ADMIN }]
  state.loading = false
  appendMock.mockResolvedValue({})
  uploadMock.mockResolvedValue({ path: 'p', name: 'n.pdf', size: 1, mime: 'application/pdf' })
})
afterEach(() => vi.clearAllMocks())

describe('LifecycleConditionsPanel — conditions de soumission (M3)', () => {
  it('affiche les 3 conditions + compteur 0/3, échantillons dépliés par défaut (1re actionnable)', () => {
    renderPanel()
    expect(screen.getByText(/Conditions de soumission · 0 \/ 3/i)).toBeInTheDocument()
    expect(screen.getByText(/Dossier CTD compilé/i)).toBeInTheDocument()
    expect(screen.getByText(/Paiement des frais/i)).toBeInTheDocument()
    // CTD est en 1re position mais n'est pas actionnable → c'est Échantillons qui s'ouvre.
    expect(screen.getByRole('button', { name: 'Échantillons demandés' })).toBeInTheDocument()
  })

  it('sous-étape → modale → Journaliser → append avec payload + docRefs vides (sans pièce)', async () => {
    renderPanel()
    fireEvent.click(screen.getByRole('button', { name: 'Échantillons demandés' }))
    fireEvent.click(screen.getByRole('button', { name: 'Journaliser' }))
    await waitFor(() => expect(appendMock).toHaveBeenCalledTimes(1))
    expect(appendMock).toHaveBeenCalledWith(
      'org-test',
      expect.objectContaining({
        dossierId: 'd1',
        type: 'samples_requested',
        actorId: 'u1',
        docRefs: [],
      }),
    )
    expect(syncMock).toHaveBeenCalledWith('org-test')
    expect(uploadMock).not.toHaveBeenCalled()
  })

  it('frais : montant + devise + référence journalisés dans le payload', async () => {
    renderPanel()
    // Ouvre la ligne Frais (repliée), puis son action.
    fireEvent.click(screen.getByRole('button', { name: /Paiement des frais/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Frais notifiés' }))
    fireEvent.change(screen.getByLabelText(/Montant/i), { target: { value: '850000' } })
    fireEvent.change(screen.getByLabelText(/Référence/i), { target: { value: 'FACT-12' } })
    fireEvent.click(screen.getByRole('button', { name: 'Journaliser' }))
    await waitFor(() => expect(appendMock).toHaveBeenCalledTimes(1))
    expect(appendMock).toHaveBeenCalledWith(
      'org-test',
      expect.objectContaining({
        type: 'fees_invoiced',
        payload: { amount: 850000, currency: 'FCFA', reference: 'FACT-12' },
      }),
    )
  })

  it('preuve de paiement : montant prérempli depuis le dernier `fees_invoiced`', () => {
    renderPanel([ev({ type: 'fees_invoiced', payload: { amount: 850000, currency: 'FCFA' } })])
    // Ouvre la ligne Frais (l'accordéon par défaut ouvre Échantillons, 1re actionnable).
    fireEvent.click(screen.getByRole('button', { name: /Paiement des frais/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Preuve de paiement déposée' }))
    expect(screen.getByLabelText(/Montant/i)).toHaveValue(850000)
  })

  it('pièce jointe : upload puis append avec la référence de la pièce', async () => {
    renderPanel([ev({ type: 'samples_import_authorized' })])
    fireEvent.click(screen.getByRole('button', { name: 'Échantillons expédiés' }))
    const file = new File(['x'], 'lta.pdf', { type: 'application/pdf' })
    fireEvent.change(screen.getByLabelText(/LTA \/ AWB \(recommandée\)/i), {
      target: { files: [file] },
    })
    fireEvent.change(screen.getByLabelText(/N° LTA/i), { target: { value: 'DHL-1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Journaliser' }))
    await waitFor(() => expect(appendMock).toHaveBeenCalledTimes(1))
    expect(uploadMock).toHaveBeenCalledWith('org-test', 'd1', file)
    expect(appendMock).toHaveBeenCalledWith(
      'org-test',
      expect.objectContaining({
        type: 'samples_shipped',
        payload: { awb: 'DHL-1' },
        docRefs: [{ path: 'p', name: 'n.pdf', size: 1, mime: 'application/pdf' }],
      }),
    )
  })

  it('non-gestionnaire : état visible mais aucune action de saisie', () => {
    state.memberships = []
    renderPanel()
    expect(screen.getByText(/Conditions de soumission · 0 \/ 3/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Échantillons demandés' })).not.toBeInTheDocument()
  })

  it('soumission confirmée : replié en récap 1 ligne, dépliable', () => {
    renderPanel([ev({ type: 'submitted' })], { submitted: true })
    const recap = screen.getByRole('button', { name: /Conditions de soumission · 0 \/ 3/i })
    expect(screen.queryByText(/jamais bloquantes/i)).not.toBeInTheDocument()
    fireEvent.click(recap)
    expect(screen.getByText(/jamais bloquantes/i)).toBeInTheDocument()
  })
})
