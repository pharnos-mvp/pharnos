import { createContext, useContext } from 'react'
import type { Session, User } from '@supabase/supabase-js'

export interface AuthContextValue {
  session: Session | null
  user: User | null
  loading: boolean
  /** Vrai quand l'utilisateur arrive via un lien de récupération (événement `PASSWORD_RECOVERY`). */
  recovery: boolean
  /** Sort du mode récupération une fois le nouveau mot de passe défini. */
  clearRecovery: () => void
  signOut: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth doit être utilisé à l’intérieur de <AuthProvider>')
  }
  return ctx
}
