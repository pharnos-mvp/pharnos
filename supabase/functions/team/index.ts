// Edge Function `team` — envoi d'une invitation d'équipe (jalon M4).
//
// Unique responsabilité côté Edge : générer le token + envoyer l'e-mail Resend. Le gating
// (l'appelant doit être ADMIN de l'org) est assuré par la RPC `create_invitation` (SECURITY
// DEFINER, self-gated) appelée avec le JWT de l'appelant. Le reste de la gestion d'équipe
// (liste, rôles, retrait, révocation, acceptation) passe par des RPC appelées directement par le front.
import { createClient } from 'npm:@supabase/supabase-js@2'

import { corsHeaders, isAllowedOrigin } from '../_shared/cors.ts'
import { logJson, newReqId, userHash } from '../_shared/log.ts'
import { sha256Hex } from '../_shared/share-auth.ts'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const ROLES = new Set([
  'admin',
  'ra_officer',
  'reviewer',
  'agence_locale',
  'agence_representation',
  'expert_ra',
])
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const INVITE_TTL_DAYS = 7

const ROLE_LABEL: Record<string, { fr: string; en: string }> = {
  admin: { fr: 'Administrateur', en: 'Administrator' },
  ra_officer: { fr: 'Éditeur', en: 'Editor' },
  reviewer: { fr: 'Lecteur', en: 'Reader' },
  agence_locale: { fr: 'Agence Locale', en: 'Local agency' },
  agence_representation: { fr: 'Agence de représentation', en: 'Representation agency' },
  expert_ra: { fr: 'Expert RA', en: 'RA expert' },
}

/** Token 256 bits base64url (43 caractères) — même format que les liens de partage. */
function genToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('origin')
  const reqId = newReqId()
  if (!isAllowedOrigin(origin)) {
    logJson({ fn: 'team', reqId, op: 'cors', status: 'forbidden' })
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

  const authHeader = req.headers.get('Authorization') ?? ''
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } },
  )
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser()
  if (authErr || !user) return json({ error: 'unauthorized' }, 401)
  const log = { fn: 'team', reqId, user: await userHash(user.id) }

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return json({ error: 'bad_request' }, 400)
  }
  const b = (raw ?? {}) as { orgId?: unknown; email?: unknown; role?: unknown }
  const orgId = String(b.orgId ?? '')
  const email = String(b.email ?? '').trim().toLowerCase()
  const role = String(b.role ?? 'ra_officer')
  if (!UUID_RE.test(orgId) || !EMAIL_RE.test(email) || email.length > 200 || !ROLES.has(role)) {
    return json({ error: 'bad_request' }, 400)
  }

  // Token + hash. Seul le hash est stocké (la RPC le persiste) ; le token clair part par e-mail.
  const token = genToken()
  const tokenHash = await sha256Hex(token)
  const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 86400_000).toISOString()

  // Création gated par la RPC (l'appelant DOIT être admin de l'org) — JWT appelant.
  const { error: createErr } = await supabase.rpc('create_invitation', {
    p_org: orgId,
    p_email: email,
    p_role: role,
    p_token_hash: tokenHash,
    p_expires_at: expiresAt,
  })
  if (createErr) {
    const forbidden = /forbidden|permission|42501/i.test(createErr.message ?? '')
    logJson({ ...log, op: 'create', status: forbidden ? 'forbidden' : 'error' })
    return json({ error: forbidden ? 'forbidden' : 'create_failed' }, forbidden ? 403 : 500)
  }

  // Nom de l'org (l'appelant en est membre → lecture RLS autorisée).
  const { data: org } = await supabase.from('orgs').select('name').eq('id', orgId).maybeSingle()
  const orgName = (org as { name?: string } | null)?.name ?? 'Pharnos'

  // E-mail Resend (best-effort : l'invitation existe même si l'e-mail échoue — l'admin peut
  // renvoyer ou communiquer le lien autrement).
  const apiKey = Deno.env.get('RESEND_API_KEY')
  if (!apiKey) {
    logJson({ ...log, op: 'email', status: 'unavailable' })
    return json({ ok: true, emailSent: false })
  }
  const from = Deno.env.get('EMAIL_FROM') ?? 'Pharnos <onboarding@resend.dev>'
  const link = `${origin}/invite/${token}`
  const safeOrg = escapeHtml(orgName)
  const safeInviter = escapeHtml(user.email ?? '')
  const roleLabel = ROLE_LABEL[role] ?? { fr: role, en: role }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        from,
        to: [email],
        reply_to: user.email ?? undefined,
        subject: `Invitation — ${orgName.replace(/[\r\n]/g, ' ')} sur Pharnos`,
        html: [
          `<div style="font-family:system-ui,Segoe UI,Arial,sans-serif;max-width:560px;margin:auto;padding:24px">`,
          `<h2 style="margin:0 0 8px">Invitation à rejoindre une équipe · Team invitation</h2>`,
          `<p style="margin:0 0 4px;color:#444"><strong>${safeInviter}</strong> vous invite à rejoindre <strong>${safeOrg}</strong> sur Pharnos en tant que <strong>${escapeHtml(roleLabel.fr)}</strong>.</p>`,
          `<p style="margin:0 0 16px;color:#888;font-size:13px"><strong>${safeInviter}</strong> invites you to join <strong>${safeOrg}</strong> on Pharnos as <strong>${escapeHtml(roleLabel.en)}</strong>.</p>`,
          `<p style="margin:0 0 24px"><a href="${link}" style="background:#18181b;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;display:inline-block">Accepter l'invitation · Accept invitation</a></p>`,
          `<p style="margin:0 0 4px;color:#888;font-size:12px">Connectez-vous (ou créez un compte) avec CETTE adresse e-mail pour accepter. Le lien expire dans ${INVITE_TTL_DAYS} jours.</p>`,
          `<p style="margin:0;color:#888;font-size:12px">Sign in (or sign up) with THIS email address to accept. The link expires in ${INVITE_TTL_DAYS} days.</p>`,
          `</div>`,
        ].join(''),
      }),
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) {
      logJson({ ...log, op: 'email', status: 'send_failed', code: res.status })
      return json({ ok: true, emailSent: false })
    }
  } catch (_e) {
    logJson({ ...log, op: 'email', status: 'send_error' })
    return json({ ok: true, emailSent: false })
  }

  logJson({ ...log, op: 'invite', status: 'ok' })
  return json({ ok: true, emailSent: true })
})
