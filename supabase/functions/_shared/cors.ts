// CORS resserré pour les Edge Functions (T2, PLAN-V2) — remplace l'ancien wildcard `*`.
// Origines légitimes : prod + previews Cloudflare Pages (v2, hash deploys) + dev local.
// Une requête sans Origin (curl, server-to-server) n'est pas un contexte navigateur : CORS ne
// s'y applique pas, le JWT reste la barrière d'auth.

const ALLOWED_ORIGIN = /^https:\/\/([a-z0-9-]+\.)?pharnos\.pages\.dev$|^http:\/\/localhost:\d+$/

const BASE_HEADERS = {
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  // Le cache (navigateur/CDN) ne doit jamais resservir une réponse CORS d'une autre origine.
  Vary: 'Origin',
} as const

export const isAllowedOrigin = (origin: string | null): boolean =>
  origin === null || ALLOWED_ORIGIN.test(origin)

/** Headers CORS pour une origine autorisée (écho exact, jamais `*`). */
export function corsHeaders(origin: string | null): Record<string, string> {
  return origin && ALLOWED_ORIGIN.test(origin)
    ? { ...BASE_HEADERS, 'Access-Control-Allow-Origin': origin }
    : { ...BASE_HEADERS }
}
