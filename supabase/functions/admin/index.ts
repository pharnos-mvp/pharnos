// Edge Function `admin` — API de la console d'administration Pharnos (jalon M2).
//
// Double barrière de sécurité :
//   1) le JWT de l'appelant est vérifié et DOIT être super-admin Pharnos (is_platform_admin()) ;
//   2) toute la donnée cross-org est lue/écrite via un client SERVICE-ROLE (jamais exposé au client),
//      à travers des RPC réservées au service_role (migration 0021). Aucun accès cross-tenant côté client.
//
// Lecture : overview (KPIs + santé + growth + usage IA + audit récent), orgs, users.
// Écriture (audit-loggée) : set_plan, set_quota, set_disabled, set_plan_limits.
import { createClient } from 'npm:@supabase/supabase-js@2'

import { corsHeaders, isAllowedOrigin } from '../_shared/cors.ts'
import { logJson, newReqId, userHash } from '../_shared/log.ts'

const PLANS = new Set(['free', 'pro', 'business', 'enterprise'])
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Borne un entier optionnel (quota) : null (= défaut du plan) ou entier >= 0 borné. */
function optInt(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = Math.floor(Number(v))
  if (!Number.isFinite(n) || n < 0) return null
  return Math.min(n, 9_000_000_000)
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('origin')
  const reqId = newReqId()
  if (!isAllowedOrigin(origin)) {
    logJson({ fn: 'admin', reqId, op: 'cors', status: 'forbidden' })
    return new Response('origine non autorisée', { status: 403 })
  }
  const cors = corsHeaders(origin)
  const json = (body: unknown, status = 200): Response =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...cors, 'content-type': 'application/json', 'x-request-id': reqId },
    })

  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  // 1) Auth — JWT de l'appelant.
  const authHeader = req.headers.get('Authorization') ?? ''
  const authed = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } },
  )
  const {
    data: { user },
    error: authErr,
  } = await authed.auth.getUser()
  if (authErr || !user) {
    logJson({ fn: 'admin', reqId, op: 'auth', status: 'unauthorized' })
    return json({ error: 'unauthorized' }, 401)
  }
  const log = { fn: 'admin', reqId, user: await userHash(user.id) }

  // 1bis) Gate super-admin Pharnos — vérifié avec le JWT appelant (is_platform_admin()).
  const { data: isAdmin, error: gateErr } = await authed.rpc('is_platform_admin')
  if (gateErr || isAdmin !== true) {
    logJson({ ...log, op: 'gate', status: 'forbidden' })
    return json({ error: 'forbidden' }, 403)
  }

  // 2) Client service-role — accès cross-org via les RPC admin_* (service_role only).
  const svc = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { persistSession: false } },
  )

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return json({ error: 'bad_request' }, 400)
  }
  const b = (raw ?? {}) as Record<string, unknown>
  const action = typeof b.action === 'string' ? b.action : ''
  const actorId = user.id
  const actorEmail = user.email ?? ''

  const callRpc = async (fn: string, args: Record<string, unknown>) => {
    const { data, error } = await svc.rpc(fn, args)
    if (error) {
      logJson({ ...log, op: action, status: 'rpc_error', rpc: fn, err: String(error.message).slice(0, 200) })
      return json({ error: 'rpc_failed' }, 500)
    }
    return json({ ok: true, data })
  }

  try {
    switch (action) {
      // ── Lectures ──────────────────────────────────────────────────────────────────────────
      case 'overview':
        logJson({ ...log, op: 'overview', status: 'ok' })
        return await callRpc('admin_overview', {})
      case 'orgs':
        logJson({ ...log, op: 'orgs', status: 'ok' })
        return await callRpc('admin_orgs', {})
      case 'users':
        logJson({ ...log, op: 'users', status: 'ok' })
        return await callRpc('admin_users', {})

      // ── Écritures (audit-loggées dans la RPC) ───────────────────────────────────────────────
      case 'set_plan': {
        const org = String(b.orgId ?? '')
        const plan = String(b.plan ?? '')
        if (!UUID_RE.test(org) || !PLANS.has(plan)) return json({ error: 'bad_request' }, 400)
        logJson({ ...log, op: 'set_plan', status: 'ok' })
        return await callRpc('admin_set_org_plan', {
          p_org: org, p_plan: plan, p_actor_id: actorId, p_actor_email: actorEmail,
        })
      }
      case 'set_quota': {
        const org = String(b.orgId ?? '')
        if (!UUID_RE.test(org)) return json({ error: 'bad_request' }, 400)
        logJson({ ...log, op: 'set_quota', status: 'ok' })
        return await callRpc('admin_set_org_quota', {
          p_org: org,
          p_max_dossiers: optInt(b.maxDossiers),
          p_monthly_ai_tokens: optInt(b.monthlyAiTokens),
          p_actor_id: actorId, p_actor_email: actorEmail,
        })
      }
      case 'set_disabled': {
        const org = String(b.orgId ?? '')
        if (!UUID_RE.test(org) || typeof b.disabled !== 'boolean') return json({ error: 'bad_request' }, 400)
        logJson({ ...log, op: 'set_disabled', status: 'ok', disabled: b.disabled })
        return await callRpc('admin_set_org_disabled', {
          p_org: org, p_disabled: b.disabled, p_actor_id: actorId, p_actor_email: actorEmail,
        })
      }
      case 'set_plan_limits': {
        const plan = String(b.plan ?? '')
        if (!PLANS.has(plan)) return json({ error: 'bad_request' }, 400)
        // Ancre d'audit = org de l'admin (audit_log.org_id NOT NULL) — résolue via service-role.
        const { data: m } = await svc
          .from('memberships').select('org_id').eq('user_id', actorId).limit(1).maybeSingle()
        const actorOrg = (m as { org_id?: string } | null)?.org_id
        if (!actorOrg) return json({ error: 'actor_without_org' }, 409)
        const features =
          b.features && typeof b.features === 'object' && !Array.isArray(b.features) ? b.features : null
        logJson({ ...log, op: 'set_plan_limits', status: 'ok', plan })
        return await callRpc('admin_set_plan_limits', {
          p_plan: plan,
          p_max_dossiers: optInt(b.maxDossiers),
          p_monthly_ai_tokens: optInt(b.monthlyAiTokens),
          p_features: features,
          p_actor_org: actorOrg, p_actor_id: actorId, p_actor_email: actorEmail,
        })
      }
      default:
        return json({ error: 'bad_request' }, 400)
    }
  } catch (e) {
    logJson({ ...log, op: action, status: 'fatal', err: String(e instanceof Error ? e.message : e).slice(0, 200) })
    return json({ error: 'server_error' }, 500)
  }
})
