/**
 * Accès typé et centralisé aux variables d'environnement client (préfixe VITE_).
 * Aucune valeur secrète serveur ici — uniquement des clés publiques.
 */
interface AppEnv {
  readonly supabaseUrl: string
  readonly supabaseAnonKey: string
  readonly isSupabaseConfigured: boolean
}

function readEnv(): AppEnv {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? ''
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? ''
  return {
    supabaseUrl,
    supabaseAnonKey,
    isSupabaseConfigured: Boolean(supabaseUrl && supabaseAnonKey),
  }
}

export const env = readEnv()
