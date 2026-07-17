// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { I18nProvider } from '@/lib/I18nProvider'
import { OnboardingPage } from './OnboardingPage'

const createOrgOnboarding = vi.fn().mockResolvedValue('org-1')
vi.mock('./org-repository', () => ({
  createOrgOnboarding: (name: string, plan: string, code: string) =>
    createOrgOnboarding(name, plan, code),
}))
const setOrgProfile = vi.fn().mockResolvedValue(undefined)
vi.mock('@/features/profile/pro-settings-repository', () => ({
  setOrgProfile: (orgId: string, profile: unknown) => setOrgProfile(orgId, profile),
}))
vi.mock('@/features/profile/pro-settings-sync', () => ({ syncProSettings: vi.fn() }))

const render0 = (onCreated = vi.fn()) =>
  render(<OnboardingPage onCreated={onCreated} />, { wrapper: I18nProvider })

beforeEach(() => {
  createOrgOnboarding.mockClear()
  setOrgProfile.mockClear()
  window.localStorage.clear()
})

const nameStep = () => {
  fireEvent.change(screen.getByLabelText("Code d'invitation"), {
    target: { value: 'DR-KOUAME' },
  })
  fireEvent.change(screen.getByLabelText("Nom de l'organisation"), {
    target: { value: 'Sahel Pharma' },
  })
}

describe('OnboardingPage — 3 étapes, Passer, défaut Free', () => {
  it('aucun plan choisi (Passer) → org créée en Free, avec le code d’invitation', async () => {
    render0()
    nameStep()
    fireEvent.click(screen.getByRole('button', { name: /Continuer/ }))
    // étape Plan : on saute sans choisir
    fireEvent.click(screen.getByRole('button', { name: /Passer/ }))
    // étape Équipe : Terminer
    fireEvent.click(screen.getByRole('button', { name: /Terminer/ }))
    await waitFor(() =>
      expect(createOrgOnboarding).toHaveBeenCalledWith('Sahel Pharma', 'free', 'DR-KOUAME'),
    )
    // entreprise = nom de l'org (plus d'étape « infos pro »)
    expect(setOrgProfile).toHaveBeenCalledWith(
      'org-1',
      expect.objectContaining({ entreprise: 'Sahel Pharma' }),
    )
  })

  it('un plan explicitement choisi est respecté (≠ Free)', async () => {
    render0()
    nameStep()
    fireEvent.click(screen.getByRole('button', { name: /Continuer/ }))
    // choisir la carte « Recommandé » (Pro)
    const proCard = screen.getByText('Recommandé').closest('button')!
    fireEvent.click(proCard)
    fireEvent.click(screen.getByRole('button', { name: /Continuer/ }))
    fireEvent.click(screen.getByRole('button', { name: /Terminer/ }))
    await waitFor(() =>
      expect(createOrgOnboarding).toHaveBeenCalledWith('Sahel Pharma', 'pro', 'DR-KOUAME'),
    )
  })

  it('plan payant choisi puis Passer (après Retour) → Free (invariant anti-régression)', async () => {
    render0()
    nameStep()
    fireEvent.click(screen.getByRole('button', { name: /Continuer/ }))
    fireEvent.click(screen.getByText('Recommandé').closest('button')!) // choisir Pro
    fireEvent.click(screen.getByRole('button', { name: /Continuer/ })) // → équipe
    fireEvent.click(screen.getByRole('button', { name: /Retour/ })) // retour au plan
    fireEvent.click(screen.getByRole('button', { name: /Passer/ })) // on passe → reset Free
    fireEvent.click(screen.getByRole('button', { name: /Terminer/ }))
    await waitFor(() =>
      expect(createOrgOnboarding).toHaveBeenCalledWith('Sahel Pharma', 'free', 'DR-KOUAME'),
    )
  })

  it("le nom de l'organisation est requis (Continuer désactivé tant qu'il manque)", () => {
    render0()
    expect(screen.getByRole('button', { name: /Continuer/ })).toBeDisabled()
  })

  it("sans code d'invitation, Continuer reste désactivé (accès sur invitation)", () => {
    render0()
    fireEvent.change(screen.getByLabelText("Nom de l'organisation"), {
      target: { value: 'Sahel Pharma' },
    })
    expect(screen.getByRole('button', { name: /Continuer/ })).toBeDisabled()
    // un code au bon format débloque
    fireEvent.change(screen.getByLabelText("Code d'invitation"), {
      target: { value: 'dr-kouame' },
    })
    expect(screen.getByRole('button', { name: /Continuer/ })).toBeEnabled()
  })

  it('le code du lien /i/CODE (localStorage pré-OAuth) préremplit le champ', () => {
    window.localStorage.setItem('pharnos.inviteCode', 'EXPERT-42')
    render0()
    expect(screen.getByLabelText("Code d'invitation")).toHaveValue('EXPERT-42')
  })
})
