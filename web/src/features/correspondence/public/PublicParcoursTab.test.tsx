// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { I18nContext } from '@/lib/i18n-context'

import { lifecycleStateFromBlock } from './parcours-data'
import { PublicParcoursTab } from './PublicParcoursTab'
import type { LifecycleBlock, ReviewCorrespondence } from './review-api'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

/**
 * Vue Agent local (M7, LOT 10b) — la dérivation CLIENT réutilise deriveLifecycle (un seul
 * dérivateur) : on teste le mapping bloc serveur → état, le gating des actions par étape,
 * et le payload exact envoyé à l'Edge (parité de dialecte avec le labo).
 */

const CORR: ReviewCorrespondence = {
  productName: 'Amoxicilline 500 mg',
  country: 'BJ',
  activity: 'enregistrement',
  senderEmail: 'ra@labo.example',
  recipientEmail: 'agent@cotonou.example',
  note: null,
  status: 'accepted',
  decidedAt: '2026-06-20T09:00:00.000Z',
  createdAt: '2026-06-10T09:00:00.000Z',
  expiresAt: null,
  pdfSize: 1024,
  hasPassword: false,
}

const block = (over: Partial<LifecycleBlock> = {}): LifecycleBlock => ({
  dossier: { id: 'd1', createdAt: '2026-06-01T09:00:00.000Z' },
  correspondences: [
    {
      id: 'c1',
      status: 'accepted',
      createdAt: '2026-06-10T09:00:00.000Z',
      updatedAt: '2026-06-20T09:00:00.000Z',
      decidedAt: '2026-06-20T09:00:00.000Z',
      revokedAt: null,
    },
  ],
  decisionMessages: [],
  events: [],
  ...over,
})

const ev = (type: string, occurredAt: string, payload: Record<string, unknown> = {}) => ({
  id: `e-${type}-${occurredAt}`,
  type,
  actorId: 'u1',
  occurredAt,
  createdAt: occurredAt,
  payload,
  docRefs: [],
})

function renderTab(b: LifecycleBlock, onEvent = vi.fn().mockResolvedValue(true)) {
  render(
    <I18nContext.Provider value={{ lang: 'fr', setLang: () => {}, t: (s) => s.fr }}>
      <PublicParcoursTab block={b} correspondence={CORR} busy={false} onEvent={onEvent} />
    </I18nContext.Provider>,
  )
  return onEvent
}

describe('parcours-data — dérivation depuis le bloc serveur (même dérivateur que le labo)', () => {
  it('corr acceptée sans événement → étape Dépôt (accepted)', () => {
    const st = lifecycleStateFromBlock(block())
    expect(st.status).toBe('accepted')
    expect(st.currentStageId).toBe('depot')
  })

  it('deposited + submitted → En instruction ; relance système visible au journal (acteur Système)', () => {
    const st = lifecycleStateFromBlock(
      block({
        events: [
          ev('deposited', '2026-06-22T09:00:00.000Z'),
          ev('submitted', '2026-06-24T09:00:00.000Z', { reference: 'ABMed-1' }),
          {
            ...ev('reminder_sent', '2026-07-04T05:17:00.000Z', {
              stage: 'notifications',
              waiting_days: 10,
              threshold_days: 30,
            }),
            actorId: 'system',
          },
        ],
      }),
    )
    expect(st.status).toBe('in_notification')
    const reminder = st.journal.find((j) => j.key === 'reminder_sent')
    expect(reminder?.actor.fr).toBe('Système')
  })
})

describe('PublicParcoursTab — actions de l’agent par étape', () => {
  it('étape Dépôt : confirmation en 2 temps → deposited {}', async () => {
    const onEvent = renderTab(block())
    fireEvent.click(screen.getByRole('button', { name: /Confirmer la réception/ }))
    fireEvent.click(screen.getByRole('button', { name: /Oui, je confirme/ }))
    await waitFor(() => expect(onEvent).toHaveBeenCalledWith('deposited', {}, null))
  })

  it('étape Soumission : mode pays + référence → submitted {mode, reference}', async () => {
    const onEvent = renderTab(block({ events: [ev('deposited', '2026-06-22T09:00:00.000Z')] }))
    fireEvent.change(screen.getByLabelText(/Référence de dépôt/), {
      target: { value: ' ABMed-2026-0784 ' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Confirmer le dépôt/ }))
    await waitFor(() =>
      expect(onEvent).toHaveBeenCalledWith(
        'submitted',
        { mode: 'portal_physical', reference: 'ABMed-2026-0784' }, // BJ = portail + physique
        null,
      ),
    )
  })

  it('étape Notifications : AMM accordée exige le n° ; payload {amm_number, valid_until}', async () => {
    const onEvent = renderTab(
      block({
        events: [
          ev('deposited', '2026-06-22T09:00:00.000Z'),
          ev('submitted', '2026-06-24T09:00:00.000Z'),
        ],
      }),
    )
    fireEvent.click(screen.getByRole('button', { name: /Transmettre la décision d’AMM/ }))
    const submit = screen.getByRole('button', { name: /^Transmettre$/ })
    expect(submit).toBeDisabled() // n° requis
    fireEvent.change(screen.getByLabelText(/N° d’AMM/), { target: { value: 'AMM-BJ-124' } })
    fireEvent.change(screen.getByLabelText(/Valide jusqu’au/), { target: { value: '2031-07-04' } })
    fireEvent.click(submit)
    await waitFor(() =>
      expect(onEvent).toHaveBeenCalledWith(
        'amm_granted',
        { amm_number: 'AMM-BJ-124', valid_until: '2031-07-04' },
        null,
      ),
    )
  })

  it('terminal (AMM accordée) : plus aucune action, carte de clôture', () => {
    renderTab(
      block({
        events: [
          ev('submitted', '2026-06-24T09:00:00.000Z'),
          ev('amm_granted', '2026-07-01T09:00:00.000Z', { amm_number: 'A1' }),
        ],
      }),
    )
    expect(screen.getByText(/Parcours clôturé/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Confirmer/ })).toBeNull()
  })

  it('renvoi en revue (corr in_review) : renvoi vers l’onglet Revue, zéro action aval', () => {
    renderTab(
      block({
        correspondences: [
          {
            id: 'c1',
            status: 'in_review',
            createdAt: '2026-06-10T09:00:00.000Z',
            updatedAt: '2026-06-21T09:00:00.000Z',
            decidedAt: null,
            revokedAt: null,
          },
        ],
      }),
    )
    expect(screen.getByText(/La revue est en cours/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Confirmer la réception/ })).toBeNull()
  })
})
