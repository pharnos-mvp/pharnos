import type { SupabaseClient } from '@supabase/supabase-js'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { getSupabase } from '@/lib/supabase'
import { requestPasswordReset, resendSignupConfirmation } from './auth-repository'

vi.mock('@/lib/supabase', () => ({ getSupabase: vi.fn() }))

const mockedGetSupabase = vi.mocked(getSupabase)
const asClient = (auth: unknown) => ({ auth }) as unknown as SupabaseClient

afterEach(() => {
  vi.clearAllMocks()
})

describe('auth repository (récupération de compte)', () => {
  it('lève une erreur hors-ligne quand Supabase est indisponible', async () => {
    mockedGetSupabase.mockResolvedValue(null)
    await expect(requestPasswordReset('a@b.com')).rejects.toThrow('Compte indisponible hors-ligne')
    await expect(resendSignupConfirmation('a@b.com')).rejects.toThrow(
      'Compte indisponible hors-ligne',
    )
  })

  it('demande la réinitialisation avec un redirectTo vers l’origine', async () => {
    const resetPasswordForEmail = vi.fn().mockResolvedValue({ error: null })
    mockedGetSupabase.mockResolvedValue(asClient({ resetPasswordForEmail }))
    await requestPasswordReset('user@lab.com')
    expect(resetPasswordForEmail).toHaveBeenCalledWith('user@lab.com', {
      redirectTo: window.location.origin,
    })
  })

  it('renvoie l’e-mail de confirmation d’inscription', async () => {
    const resend = vi.fn().mockResolvedValue({ error: null })
    mockedGetSupabase.mockResolvedValue(asClient({ resend }))
    await resendSignupConfirmation('user@lab.com')
    expect(resend).toHaveBeenCalledWith({ type: 'signup', email: 'user@lab.com' })
  })

  it('propage l’erreur renvoyée par Supabase', async () => {
    const resetPasswordForEmail = vi.fn().mockResolvedValue({ error: new Error('boom') })
    mockedGetSupabase.mockResolvedValue(asClient({ resetPasswordForEmail }))
    await expect(requestPasswordReset('user@lab.com')).rejects.toThrow('boom')
  })
})
