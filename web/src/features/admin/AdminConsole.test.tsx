import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { I18nProvider } from '@/lib/I18nProvider'

import { AdminForbiddenError, type AdminOrg, type AdminOverview } from './admin-api'
import { AdminConsole } from './AdminConsole'

const { overviewMock, orgsMock, auditMock } = vi.hoisted(() => ({
  overviewMock: vi.fn(),
  orgsMock: vi.fn(),
  auditMock: vi.fn(),
}))

// Partiel : seuls les appels réseau (adminApi.*) sont mockés — classes d'erreur et helpers réels.
vi.mock('./admin-api', async (importOriginal) => {
  const mod = await importOriginal<typeof import('./admin-api')>()
  return {
    ...mod,
    adminApi: {
      ...mod.adminApi,
      overview: overviewMock,
      orgs: orgsMock,
      users: vi.fn(),
      plans: vi.fn(),
      audit: auditMock,
    },
  }
})

const OVERVIEW: AdminOverview = {
  generated_at: '2026-07-05T00:00:00Z',
  totals: {
    orgs: 12,
    orgs_active: 11,
    users: 34,
    dossiers: 56,
    products: 21,
    ai_tokens_month: 250000,
    ai_calls_month: 78,
  },
  growth: {
    orgs_30d: 3,
    orgs_prev_30d: 1,
    users_30d: 5,
    users_prev_30d: 5,
    dossiers_30d: 2,
    dossiers_prev_30d: 4,
  },
  health: {
    db_bytes: 100 * 1024 * 1024,
    db_cap_bytes: 500 * 1024 * 1024,
    storage_bytes: 900 * 1024 * 1024,
    storage_cap_bytes: 1024 * 1024 * 1024,
    storage_objects: 42,
  },
  ai_by_kind: { regafy: 200000, translation: 50000 },
  recent_audit: [
    {
      org_id: 'o1',
      actor_email: 'ceo@pharnos.com',
      entity: 'dossier',
      action: 'create',
      label: 'Dossier Bénin — Paracétamol',
      at: '2026-07-04T10:00:00Z',
    },
  ],
}

const ORG: AdminOrg = {
  id: 'o1',
  name: 'Glory Pharma',
  plan: 'pro',
  disabled_at: null,
  created_at: '2026-06-01T00:00:00Z',
  users: 3,
  dossiers: 4,
  products: 5,
  ai_tokens_month: 200000,
  storage_bytes: 1024,
  override: null,
  limits: {
    plan: 'pro',
    max_dossiers: null,
    dossiers_period: 'month',
    monthly_ai_tokens: 1000000,
    max_seats: 5,
    max_storage_bytes: null,
    features: {},
  },
}

function renderConsole() {
  return render(
    <I18nProvider>
      <AdminConsole />
    </I18nProvider>,
  )
}

beforeEach(() => {
  overviewMock.mockReset()
  orgsMock.mockReset()
  auditMock.mockReset()
  orgsMock.mockResolvedValue([ORG])
  auditMock.mockResolvedValue([])
})

describe('AdminConsole', () => {
  it('rend le cockpit : h1, 5 pilules, KPIs, statut santé, répartition IA, top consommateurs, audit', async () => {
    overviewMock.mockResolvedValueOnce(OVERVIEW)
    renderConsole()

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Console plateforme' }),
    ).toBeInTheDocument()

    // Sous-navigation en pilules : 5 sections (dont Journal), l'active porte aria-current.
    const nav = screen.getByRole('navigation', { name: 'Sections de la console' })
    expect(within(nav).getAllByRole('button')).toHaveLength(5)
    expect(within(nav).getByRole('button', { name: "Vue d'ensemble" })).toHaveAttribute(
      'aria-current',
      'page',
    )

    // Bandeau KPI (valeurs) + deltas sémantiques (▲ up, ▼ down, ±0 plat).
    expect(screen.getByText('12')).toBeInTheDocument() // orgs
    expect(screen.getByText('34')).toBeInTheDocument() // users
    expect(screen.getByText('▲ 2')).toBeInTheDocument() // orgs 3 vs 1
    expect(screen.getByText('±0')).toBeInTheDocument() // users 5 vs 5
    expect(screen.getByText('▼ 2')).toBeInTheDocument() // dossiers 2 vs 4

    // Santé : 2 progressbars a11y + statut global « À surveiller » (stockage ~88 % ≥ 70).
    const bars = screen.getAllByRole('progressbar')
    expect(bars).toHaveLength(2)
    expect(bars[0]).toHaveAttribute('aria-valuenow', String(100 * 1024 * 1024))
    expect(screen.getByText('À surveiller')).toBeInTheDocument()

    // Répartition IA par usage + top consommateurs (orgs mocké).
    expect(screen.getByText('regafy')).toBeInTheDocument()
    expect(screen.getByText('translation')).toBeInTheDocument()
    expect(await screen.findByText('Glory Pharma')).toBeInTheDocument()

    // Audit : badge d'action sémantique + libellé.
    expect(screen.getByText('Créé')).toBeInTheDocument()
    expect(screen.getByText('Dossier Bénin — Paracétamol')).toBeInTheDocument()
  })

  it('« Journal complet » bascule sur la section Journal (audit paginé)', async () => {
    overviewMock.mockResolvedValueOnce(OVERVIEW)
    renderConsole()
    await screen.findByRole('heading', { level: 1, name: 'Console plateforme' })

    fireEvent.click(screen.getByRole('button', { name: /Journal complet/ }))

    expect(await screen.findByText("Journal d'audit complet")).toBeInTheDocument()
    expect(auditMock).toHaveBeenCalledWith({ limit: 50, orgId: undefined })
    const nav = screen.getByRole('navigation', { name: 'Sections de la console' })
    expect(within(nav).getByRole('button', { name: 'Journal' })).toHaveAttribute(
      'aria-current',
      'page',
    )
  })

  it('403 Edge → écran « Accès refusé » (console réservée aux super-admins)', async () => {
    overviewMock.mockRejectedValueOnce(new AdminForbiddenError('forbidden'))
    renderConsole()

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Accès refusé' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: "Retour à l'application" })).toHaveAttribute(
      'href',
      '/',
    )
  })

  it('erreur réseau → ErrorState actionnable, et « Réessayer » recharge la console', async () => {
    overviewMock.mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce(OVERVIEW)
    renderConsole()

    expect(await screen.findByText('Console indisponible')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }))

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Console plateforme' }),
    ).toBeInTheDocument()
    expect(overviewMock).toHaveBeenCalledTimes(2)
  })
})
