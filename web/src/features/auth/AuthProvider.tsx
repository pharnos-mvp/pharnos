import { useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'

import { setAuditActor } from '@/lib/audit'
import { env } from '@/lib/env'
import { getSupabase } from '@/lib/supabase'
import { AuthContext } from './auth-context'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  // Si Supabase n'est pas configuré (tests / mode local), pas de chargement réseau.
  const [loading, setLoading] = useState(env.isSupabaseConfigured)
  // L'utilisateur arrive via un lien « mot de passe oublié » → écran de reset (cf. App).
  const [recovery, setRecovery] = useState(false)

  useEffect(() => {
    if (!env.isSupabaseConfigured) return
    let active = true
    let unsubscribe: (() => void) | undefined

    void getSupabase().then((supabase) => {
      if (!supabase || !active) return
      void supabase.auth.getSession().then(({ data }) => {
        if (!active) return
        setSession(data.session)
        setLoading(false)
      })
      const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
        setSession(next)
        if (event === 'PASSWORD_RECOVERY') setRecovery(true)
      })
      unsubscribe = () => sub.subscription.unsubscribe()
    })

    return () => {
      active = false
      unsubscribe?.()
    }
  }, [])

  // Acteur courant pour le journal d'audit (qui agit).
  useEffect(() => {
    const u = session?.user
    setAuditActor(u ? { id: u.id, email: u.email ?? u.id } : null)
  }, [session])

  async function signOut() {
    const supabase = await getSupabase()
    await supabase?.auth.signOut()
    setRecovery(false)
  }

  return (
    <AuthContext.Provider
      value={{
        session,
        user: session?.user ?? null,
        loading,
        recovery,
        clearRecovery: () => setRecovery(false),
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}
