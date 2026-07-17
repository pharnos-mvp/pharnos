// Edge Function `demo-request` — collecte PUBLIQUE des demandes de démo depuis la landing
// pharnos.com (modale « Demander une démo »).
//
// Contrat sécurité :
//   • verify_jwt = false : le prospect n'a pas de compte. Surface volontairement minuscule —
//     POST JSON, 5 champs bornés, AUCUNE donnée lue ni renvoyée.
//   • CORS dédié à la landing (pharnos.com + previews Pages + dev local). L'allowlist de
//     l'app (_shared/cors.ts) exclut l'apex par conception : on ne l'élargit pas, on isole.
//   • Anti-abus : honeypot (bots naïfs → faux succès sans écriture), rate-limit par IP puis
//     global via la fonction SQL `share_hit` (service-role only, fail-closed).
//   • Écriture via service-role UNIQUEMENT — `demo_requests` (0061) : RLS sans policy.
//   • Notification Resend à l'équipe : best-effort — la ligne en base fait foi.
//   • Logs JSON sans PII (jamais le nom/e-mail du prospect).
import { createClient } from 'npm:@supabase/supabase-js@2'

import { logJson, newReqId } from '../_shared/log.ts'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const MAX_BODY_BYTES = 8 * 1024
// Fenêtres de rate-limit (secondes) et plafonds : 5 demandes/h par IP, 60/h au global
// (protège la base ET le quota Resend d'un flood distribué).
const IP_WINDOW_S = 3600
const IP_MAX_HITS = 5
const GLOBAL_WINDOW_S = 3600
const GLOBAL_MAX_HITS = 60

// Origines autorisées : landing prod (+ www), previews Cloudflare Pages du projet
// pharnos-landing, dev local. Toute autre origine navigateur est refusée (403 + pas de CORS).
const ALLOWED_ORIGIN =
  /^https:\/\/(www\.)?pharnos\.com$|^https:\/\/([a-z0-9-]+\.)?pharnos-landing\.pages\.dev$|^http:\/\/localhost:\d+$/

const BASE_HEADERS = {
  'Access-Control-Allow-Headers': 'content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
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

/** Champ texte requis : trim + espaces internes normalisés, borné — null si invalide. */
function field(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null
  const s = v.trim().replace(/\s+/g, ' ')
  return s.length >= 1 && s.length <= max ? s : null
}

const escapeHtml = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string,
  )

Deno.serve(async (req) => {
  const origin = req.headers.get('origin')
  const log = { fn: 'demo-request', reqId: newReqId() }

  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin) })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405, origin)
  if (origin !== null && !ALLOWED_ORIGIN.test(origin)) {
    logJson({ ...log, status: 'forbidden_origin' })
    return json({ error: 'forbidden' }, 403, origin)
  }

  try {
    const raw = await req.text()
    if (raw.length > MAX_BODY_BYTES) return json({ error: 'payload_too_large' }, 413, origin)
    let body: Record<string, unknown>
    try {
      body = JSON.parse(raw)
    } catch {
      return json({ error: 'bad_request' }, 400, origin)
    }

    // Honeypot : le champ « website » est invisible pour un humain — un bot qui le remplit
    // reçoit un faux succès, sans écriture ni e-mail (ne pas lui apprendre qu'il est détecté).
    if (typeof body.website === 'string' && body.website.trim() !== '') {
      logJson({ ...log, status: 'honeypot' })
      return json({ ok: true }, 200, origin)
    }

    const fullName = field(body.fullName, 160)
    const email = field(body.email, 254)
    const company = field(body.company, 160)
    const jobTitle = field(body.jobTitle, 120)
    const country = field(body.country, 80)
    if (!fullName || !email || !company || !jobTitle || !country || !EMAIL_RE.test(email)) {
      logJson({ ...log, status: 'invalid_fields' })
      return json({ error: 'invalid_fields' }, 400, origin)
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false } },
    )

    // Rate-limit fail-closed (échec technique = limité) : par IP puis global.
    const ip = (req.headers.get('x-forwarded-for') ?? 'unknown').split(',')[0].trim().slice(0, 64)
    const limits: ReadonlyArray<[string, number, number]> = [
      [`demo:ip:${ip}`, IP_WINDOW_S, IP_MAX_HITS],
      ['demo:all', GLOBAL_WINDOW_S, GLOBAL_MAX_HITS],
    ]
    for (const [bucket, windowS, max] of limits) {
      const { data: hits, error } = await supabase.rpc('share_hit', {
        p_bucket: bucket,
        p_window_seconds: windowS,
      })
      if (error || typeof hits !== 'number' || hits > max) {
        logJson({ ...log, status: 'rate_limited', scope: bucket === 'demo:all' ? 'all' : 'ip' })
        return json({ error: 'rate_limited' }, 429, origin)
      }
    }

    const { error: insertError } = await supabase.from('demo_requests').insert({
      full_name: fullName,
      email,
      company,
      job_title: jobTitle,
      country,
      ip: ip === 'unknown' ? null : ip,
      user_agent: (req.headers.get('user-agent') ?? '').slice(0, 400) || null,
    })
    if (insertError) {
      logJson({ ...log, status: 'insert_error', err: insertError.message.slice(0, 200) })
      return json({ error: 'server_error' }, 500, origin)
    }

    // Notification équipe — best-effort : la demande est déjà en base, un échec Resend ne
    // doit jamais faire échouer le prospect.
    const apiKey = Deno.env.get('RESEND_API_KEY')
    if (apiKey) {
      const from = Deno.env.get('EMAIL_FROM') ?? 'Pharnos <onboarding@resend.dev>'
      const to = Deno.env.get('DEMO_NOTIFY_TO') ?? 'contact@pharnos.com'
      const [safeName, safeCompany, safeTitle, safeCountry, safeEmail] = [
        fullName,
        company,
        jobTitle,
        country,
        email,
      ].map(escapeHtml)
      try {
        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
          body: JSON.stringify({
            from,
            to: [to],
            reply_to: email,
            subject: `Nouvelle demande de démo — ${company.slice(0, 80)}`,
            html: [
              '<h2 style="margin:0 0 12px">Nouvelle demande de démo (pharnos.com)</h2>',
              '<table cellpadding="6" style="border-collapse:collapse;font-size:14px">',
              `<tr><td><b>Nom et prénoms</b></td><td>${safeName}</td></tr>`,
              `<tr><td><b>E-mail</b></td><td>${safeEmail}</td></tr>`,
              `<tr><td><b>Entreprise</b></td><td>${safeCompany}</td></tr>`,
              `<tr><td><b>Poste</b></td><td>${safeTitle}</td></tr>`,
              `<tr><td><b>Pays</b></td><td>${safeCountry}</td></tr>`,
              '</table>',
              '<p style="color:#6b7280;font-size:12px">Répondre à cet e-mail écrit directement au prospect (reply-to).</p>',
            ].join(''),
          }),
        })
        logJson({ ...log, op: 'notify', status: res.ok ? 'ok' : `http_${res.status}` })
      } catch (e) {
        logJson({
          ...log,
          op: 'notify',
          status: 'error',
          err: String(e instanceof Error ? e.message : e).slice(0, 200),
        })
      }
    } else {
      logJson({ ...log, op: 'notify', status: 'email_unavailable' })
    }

    logJson({ ...log, status: 'ok' })
    return json({ ok: true }, 200, origin)
  } catch (e) {
    logJson({
      ...log,
      status: 'error',
      err: String(e instanceof Error ? e.message : e).slice(0, 300),
    })
    return json({ error: 'server_error' }, 500, origin)
  }
})
