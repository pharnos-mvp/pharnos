import type { SupabaseClient } from '@supabase/supabase-js'

import { env } from '@/lib/env'

/**
 * Accès paresseux au client Supabase.
 *
 * `@supabase/supabase-js` est importé dynamiquement → il reste hors du bundle initial
 * (chargé à la première utilisation : vérification de session, login, sync…).
 * Retourne `null` si les clés ne sont pas configurées (tests / mode local offline).
 */
let clientPromise: Promise<SupabaseClient> | null = null

export function getSupabase(): Promise<SupabaseClient | null> {
  if (!env.isSupabaseConfigured) return Promise.resolve(null)
  if (!clientPromise) {
    clientPromise = import('@supabase/supabase-js').then(({ createClient }) =>
      createClient(env.supabaseUrl, env.supabaseAnonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
      }),
    )
  }
  return clientPromise
}

export const isSupabaseConfigured = env.isSupabaseConfigured
