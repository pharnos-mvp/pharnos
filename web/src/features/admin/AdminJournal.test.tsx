import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { I18nProvider } from '@/lib/I18nProvider'

import type { AdminAuditEntry } from './admin-api'
import { AdminJournal } from './AdminJournal'

const { auditMock, orgsMock } = vi.hoisted(() => ({ auditMock: vi.fn(), orgsMock: vi.fn() }))

vi.mock('./admin-api', async (importOriginal) => {
  const mod = await importOriginal<typeof import('./admin-api')>()
  return {
    ...mod,
    adminApi: { ...mod.adminApi, audit: auditMock, orgs: orgsMock },
  }
})

/** Entrée déterministe : id/at uniques et décroissants (i=0 le plus récent). */
function entry(i: number): AdminAuditEntry {
  return {
    id: `00000000-0000-0000-0000-${String(i).padStart(12, '0')}`,
    org_id: 'o1',
    org_name: 'Glory Pharma',
    actor_email: 'ceo@pharnos.com',
    entity: 'dossier',
    action: 'create',
    label: `Entrée ${i}`,
    at: new Date(Date.UTC(2026, 5, 30, 12, 0, 0) - i * 60_000).toISOString(),
  }
}

function renderJournal() {
  return render(
    <I18nProvider>
      <AdminJournal />
    </I18nProvider>,
  )
}

beforeEach(() => {
  auditMock.mockReset()
  orgsMock.mockReset()
  orgsMock.mockResolvedValue([])
})

describe('AdminJournal', () => {
  it('pagine au curseur keyset : page pleine → « Charger plus » (curseur = dernière ligne), page courte → fin', async () => {
    const page1 = Array.from({ length: 50 }, (_, i) => entry(i))
    const page2 = [entry(50), entry(51)]
    auditMock.mockResolvedValueOnce(page1).mockResolvedValueOnce(page2)

    renderJournal()

    // Page 1 : 50 lignes + bouton « Charger plus » (page pleine ⇒ il en reste peut-être).
    expect(await screen.findByText('Entrée 0')).toBeInTheDocument()
    expect(screen.getAllByRole('listitem')).toHaveLength(50)
    const more = screen.getByRole('button', { name: 'Charger plus' })

    fireEvent.click(more)

    // Le 2e appel porte le curseur (at + id) de la DERNIÈRE ligne reçue (= entry(49)).
    await waitFor(() => expect(auditMock).toHaveBeenCalledTimes(2))
    const last = entry(49)
    expect(auditMock).toHaveBeenLastCalledWith({
      limit: 50,
      beforeAt: last.at,
      beforeId: last.id,
      orgId: undefined,
    })

    // Page 2 courte (2 < 50) : lignes ajoutées, fin du journal affichée.
    expect(await screen.findByText('Entrée 51')).toBeInTheDocument()
    expect(screen.getAllByRole('listitem')).toHaveLength(52)
    expect(screen.getByText('Fin du journal.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Charger plus' })).not.toBeInTheDocument()
  })

  it('journal vide → EmptyState', async () => {
    auditMock.mockResolvedValueOnce([])
    renderJournal()
    expect(await screen.findByText('Aucune entrée')).toBeInTheDocument()
  })

  it('filtre org : la première page ET le curseur « Charger plus » portent orgId', async () => {
    const page1 = Array.from({ length: 50 }, (_, i) => entry(i))
    auditMock.mockResolvedValueOnce(page1).mockResolvedValueOnce([])

    render(
      <I18nProvider>
        <AdminJournal initialOrgFilter="11111111-1111-1111-1111-111111111111" />
      </I18nProvider>,
    )

    expect(await screen.findByText('Entrée 0')).toBeInTheDocument()
    expect(auditMock).toHaveBeenCalledWith({
      limit: 50,
      orgId: '11111111-1111-1111-1111-111111111111',
    })

    fireEvent.click(screen.getByRole('button', { name: 'Charger plus' }))
    await waitFor(() => expect(auditMock).toHaveBeenCalledTimes(2))
    const last = entry(49)
    expect(auditMock).toHaveBeenLastCalledWith({
      limit: 50,
      beforeAt: last.at,
      beforeId: last.id,
      orgId: '11111111-1111-1111-1111-111111111111',
    })
    // Page vide en retour → fin du journal (cas « multiple exact de 50 »).
    expect(await screen.findByText('Fin du journal.')).toBeInTheDocument()
  })

  it('erreur → ErrorState, « Réessayer » recharge', async () => {
    auditMock.mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce([entry(0)])
    renderJournal()

    expect(await screen.findByText('Journal indisponible')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }))

    expect(await screen.findByText('Entrée 0')).toBeInTheDocument()
    expect(auditMock).toHaveBeenCalledTimes(2)
  })
})
