import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { I18nProvider } from '@/lib/I18nProvider'

import { AdminForbiddenError, type AdminOverview } from './admin-api'
import { AdminConsole } from './AdminConsole'

const { overviewMock } = vi.hoisted(() => ({ overviewMock: vi.fn() }))

// Partiel : seuls les appels réseau (adminApi.*) sont mockés — classes d'erreur et helpers réels.
vi.mock('./admin-api', async (importOriginal) => {
  const mod = await importOriginal<typeof import('./admin-api')>()
  return {
    ...mod,
    adminApi: {
      ...mod.adminApi,
      overview: overviewMock,
      orgs: vi.fn(),
      users: vi.fn(),
      plans: vi.fn(),
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

function renderConsole() {
  return render(
    <I18nProvider>
      <AdminConsole />
    </I18nProvider>,
  )
}

beforeEach(() => {
  overviewMock.mockReset()
})

describe('AdminConsole', () => {
  it('rend la vue d’ensemble : h1, pilules, KPIs, jauges (info/warning/danger) et audit', async () => {
    overviewMock.mockResolvedValueOnce(OVERVIEW)
    renderConsole()

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Console plateforme' }),
    ).toBeInTheDocument()

    // Sous-navigation en pilules : 4 sections, l'active porte aria-current.
    const nav = screen.getByRole('navigation', { name: 'Sections de la console' })
    expect(within(nav).getAllByRole('button')).toHaveLength(4)
    expect(within(nav).getByRole('button', { name: "Vue d'ensemble" })).toHaveAttribute(
      'aria-current',
      'page',
    )

    // KPIs de croissance (valeurs) + delta sémantique (▲ up, ▼ down, ±0 plat).
    expect(screen.getByText('12')).toBeInTheDocument() // orgs
    expect(screen.getByText('34')).toBeInTheDocument() // users
    expect(screen.getByText('▲ 2')).toBeInTheDocument() // orgs 3 vs 1
    expect(screen.getByText('±0')).toBeInTheDocument() // users 5 vs 5
    expect(screen.getByText('▼ 2')).toBeInTheDocument() // dossiers 2 vs 4

    // Jauges santé : 2 progressbars a11y, la DB à 20 % et le stockage à ~88 % (warning ≥ 70).
    const bars = screen.getAllByRole('progressbar')
    expect(bars).toHaveLength(2)
    expect(bars[0]).toHaveAttribute('aria-valuenow', String(100 * 1024 * 1024))

    // Audit : badge d'action sémantique + libellé.
    expect(screen.getByText('Créé')).toBeInTheDocument()
    expect(screen.getByText('Dossier Bénin — Paracétamol')).toBeInTheDocument()
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
