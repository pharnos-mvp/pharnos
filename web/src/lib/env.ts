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
  /**
   * Affiche le bouton « Continuer avec Google ». À n'activer (`VITE_GOOGLE_AUTH=true`)
   * qu'une fois le provider Google réellement configuré côté Supabase Auth — sinon le
   * clic renverrait une erreur « provider non activé ». Permet de livrer le code sans
   * impact prod tant que la console n'est pas prête.
   */
  readonly googleAuthEnabled: boolean
}

function readEnv(): AppEnv {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? ''
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? ''
  return {
    supabaseUrl,
    supabaseAnonKey,
    isSupabaseConfigured: Boolean(supabaseUrl && supabaseAnonKey),
    sentryDsn: import.meta.env.VITE_SENTRY_DSN ?? '',
    googleAuthEnabled: import.meta.env.VITE_GOOGLE_AUTH === 'true',
  }
}

export const env = readEnv()
