// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AuthContext, type AuthContextValue } from '@/features/auth/auth-context'
import { OrgContext } from '@/features/org/org-context'
import { I18nContext, type I18nValue } from '@/lib/i18n-context'

import { LifecycleActionCard } from './LifecycleActionCard'
import { deriveSubmissionConditions } from './lifecycle-conditions'
import type { LifecycleStageId, LifecycleStatus } from './lifecycle-constants'
import type { StageWaiting } from './lifecycle-waiting'

// État mutable partagé pour piloter rôle + chargement selon le test (rôle réel via `canManageSubmission`).
const ADMIN = { orgId: 'org-test', role: 'admin', orgName: 'Labo' }
const state = vi.hoisted(() => ({
  memberships: [{ orgId: 'org-test', role: 'admin', orgName: 'Labo' }],
  loading: false,
}))
const appendMock = vi.hoisted(() => vi.fn())
const syncMock = vi.hoisted(() => vi.fn())
const reopenMock = vi.hoisted(() => vi.fn())
const syncCorrMock = vi.hoisted(() => vi.fn())

vi.mock('@/features/org/use-current-org', () => ({
  useCurrentOrg: () => ({ ...state, orgId: 'org-test', refresh: async () => {} }),
}))
vi.mock('./lifecycle-repository', () => ({ appendLifecycleEvent: appendMock }))
vi.mock('./lifecycle-sync', () => ({ syncLifecycle: syncMock }))
vi.mock('@/features/correspondence/correspondence-repository', () => ({
  reopenCorrespondenceForReview: reopenMock,
}))
vi.mock('@/features/correspondence/correspondence-sync', () => ({
  syncCorrespondences: syncCorrMock,
}))
const uploadDocMock = vi.hoisted(() => vi.fn())
vi.mock('./lifecycle-docs', () => ({
  uploadLifecycleDoc: uploadDocMock,
  removeLifecycleDocs: vi.fn(),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

// Correspondance décidée minimale (cible du « Renvoyer en revue » M4).
const DECIDED = {
  id: 'c1',
  orgId: 'org-test',
  dossierId: 'd1',
  status: 'suspended',
} as unknown as import('@/lib/db').CorrespondenceRecord

const AUTH: AuthContextValue = {
  session: null,
  user: { id: 'u1', email: 'labo@ex.com' } as AuthContextValue['user'],
  loading: false,
  recovery: false,
  clearRecovery: () => {},
  signOut: async () => {},
}

function renderCard(
  over: {
    currentStageId?: LifecycleStageId
    status?: LifecycleStatus
    hasAuthorityQuery?: boolean
    decidedCorrespondence?: import('@/lib/db').CorrespondenceRecord | null
    waiting?: StageWaiting | null
  } = {},
) {
  const i18n: I18nValue = { lang: 'fr', setLang: () => {}, t: (s) => s.fr }
  return render(
    <I18nContext.Provider value={i18n}>
      <AuthContext.Provider value={AUTH}>
        <OrgContext.Provider value="org-test">
          <LifecycleActionCard
            dossierId="d1"
            country="BJ"
            currentStageId={over.currentStageId ?? 'depot'}
            status={over.status ?? 'accepted'}
            hasAuthorityQuery={over.hasAuthorityQuery ?? false}
            decidedCorrespondence={over.decidedCorrespondence ?? null}
            waiting={over.waiting ?? null}
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
})
afterEach(() => vi.clearAllMocks())

describe('LifecycleActionCard — actions Labo (M2)', () => {
  it('Dépôt (gestionnaire) : bouton Réception par l’agent → confirme → append `deposited` + sync', async () => {
    renderCard({ currentStageId: 'depot', status: 'accepted' })
    fireEvent.click(screen.getByRole('button', { name: /réception par l’agent/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirmer' }))
    await waitFor(() => expect(appendMock).toHaveBeenCalledTimes(1))
    expect(appendMock).toHaveBeenCalledWith(
      'org-test',
      expect.objectContaining({
        dossierId: 'd1',
        type: 'deposited',
        actorId: 'u1',
        actorEmail: 'labo@ex.com',
      }),
    )
    expect(syncMock).toHaveBeenCalledWith('org-test')
  })

  it('AMM accordée : Confirmer désactivé tant que le n° d’AMM est vide (champ requis)', async () => {
    renderCard({ currentStageId: 'notifications', status: 'in_notification' })
    fireEvent.click(screen.getByRole('button', { name: 'AMM accordée' }))
    const confirm = screen.getByRole('button', { name: 'Confirmer' })
    expect(confirm).toBeDisabled()
    fireEvent.change(screen.getByLabelText(/Numéro d’AMM/i), { target: { value: 'AMM-2026-1' } })
    expect(confirm).toBeEnabled()
    fireEvent.click(confirm)
    await waitFor(() => expect(appendMock).toHaveBeenCalledTimes(1))
    expect(appendMock).toHaveBeenCalledWith(
      'org-test',
      expect.objectContaining({
        type: 'amm_granted',
        payload: expect.objectContaining({ amm_number: 'AMM-2026-1' }),
      }),
    )
  })

  it('Notifications : « Réponse au complément » n’apparaît qu’après une notification (ordre du journal)', () => {
    const { rerender } = renderCard({
      currentStageId: 'notifications',
      status: 'in_notification',
      hasAuthorityQuery: false,
    })
    expect(screen.queryByRole('button', { name: /Réponse au complément/i })).not.toBeInTheDocument()
    // Une notification a été journalisée → l'action de réponse se débloque.
    rerender(
      <I18nContext.Provider value={{ lang: 'fr', setLang: () => {}, t: (s) => s.fr }}>
        <AuthContext.Provider value={AUTH}>
          <OrgContext.Provider value="org-test">
            <LifecycleActionCard
              dossierId="d1"
              country="BJ"
              currentStageId="notifications"
              status="in_notification"
              hasAuthorityQuery
            />
          </OrgContext.Provider>
        </AuthContext.Provider>
      </I18nContext.Provider>,
    )
    expect(screen.getByRole('button', { name: /Réponse au complément/i })).toBeInTheDocument()
  })

  it('Notification : payload porte le canal `via` (défaut = agent local) — T4', async () => {
    renderCard({ currentStageId: 'notifications', status: 'in_notification' })
    fireEvent.click(screen.getByRole('button', { name: /Notification \/ complément reçu/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirmer' }))
    await waitFor(() => expect(appendMock).toHaveBeenCalledTimes(1))
    expect(appendMock).toHaveBeenCalledWith(
      'org-test',
      expect.objectContaining({
        type: 'authority_query',
        payload: expect.objectContaining({ via: 'agent' }),
      }),
    )
  })

  it('AMM accordée avec preuve : upload puis docRefs sur l’événement — T4', async () => {
    uploadDocMock.mockResolvedValue({
      path: 'p/preuve.pdf',
      name: 'preuve.pdf',
      size: 9,
      mime: 'application/pdf',
    })
    renderCard({ currentStageId: 'notifications', status: 'in_notification' })
    fireEvent.click(screen.getByRole('button', { name: 'AMM accordée' }))
    fireEvent.change(screen.getByLabelText(/Numéro d’AMM/i), { target: { value: 'AMM-2026-9' } })
    const file = new File(['x'], 'preuve.pdf', { type: 'application/pdf' })
    fireEvent.change(screen.getByLabelText(/Preuve d’AMM/i), { target: { files: [file] } })
    fireEvent.click(screen.getByRole('button', { name: 'Confirmer' }))
    await waitFor(() => expect(appendMock).toHaveBeenCalledTimes(1))
    expect(uploadDocMock).toHaveBeenCalledWith('org-test', 'd1', file)
    expect(appendMock).toHaveBeenCalledWith(
      'org-test',
      expect.objectContaining({
        type: 'amm_granted',
        docRefs: [expect.objectContaining({ name: 'preuve.pdf' })],
      }),
    )
  })

  it('Complément requis (gestionnaire) : « Renvoyer en revue » → confirme → reopen + sync (M4)', async () => {
    renderCard({ currentStageId: 'decision', status: 'suspended', decidedCorrespondence: DECIDED })
    fireEvent.click(screen.getByRole('button', { name: /Renvoyer en revue/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirmer' }))
    await waitFor(() => expect(reopenMock).toHaveBeenCalledTimes(1))
    expect(reopenMock).toHaveBeenCalledWith('c1', 'labo@ex.com')
    expect(syncCorrMock).toHaveBeenCalledWith('org-test')
    // Aucun événement lifecycle : la boucle Décision vit dans la CORRESPONDANCE (étapes amont).
    expect(appendMock).not.toHaveBeenCalled()
  })

  it('Rejeté (gestionnaire) : le bouton « Renvoyer en revue » est aussi proposé', () => {
    renderCard({
      currentStageId: 'decision',
      status: 'rejected',
      decidedCorrespondence: { ...DECIDED, status: 'rejected' },
    })
    expect(screen.getByRole('button', { name: /Renvoyer en revue/i })).toBeInTheDocument()
  })

  it('Complément requis (non-gestionnaire) : pas de bouton, renvoi contextuel', () => {
    state.memberships = []
    renderCard({ currentStageId: 'decision', status: 'suspended', decidedCorrespondence: DECIDED })
    expect(screen.queryByRole('button', { name: /Renvoyer en revue/i })).not.toBeInTheDocument()
  })

  it('non-gestionnaire : aucune action, message lecture seule', () => {
    state.memberships = []
    renderCard({ currentStageId: 'depot', status: 'accepted' })
    expect(screen.queryByRole('button', { name: /réception par l’agent/i })).not.toBeInTheDocument()
    expect(screen.getByText(/gestionnaire de soumission/i)).toBeInTheDocument()
  })

  it('rôles en chargement : pas de message « lecture seule » trompeur', () => {
    state.memberships = []
    state.loading = true
    renderCard({ currentStageId: 'depot', status: 'accepted' })
    expect(screen.queryByText(/gestionnaire de soumission/i)).not.toBeInTheDocument()
    expect(screen.getByText(/Chargement/i)).toBeInTheDocument()
  })

  it('terminal (AMM accordée) : « Parcours terminé », aucune action', () => {
    renderCard({ currentStageId: 'amm', status: 'amm_granted' })
    expect(screen.getByText(/Parcours terminé/i)).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('étape amont (revue) : renvoi contextuel, pas d’action journal', () => {
    renderCard({ currentStageId: 'revue', status: 'in_review' })
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.getByText(/en revue chez l’agent local/i)).toBeInTheDocument()
  })

  it('relance (M5, gestionnaire) : badge d’attente + Relancer → append `reminder_sent` {stage, waiting_days}', async () => {
    const waiting: StageWaiting = {
      since: '2026-06-02T00:00:00.000Z',
      days: 12,
      lastIsReminder: false,
      actor: { fr: 'l’agent local', en: 'the local agent' },
    }
    renderCard({ currentStageId: 'depot', status: 'accepted', waiting })
    expect(screen.getByText(/En attente de l’agent local depuis 12 j/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Relancer' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirmer' }))
    await waitFor(() => expect(appendMock).toHaveBeenCalledTimes(1))
    expect(appendMock).toHaveBeenCalledWith(
      'org-test',
      expect.objectContaining({
        type: 'reminder_sent',
        actorId: 'u1',
        payload: { stage: 'depot', waiting_days: 12 },
      }),
    )
    expect(syncMock).toHaveBeenCalledWith('org-test')
  })

  it('relance (M5) : en REVUE (étape amont) le badge + Relancer apparaissent dans la coquille', () => {
    const waiting: StageWaiting = {
      since: '2026-06-02T00:00:00.000Z',
      days: 3,
      lastIsReminder: false,
      actor: { fr: 'l’agent local', en: 'the local agent' },
    }
    renderCard({ currentStageId: 'revue', status: 'in_review', waiting })
    expect(screen.getByText(/En attente de l’agent local depuis 3 j/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Relancer' })).toBeInTheDocument()
  })

  it('relance (M5, non-gestionnaire) : badge visible mais PAS de bouton Relancer', () => {
    state.memberships = []
    const waiting: StageWaiting = {
      since: '2026-06-13T00:00:00.000Z',
      days: 2,
      lastIsReminder: true,
      actor: { fr: 'l’agent local', en: 'the local agent' },
    }
    renderCard({ currentStageId: 'depot', status: 'accepted', waiting })
    expect(screen.getByText(/Relancé il y a 2 j/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Relancer' })).not.toBeInTheDocument()
  })

  it('modale Soumission : récap des 3 conditions NON BLOQUANT (M3) — nudge mais Confirmer actif', () => {
    const conditions = deriveSubmissionConditions({
      dossierId: 'd1',
      events: [],
      sampleImportAuthRequired: true,
    })
    const i18n: I18nValue = { lang: 'fr', setLang: () => {}, t: (s) => s.fr }
    render(
      <I18nContext.Provider value={i18n}>
        <AuthContext.Provider value={AUTH}>
          <OrgContext.Provider value="org-test">
            <LifecycleActionCard
              dossierId="d1"
              country="BJ"
              currentStageId="soumission"
              status="submitting"
              conditions={conditions}
            />
          </OrgContext.Provider>
        </AuthContext.Provider>
      </I18nContext.Provider>,
    )
    fireEvent.click(screen.getByRole('button', { name: /Marquer comme soumis/i }))
    expect(screen.getByText(/Conditions de soumission — 0 \/ 3/i)).toBeInTheDocument()
    expect(screen.getByText(/Vous pouvez tout de même confirmer/i)).toBeInTheDocument()
    // Non bloquant : le bouton Confirmer reste actif malgré les conditions en attente.
    expect(screen.getByRole('button', { name: 'Confirmer' })).toBeEnabled()
  })
})
