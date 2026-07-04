import { useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'

import { setAuditActor } from '@/lib/audit'
import { env } from '@/lib/env'
import { clearLocalData, reconcileLocalDataOwner } from '@/lib/local-data'
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

    // Publie la session APRÈS la garde de changement de compte : si le cache local appartient à un
    // AUTRE utilisateur (swap de session sur un navigateur partagé), il est purgé AVANT le 1er rendu
    // porteur de données — jamais de flash des données de l'utilisateur précédent.
    const publish = async (next: Session | null) => {
      const uid = next?.user?.id
      if (uid) await reconcileLocalDataOwner(uid)
      if (active) setSession(next)
    }

    void getSupabase().then((supabase) => {
      if (!supabase || !active) return
      void supabase.auth.getSession().then(async ({ data }) => {
        if (!active) return
        await publish(data.session)
        if (active) setLoading(false)
      })
      const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
        if (event === 'PASSWORD_RECOVERY') setRecovery(true)
        void publish(next)
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
    // Purge le cache local : le navigateur peut être partagé — le prochain compte ne doit pas
    // hériter des données synchronisées de celui-ci (CS1 : agents externes sur machine commune).
    await clearLocalData()
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
