// Edge Function `checking-report` — livraison du rapport du Checking Standard public
// (pharnos.com/checking-standard). Le prospect n'a pas de compte : `verify_jwt = false`.
//
// Contrat sécurité (calqué sur `demo-request`, même surface publique) :
//   • CORS restreint à la landing (apex + previews Pages + dev local) ; toute autre origine → 403.
//   • Honeypot `website` → faux succès, sans écriture ni e-mail (ne pas éduquer le bot).
//   • Rate-limit fail-closed par IP puis global via `share_hit` (service-role, SQL).
//   • Payload borné et validé champ par champ dans `_shared/checking-report-core.ts` : toute
//     valeur inconnue est REJETÉE, jamais coercée vers un défaut.
//   • Écriture service-role uniquement dans `checking_leads` (0081, RLS sans policy).
//   • Aucune donnée produit n'est acceptée : le schéma de réponses n'admet que 'ok'|'nc'|'ko'|'na'.
//   • Logs JSON sans PII (jamais le contact du prospect).
//
// Le score est RECALCULÉ ici : le navigateur n'est pas une source de vérité. Le rapport part sous
// notre marque et alimente nos statistiques agrégées — les deux reposent sur le barème du serveur.
//
// ⚠️ Déploiement : le cœur importe le barème depuis `landing/checking/` (source unique partagée
// avec la page publique). Déployer depuis la RACINE du dépôt pour que ces modules entrent dans le
// bundle :  supabase functions deploy checking-report
import { createClient } from 'npm:@supabase/supabase-js@2'

import { BAREME_VERSION } from '../_shared/checking/scoring.js'
import { buildReportEmail, buildTeamNotice, clientIp, contactBucketKey, resultFor, validateRequest } from '../_shared/checking-report-core.ts'
import { logJson, newReqId } from '../_shared/log.ts'

const MAX_BODY_BYTES = 16 * 1024

// 5 rapports/h par IP (un MAH refait légitimement le test plusieurs fois), 120/h au global :
// protège la base ET le quota Resend d'un flood distribué.
const IP_WINDOW_S = 3600
const IP_MAX_HITS = 5
const GLOBAL_WINDOW_S = 3600
const GLOBAL_MAX_HITS = 120
// Plafond par DESTINATAIRE : contrairement à `demo-request` (qui écrit à notre propre équipe),
// cette fonction envoie à une adresse fournie par l'appelant, sous notre domaine. Sans ce bucket,
// une même boîte pourrait être pilonnée jusqu'au plafond global — c'est notre réputation d'envoi
// Resend qui paierait la note.
const CONTACT_WINDOW_S = 86400
const CONTACT_MAX_HITS = 3

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

Deno.serve(async (req) => {
  const origin = req.headers.get('origin')
  const log = { fn: 'checking-report', reqId: newReqId() }

  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin) })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405, origin)
  if (origin !== null && !ALLOWED_ORIGIN.test(origin)) {
    logJson({ ...log, status: 'forbidden_origin' })
    return json({ error: 'forbidden' }, 403, origin)
  }

  try {
    const raw = await req.text()
    // Borne en OCTETS : `raw.length` compte des unités UTF-16, un corps multi-octets passerait
    // jusqu'à 4× la limite annoncée.
    if (new TextEncoder().encode(raw).length > MAX_BODY_BYTES) {
      return json({ error: 'payload_too_large' }, 413, origin)
    }
    let body: Record<string, unknown>
    try {
      body = JSON.parse(raw)
    } catch {
      return json({ error: 'bad_request' }, 400, origin)
    }

    // Honeypot : champ invisible pour un humain. Un bot qui le remplit reçoit un faux succès.
    if (typeof body.website === 'string' && body.website.trim() !== '') {
      logJson({ ...log, status: 'honeypot' })
      return json({ ok: true }, 200, origin)
    }

    const valid = validateRequest(body)
    if (!valid) {
      logJson({ ...log, status: 'invalid_fields' })
      return json({ error: 'invalid_fields' }, 400, origin)
    }

    // Barème du SERVEUR — un score posté par le client, s'il en poste un, n'est jamais lu.
    const result = resultFor(valid)

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false } },
    )

    // Rate-limit fail-closed (échec technique = limité) : par IP, par destinataire, puis global.
    const ip = clientIp(req.headers)
    const limits: ReadonlyArray<[string, string, number, number]> = [
      ['ip', `checking:ip:${ip}`, IP_WINDOW_S, IP_MAX_HITS],
      ['contact', `checking:to:${await contactBucketKey(valid.contact)}`, CONTACT_WINDOW_S, CONTACT_MAX_HITS],
      ['all', 'checking:all', GLOBAL_WINDOW_S, GLOBAL_MAX_HITS],
    ]
    for (const [scope, bucket, windowS, max] of limits) {
      const { data: hits, error } = await supabase.rpc('share_hit', {
        p_bucket: bucket,
        p_window_seconds: windowS,
      })
      if (error || typeof hits !== 'number' || hits > max) {
        logJson({ ...log, status: 'rate_limited', scope })
        return json({ error: 'rate_limited' }, 429, origin)
      }
    }

    const { error: insertError } = await supabase.from('checking_leads').insert({
      channel: valid.channel,
      contact: valid.contact,
      lang: valid.lang,
      country: valid.country,
      operation: valid.operation,
      product_type: valid.productType,
      score: result.score,
      verdict: result.verdict,
      gates_ok: result.gateOk,
      gates_total: result.gateTotal,
      bareme_version: BAREME_VERSION,
      answers: valid.answers,
      newsletter: valid.newsletter,
      consent: valid.consent,
      ip: ip === 'unknown' ? null : ip,
      user_agent: (req.headers.get('user-agent') ?? '').slice(0, 400) || null,
    })
    if (insertError) {
      logJson({ ...log, status: 'insert_error', err: insertError.message.slice(0, 200) })
      return json({ error: 'server_error' }, 500, origin)
    }

    // Envoi — best-effort : le lead est déjà en base, un échec Resend ne doit pas faire échouer le
    // prospect. Canal e-mail : le rapport part chez lui. Canal WhatsApp : l'équipe est notifiée
    // pour le recontacter (aucune API WhatsApp n'est branchée à ce stade).
    const apiKey = Deno.env.get('RESEND_API_KEY')
    if (apiKey) {
      const from = Deno.env.get('EMAIL_FROM') ?? 'Pharnos <onboarding@resend.dev>'
      const team = Deno.env.get('DEMO_NOTIFY_TO') ?? 'contact@pharnos.com'
      const mail =
        valid.channel === 'email'
          ? { to: [valid.contact], ...buildReportEmail(valid, result) }
          : { to: [team], ...buildTeamNotice(valid, result) }
      try {
        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
          body: JSON.stringify({ from, ...mail }),
        })
        logJson({ ...log, op: 'send', channel: valid.channel, status: res.ok ? 'ok' : `http_${res.status}` })
      } catch (e) {
        logJson({
          ...log,
          op: 'send',
          channel: valid.channel,
          status: 'error',
          err: String(e instanceof Error ? e.message : e).slice(0, 200),
        })
      }
    } else {
      logJson({ ...log, op: 'send', status: 'email_unavailable' })
    }

    logJson({ ...log, status: 'ok', channel: valid.channel, score: result.score, verdict: result.verdict })
    return json({ ok: true, score: result.score, verdict: result.verdict }, 200, origin)
  } catch (e) {
    logJson({
      ...log,
      status: 'error',
      err: String(e instanceof Error ? e.message : e).slice(0, 300),
    })
    return json({ error: 'server_error' }, 500, origin)
  }
})
