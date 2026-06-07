/**
 * Accès typé et centralisé aux variables d'environnement client (préfixe VITE_).
 * Aucune valeur secrète serveur ici — uniquement des clés publiques.
 */
interface AppEnv {
  readonly supabaseUrl: string
  readonly supabaseAnonKey: string
  readonly isSupabaseConfigured: boolean
  /** DSN Sentry (clé publique, non secrète). Vide = observabilité désactivée (no-op). */
  readonly sentryDsn: string
}

function readEnv(): AppEnv {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? ''
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? ''
  return {
    supabaseUrl,
    supabaseAnonKey,
    isSupabaseConfigured: Boolean(supabaseUrl && supabaseAnonKey),
    sentryDsn: import.meta.env.VITE_SENTRY_DSN ?? '',
  }
}

export const env = readEnv()
