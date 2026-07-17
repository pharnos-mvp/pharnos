// Edge Function `invite-info` — résolution PUBLIQUE d'un code d'invitation pour la page
// pharnos.com/i/CODE (« {expert} vous invite sur Pharnos »).
//
// Contrat sécurité :
//   • verify_jwt = false : le prospect n'a pas de compte. Surface minuscule — GET, un paramètre,
//     et la SEULE donnée retournée est le label public de l'expert (pensé pour être affiché).
//   • Anti-énumération : format strict, rate-limit par IP (share_hit, fail-closed), et un code
//     inactif (révoqué/expiré/épuisé/inconnu) répond un 404 UNIFORME — aucun détail du motif.
//   • CORS dédié à la landing (même allowlist que demo-request) — l'allowlist app reste intacte.
import { createClient } from 'npm:@supabase/supabase-js@2'

import { logJson, newReqId } from '../_shared/log.ts'

const CODE_RE = /^[A-Z0-9][A-Z0-9-]{2,31}$/
const IP_WINDOW_S = 600
const IP_MAX_HITS = 30

const ALLOWED_ORIGIN =
  /^https:\/\/(www\.)?pharnos\.com$|^https:\/\/([a-z0-9-]+\.)?pharnos-landing\.pages\.dev$|^http:\/\/localhost:\d+$/

const BASE_HEADERS = {
  'Access-Control-Allow-Headers': 'content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  Vary: 'Origin',
} as const

function cors(origin: string | null): Record<string, string> {
  return origin && ALLOWED_ORIGIN.test(origin)
    ? { ...BASE_HEADERS, 'Access-Control-Allow-Origin': origin }
    : { ...BASE_HEADERS }
}

function json(body: unknown, status: number, origin: string | null): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...cors(origin) },
  })
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin')
  const log = { fn: 'invite-info', reqId: newReqId() }

  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin) })
  if (req.method !== 'GET') return json({ error: 'method_not_allowed' }, 405, origin)
  if (origin !== null && !ALLOWED_ORIGIN.test(origin)) {
    logJson({ ...log, status: 'forbidden_origin' })
    return json({ error: 'forbidden' }, 403, origin)
  }

  try {
    const code = (new URL(req.url).searchParams.get('code') ?? '').trim().toUpperCase()
    if (!CODE_RE.test(code)) return json({ error: 'not_found' }, 404, origin)

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false } },
    )

    // Rate-limit par IP, fail-closed (échec technique = limité) — borne l'énumération.
    const ip = (req.headers.get('x-forwarded-for') ?? 'unknown').split(',')[0].trim().slice(0, 64)
    const { data: hits, error: rateError } = await supabase.rpc('share_hit', {
      p_bucket: `invinfo:ip:${ip}`,
      p_window_seconds: IP_WINDOW_S,
    })
    if (rateError || typeof hits !== 'number' || hits > IP_MAX_HITS) {
      logJson({ ...log, status: 'rate_limited' })
      return json({ error: 'rate_limited' }, 429, origin)
    }

    const { data, error } = await supabase
      .from('platform_invites')
      .select('label, revoked_at, expires_at, used_count, max_uses')
      .eq('code', code)
      .maybeSingle()
    if (error) {
      logJson({ ...log, status: 'lookup_error', err: error.message.slice(0, 200) })
      return json({ error: 'server_error' }, 500, origin)
    }
    const active =
      data !== null &&
      data.revoked_at === null &&
      (data.expires_at === null || new Date(data.expires_at) > new Date()) &&
      data.used_count < data.max_uses
    if (!active) {
      logJson({ ...log, status: 'not_found' })
      return json({ error: 'not_found' }, 404, origin)
    }

    logJson({ ...log, status: 'ok' })
    return json({ label: data.label }, 200, origin)
  } catch (e) {
    logJson({
      ...log,
      status: 'error',
      err: String(e instanceof Error ? e.message : e).slice(0, 300),
    })
    return json({ error: 'server_error' }, 500, origin)
  }
})
