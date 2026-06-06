import { useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'

import { env } from '@/lib/env'
import { getSupabase } from '@/lib/supabase'
import { AuthContext } from './auth-context'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  // Si Supabase n'est pas configuré (tests / mode local), pas de chargement réseau.
  const [loading, setLoading] = useState(env.isSupabaseConfigured)

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
      const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => setSession(next))
      unsubscribe = () => sub.subscription.unsubscribe()
    })

    return () => {
      active = false
      unsubscribe?.()
    }
  }, [])

  async function signOut() {
    const supabase = await getSupabase()
    await supabase?.auth.signOut()
  }

  return (
    <AuthContext.Provider value={{ session, user: session?.user ?? null, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}
