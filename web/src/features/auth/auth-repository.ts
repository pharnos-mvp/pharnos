import { getSupabase } from '@/lib/supabase'

/**
 * Envoie un e-mail de réinitialisation de mot de passe.
 *
 * Le lien renvoie vers l'app (`redirectTo`) avec un jeton de récupération ;
 * `detectSessionInUrl` (voir `lib/supabase.ts`) déclenche alors l'événement
 * `PASSWORD_RECOVERY` capté par `AuthProvider`.
 */
export async function requestPasswordReset(email: string): Promise<void> {
  const supabase = await getSupabase()
  if (!supabase) throw new Error('Compte indisponible hors-ligne')
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin,
  })
  if (error) throw error
}

/** Renvoie l'e-mail de confirmation d'inscription (pour une adresse non encore confirmée). */
export async function resendSignupConfirmation(email: string): Promise<void> {
  const supabase = await getSupabase()
  if (!supabase) throw new Error('Compte indisponible hors-ligne')
  const { error } = await supabase.auth.resend({ type: 'signup', email })
  if (error) throw error
}

/**
 * Démarre la connexion Google (OAuth, flux PKCE côté Supabase).
 *
 * En cas de succès le navigateur est redirigé vers Google ; au retour sur `redirectTo`,
 * `detectSessionInUrl` (cf. `lib/supabase.ts`) capte le jeton et `AuthProvider` reçoit
 * l'événement `SIGNED_IN`. On reste donc volontairement sans valeur de retour.
 */
export async function signInWithGoogle(): Promise<void> {
  const supabase = await getSupabase()
  if (!supabase) throw new Error('Compte indisponible hors-ligne')
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin },
  })
  if (error) throw error
}
