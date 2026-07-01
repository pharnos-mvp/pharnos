// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AuthContext, type AuthContextValue } from '@/features/auth/auth-context'
import { OrgContext } from '@/features/org/org-context'
import { I18nContext, type I18nValue } from '@/lib/i18n-context'

import { LifecycleActionCard } from './LifecycleActionCard'
import type { LifecycleStageId, LifecycleStatus } from './lifecycle-constants'

// État mutable partagé pour piloter rôle + chargement selon le test (rôle réel via `canManageSubmission`).
const ADMIN = { orgId: 'org-test', role: 'admin', orgName: 'Labo' }
const state = vi.hoisted(() => ({
  memberships: [{ orgId: 'org-test', role: 'admin', orgName: 'Labo' }],
  loading: false,
}))
const appendMock = vi.hoisted(() => vi.fn())
const syncMock = vi.hoisted(() => vi.fn())

vi.mock('@/features/org/use-current-org', () => ({
  useCurrentOrg: () => ({ ...state, orgId: 'org-test', refresh: async () => {} }),
}))
vi.mock('./lifecycle-repository', () => ({ appendLifecycleEvent: appendMock }))
vi.mock('./lifecycle-sync', () => ({ syncLifecycle: syncMock }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

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
  it('Dépôt (gestionnaire) : bouton Transmettre → confirme → append `deposited` + sync', async () => {
    renderCard({ currentStageId: 'depot', status: 'accepted' })
    fireEvent.click(screen.getByRole('button', { name: /Transmettre/i }))
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

  it('non-gestionnaire : aucune action, message lecture seule', () => {
    state.memberships = []
    renderCard({ currentStageId: 'depot', status: 'accepted' })
    expect(screen.queryByRole('button', { name: /Transmettre/i })).not.toBeInTheDocument()
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
})
