import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { OrgPlan } from '@/features/org/use-org-plan'
import { I18nProvider } from '@/lib/I18nProvider'
import { AbonnementSection } from './AccountPage'

// Plan FREE de référence : compilations à saturation (jauge), tokens 0/0 (pas de jauge),
// stockage illimité (∞), team/regafy en Vitrine (badges upsell P0-3), translation Masquée.
const FREE_PLAN: OrgPlan = {
  plan: 'free',
  billing_period: 'monthly',
  disabled: false,
  sync_enabled: true,
  max_dossiers: null,
  dossiers_period: 'month',
  max_compilations: 1,
  compilations_period: 'month',
  monthly_ai_tokens: 0,
  max_seats: 1,
  max_storage_bytes: null,
  features: { team: 'teaser', regafy: 'teaser', translation: 'hidden', correspondence: 'enabled' },
  tokens_used: 0,
  dossiers_used: 0,
  compilations_used: 1,
  storage_used: 123,
}

vi.mock('@/features/org/use-org-plan', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@/features/org/use-org-plan')>()
  return {
    ...mod,
    useOrgPlan: () => ({ data: FREE_PLAN, isLoading: false, refetch: vi.fn() }),
  }
})

function renderSection() {
  return render(
    <I18nProvider>
      <QueryClientProvider client={new QueryClient()}>
        <AbonnementSection />
      </QueryClientProvider>
    </I18nProvider>,
  )
}

describe('AbonnementSection', () => {
  it('affiche les jauges d’usage — barre uniquement quand un plafond est consommable', () => {
    renderSection()
    // Compilations 1/1 → jauge saturée ; tokens 0/0 et stockage ∞ → pas de jauge.
    const bars = screen.getAllByRole('progressbar')
    expect(bars).toHaveLength(1)
    expect(bars[0]).toHaveAttribute('aria-valuenow', '1')
    expect(bars[0]).toHaveAttribute('aria-valuemax', '1')
    expect(screen.getByText(/∞/)).toBeInTheDocument()
  })

  it('marque le plan courant et ne propose que les mises à niveau (barème 5 plans)', () => {
    renderSection()
    expect(screen.getByText('Votre plan')).toBeInTheDocument()
    // Free → 4 upgrades proposées, jamais de bouton vers le plan courant ou inférieur.
    expect(screen.getByRole('button', { name: /Passer à Pro/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Passer à Entreprise/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Passer à Free/ })).not.toBeInTheDocument()
  })

  it('rend les features 3 états : Vitrine avec badge « dès X », Masquée invisible', () => {
    renderSection()
    expect(screen.getByText('dès Team')).toBeInTheDocument()
    expect(screen.getByText('dès Pro')).toBeInTheDocument()
    // `translation` est Masquée → n'apparaît pas.
    expect(screen.queryByText('Traduction')).not.toBeInTheDocument()
  })
})
