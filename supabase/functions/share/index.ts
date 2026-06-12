// Edge Function `share` (jalon H) — accès PUBLIC de review d'une correspondance, par token.
//
// Contrat sécurité (ADR-0003) :
//   • verify_jwt = false : le reviewer n'a PAS de compte. La barrière d'accès est le token
//     256 bits (lookup par SHA-256, index unique) + mot de passe optionnel (PBKDF2, vérifié ici).
//   • TOUT l'accès aux données passe par le service-role APRÈS validation — RLS reste hermétique
//     aux anonymes (aucune policy anon sur les tables).
//   • Anti-abus : rate-limit par IP (toutes requêtes) et par token (tentatives de mot de passe)
//     via la fonction SQL `share_hit` (service-role only).
//   • Pièces jointes du reviewer bornées (3 × 4 Mo, types whitelist, noms assainis, chemins
//     contrôlés ICI — jamais par le client).
//   • Logs JSON sans PII ni token (préfixe de hash uniquement).
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'

import { corsHeaders, isAllowedOrigin } from '../_shared/cors.ts'
import { logJson, newReqId } from '../_shared/log.ts'
import { isValidShareToken, sha256Hex, verifySharePassword } from '../_shared/share-auth.ts'

const BUCKET = 'documents'
const SIGNED_URL_TTL = 3600 // 1 h
const MAX_BODY_BYTES = 20 * 1024 * 1024
const MAX_ATTACHMENTS = 3
const MAX_ATTACHMENT_BYTES = 4 * 1024 * 1024
const MAX_COMMENT_CHARS = 5000
// Fenêtres de rate-limit (secondes) et plafonds.
const IP_WINDOW_S = 600
const IP_MAX_HITS = 60
const PWD_WINDOW_S = 900
const PWD_MAX_HITS = 5

const ALLOWED_ATTACH_MIMES = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
])
const ALLOWED_ATTACH_EXTS = new Set(['pdf', 'png', 'jpg', 'jpeg', 'webp', 'docx'])

const DECISIONS = new Set(['accepted', 'suspended', 'rejected'])
// Notifications e-mail (action `notify`, authentifiée) : best-effort Resend, plafonnées par org.
const MAIL_WINDOW_S = 3600
const MAIL_MAX_HITS = 20
const SHARE_PATH_RE = /^\/r\/([A-Za-z0-9_-]{43})\/?$/
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

interface CorrespondenceRow {
  id: string
  org_id: string
  product_name: string
  country: string
  activity: string
  sender_email: string
  recipient_email: string
  note: string | null
  pdf_path: string
  pdf_size: number
  password_hash: string | null
  status: string
  decided_at: string | null
  revoked_at: string | null
  created_at: string
  deleted_at: string | null
}

interface MessageRow {
  id: string
  author: string
  author_label: string
  kind: string
  decision: string | null
  body: string
  attachments: { path: string; name: string; size: number; mime: string }[]
  created_at: string
}

interface AttachmentInput {
  name?: unknown
  mime?: unknown
  dataBase64?: unknown
}

/** Nom de fichier assaini (mêmes règles que web/src/lib/files.ts — anti path-traversal). */
function sanitizeName(name: string): string {
  const normalized = (name || '')
    .normalize('NFKC')
    // deno-lint-ignore no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/[/\\<>:"|?*]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/, '')
  if (!normalized) return 'piece-jointe'
  return normalized.length <= 120 ? normalized : normalized.slice(-120)
}

function decodeBase64(b64: string): Uint8Array | null {
  try {
    const bin = atob(b64)
    const out = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
    return out
  } catch {
    return null
  }
}

const extOf = (name: string): string => name.toLowerCase().split('.').pop() ?? ''

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('origin')
  const reqId = newReqId()
  if (!isAllowedOrigin(origin)) {
    logJson({ fn: 'share', reqId, op: 'cors', status: 'forbidden' })
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

  // Garde déclaratif (l'en-tête peut être absent en chunked) — les bornes DURES sont en aval :
  // nombre/taille des pièces (base64) et longueur du commentaire, vérifiés champ par champ.
  const contentLength = Number(req.headers.get('content-length') ?? '0')
  if (contentLength > MAX_BODY_BYTES) return json({ error: 'payload_too_large' }, 413)

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return json({ error: 'bad_request' }, 400)
  }
  const b = (raw ?? {}) as {
    action?: unknown
    token?: unknown
    password?: unknown
    decision?: unknown
    body?: unknown
    attachments?: unknown
  }

  const action = typeof b.action === 'string' ? b.action : ''
  if (!['open', 'decide', 'reply', 'notify'].includes(action)) {
    return json({ error: 'bad_request' }, 400)
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { persistSession: false } },
  )

  // `notify` : action AUTHENTIFIÉE (JWT expéditeur) — chemin séparé du flux public par token.
  if (action === 'notify') {
    return await handleNotify(req, b as Record<string, unknown>, supabase, json, reqId)
  }

  if (!isValidShareToken(b.token)) return json({ error: 'invalid' }, 404)

  const tokenHash = await sha256Hex(b.token)
  const log = { fn: 'share', reqId, tok: tokenHash.slice(0, 8) }
  const started = Date.now()

  // Rate-limit IP — première barrière, AVANT toute lecture. DERNIER élément de X-Forwarded-For :
  // c'est l'adresse ajoutée par la plateforme (non falsifiable) — le premier est sous contrôle
  // du client (spoof trivial qui annulerait le plafond).
  const ip =
    (req.headers.get('x-forwarded-for') ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .pop() ?? 'unknown'
  const ipHits = await rateHit(supabase, `ip:${await sha256Hex(ip)}`, IP_WINDOW_S)
  if (ipHits === null || ipHits > IP_MAX_HITS) {
    logJson({ ...log, op: action, status: 'rate_limited_ip' })
    return json({ error: 'rate_limited' }, 429)
  }

  // Lookup par hash (timing-safe par construction : comparaison d'index, pas de byte-compare).
  const { data: corr, error: corrErr } = await supabase
    .from('correspondences')
    .select(
      'id, org_id, product_name, country, activity, sender_email, recipient_email, note, pdf_path, pdf_size, password_hash, status, decided_at, revoked_at, created_at, deleted_at',
    )
    .eq('token_hash', tokenHash)
    .maybeSingle<CorrespondenceRow>()
  if (corrErr) {
    logJson({ ...log, op: action, status: 'error', err: corrErr.message.slice(0, 200) })
    return json({ error: 'server_error' }, 500)
  }
  if (!corr || corr.deleted_at !== null) {
    logJson({ ...log, op: action, status: 'not_found' })
    return json({ error: 'invalid' }, 404)
  }
  if (corr.revoked_at !== null) {
    logJson({ ...log, op: action, status: 'revoked' })
    return json({ error: 'revoked' }, 410)
  }

  // Mot de passe (optionnel) — rate-limité par token, indépendamment de l'IP.
  if (corr.password_hash) {
    const password = typeof b.password === 'string' ? b.password : ''
    if (!password) return json({ error: 'password_required' }, 401)
    const pwdHits = await rateHit(supabase, `pwd:${tokenHash}`, PWD_WINDOW_S)
    if (pwdHits === null || pwdHits > PWD_MAX_HITS) {
      logJson({ ...log, op: action, status: 'rate_limited_pwd' })
      return json({ error: 'rate_limited' }, 429)
    }
    if (!(await verifySharePassword(password, corr.password_hash))) {
      logJson({ ...log, op: action, status: 'wrong_password' })
      return json({ error: 'wrong_password' }, 401)
    }
  }

  try {
    if (action === 'open') {
      const payload = await buildOpenPayload(supabase, corr)
      logJson({ ...log, op: 'open', ms: Date.now() - started, status: 'ok' })
      return json(payload)
    }

    // decide / reply — écritures du reviewer.
    const comment = (typeof b.body === 'string' ? b.body : '').slice(0, MAX_COMMENT_CHARS).trim()
    const decision = typeof b.decision === 'string' ? b.decision : ''

    if (action === 'decide' && !DECISIONS.has(decision)) return json({ error: 'bad_request' }, 400)

    const attachments = await storeAttachments(supabase, corr, b.attachments)
    if (attachments === 'invalid') return json({ error: 'attachment_invalid' }, 400)

    if (action === 'reply' && !comment && attachments.length === 0) {
      return json({ error: 'bad_request' }, 400)
    }

    const message = {
      id: crypto.randomUUID(),
      org_id: corr.org_id,
      correspondence_id: corr.id,
      author: 'recipient',
      author_label: corr.recipient_email,
      kind: action === 'decide' ? 'decision' : 'comment',
      decision: action === 'decide' ? decision : null,
      body: comment,
      attachments,
      created_at: new Date().toISOString(),
    }
    const { error: msgErr } = await supabase.from('correspondence_messages').insert(message)
    if (msgErr) throw msgErr

    if (action === 'decide') {
      // La décision est RÉVISABLE (métier : suspendu → frais reçus → accepté) ; chaque décision
      // reste tracée dans le fil append-only. Le statut = dernière décision.
      const { error: updErr } = await supabase
        .from('correspondences')
        .update({
          status: decision,
          decided_at: message.created_at,
          updated_at: message.created_at,
        })
        .eq('id', corr.id)
      if (updErr) throw updErr
    }

    const payload = await buildOpenPayload(supabase, {
      ...corr,
      status: action === 'decide' ? decision : corr.status,
      decided_at: action === 'decide' ? message.created_at : corr.decided_at,
    })
    logJson({ ...log, op: action, ms: Date.now() - started, status: 'ok' })
    return json(payload)
  } catch (e) {
    logJson({
      ...log,
      op: action,
      ms: Date.now() - started,
      status: 'error',
      err: String(e instanceof Error ? e.message : e).slice(0, 300),
    })
    return json({ error: 'server_error' }, 500)
  }
})

/** Incrémente le compteur de fenêtre ; `null` = échec technique (traité comme limité : fail-closed). */
async function rateHit(
  supabase: SupabaseClient,
  bucket: string,
  windowSeconds: number,
): Promise<number | null> {
  const { data, error } = await supabase.rpc('share_hit', {
    p_bucket: bucket,
    p_window_seconds: windowSeconds,
  })
  if (error) {
    logJson({ fn: 'share', op: 'rate', status: 'error', err: error.message.slice(0, 120) })
    return null
  }
  return typeof data === 'number' ? data : null
}

/** Charge fil + URLs signées (PDF 1 h, pièces jointes 1 h) — payload de la page publique. */
async function buildOpenPayload(supabase: SupabaseClient, corr: CorrespondenceRow) {
  const [{ data: pdfSigned, error: pdfErr }, { data: msgs, error: msgErr }] = await Promise.all([
    supabase.storage.from(BUCKET).createSignedUrl(corr.pdf_path, SIGNED_URL_TTL),
    supabase
      .from('correspondence_messages')
      .select('id, author, author_label, kind, decision, body, attachments, created_at')
      .eq('correspondence_id', corr.id)
      .order('created_at', { ascending: true })
      .limit(500),
  ])
  if (msgErr) throw msgErr
  if (pdfErr || !pdfSigned?.signedUrl) throw pdfErr ?? new Error('PDF signé indisponible')

  const messages = (msgs ?? []) as unknown as MessageRow[]
  // URLs signées des pièces jointes, en un seul appel Storage.
  const paths = messages.flatMap((m) => (m.attachments ?? []).map((a) => a.path)).filter(Boolean)
  const urlByPath = new Map<string, string>()
  if (paths.length > 0) {
    const { data: signed } = await supabase
      .storage
      .from(BUCKET)
      .createSignedUrls(paths, SIGNED_URL_TTL)
    for (const s of signed ?? []) {
      if (s.path && s.signedUrl) urlByPath.set(s.path, s.signedUrl)
    }
  }

  return {
    correspondence: {
      productName: corr.product_name,
      country: corr.country,
      activity: corr.activity,
      senderEmail: corr.sender_email,
      recipientEmail: corr.recipient_email,
      note: corr.note,
      status: corr.status,
      decidedAt: corr.decided_at,
      createdAt: corr.created_at,
      pdfSize: corr.pdf_size,
      hasPassword: corr.password_hash !== null,
    },
    pdfUrl: pdfSigned.signedUrl,
    messages: messages.map((m) => ({
      id: m.id,
      author: m.author,
      authorLabel: m.author_label,
      kind: m.kind,
      decision: m.decision,
      body: m.body,
      createdAt: m.created_at,
      attachments: (m.attachments ?? []).map((a) => ({
        name: a.name,
        size: a.size,
        mime: a.mime,
        url: urlByPath.get(a.path) ?? null,
      })),
    })),
  }
}

/**
 * Valide et stocke les pièces jointes du reviewer (base64 → Storage, chemins contrôlés ici).
 * Renvoie les métadonnées à figer dans le message, ou 'invalid' si une pièce viole les bornes.
 */
async function storeAttachments(
  supabase: SupabaseClient,
  corr: CorrespondenceRow,
  input: unknown,
): Promise<{ path: string; name: string; size: number; mime: string }[] | 'invalid'> {
  if (input === undefined || input === null) return []
  if (!Array.isArray(input) || input.length > MAX_ATTACHMENTS) return 'invalid'

  const stored: { path: string; name: string; size: number; mime: string }[] = []
  for (const item of input as AttachmentInput[]) {
    const name = sanitizeName(typeof item?.name === 'string' ? item.name : '')
    const mime = typeof item?.mime === 'string' ? item.mime : ''
    const b64 = typeof item?.dataBase64 === 'string' ? item.dataBase64 : ''
    if (!b64) return 'invalid'
    if (!ALLOWED_ATTACH_MIMES.has(mime) && !ALLOWED_ATTACH_EXTS.has(extOf(name))) return 'invalid'
    // Garde AVANT décodage : taille base64 ≈ 4/3 × binaire.
    if (b64.length > (MAX_ATTACHMENT_BYTES * 4) / 3 + 4) return 'invalid'
    const bytes = decodeBase64(b64)
    if (!bytes || bytes.length === 0 || bytes.length > MAX_ATTACHMENT_BYTES) return 'invalid'

    const path = `${corr.org_id}/shares/${corr.id}/recipient/${crypto.randomUUID()}-${name}`
    const { error } = await supabase.storage.from(BUCKET).upload(path, bytes.slice().buffer, {
      contentType: ALLOWED_ATTACH_MIMES.has(mime) ? mime : 'application/octet-stream',
      upsert: false,
    })
    if (error) throw error
    stored.push({ path, name, size: bytes.length, mime })
  }
  return stored
}

/**
 * Action `notify` (authentifiée) : e-mail Resend au correspondant, best-effort.
 * Anti-relais de phishing : l'URL fournie doit (1) pointer vers une origine autorisée et
 * (2) porter LE token de CETTE correspondance (sha256(token) === token_hash). Le mot de passe
 * ne transite JAMAIS par e-mail. Plafond : 20 e-mails/h par organisation.
 */
async function handleNotify(
  req: Request,
  b: Record<string, unknown>,
  supabase: SupabaseClient,
  json: (body: unknown, status?: number) => Response,
  reqId: string,
): Promise<Response> {
  const log = { fn: 'share', reqId, op: 'notify' }
  const started = Date.now()

  // Auth : JWT Supabase de l'expéditeur (la fonction est déployée sans verify_jwt).
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
    logJson({ ...log, status: 'unauthorized' })
    return json({ error: 'unauthorized' }, 401)
  }

  const correspondenceId = typeof b.correspondenceId === 'string' ? b.correspondenceId : ''
  const url = typeof b.url === 'string' ? b.url : ''
  if (!correspondenceId || !url || url.length > 300) return json({ error: 'bad_request' }, 400)

  // L'URL doit être un lien de review d'une origine autorisée, SANS query ni fragment :
  // seule une URL canonique reconstruite depuis les parties validées entre dans l'e-mail
  // (l'original brut n'est jamais interpolé — anti-injection HTML par l'URL).
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return json({ error: 'bad_request' }, 400)
  }
  const pathMatch = SHARE_PATH_RE.exec(parsed.pathname)
  if (!isAllowedOrigin(parsed.origin) || !pathMatch || parsed.search || parsed.hash) {
    return json({ error: 'bad_request' }, 400)
  }
  const canonicalUrl = `${parsed.origin}/r/${pathMatch[1]}`

  const { data: corr } = await supabase
    .from('correspondences')
    .select('id, org_id, product_name, country, sender_email, recipient_email, note, token_hash, revoked_at, deleted_at')
    .eq('id', correspondenceId)
    .maybeSingle<CorrespondenceRow & { token_hash: string }>()
  if (!corr || corr.deleted_at !== null) return json({ error: 'invalid' }, 404)
  if (corr.revoked_at !== null) return json({ error: 'revoked' }, 410)

  // … et porter LE token de cette correspondance (pas un lien arbitraire).
  if ((await sha256Hex(pathMatch[1])) !== corr.token_hash) return json({ error: 'bad_request' }, 400)

  // L'appelant doit être membre de l'organisation propriétaire.
  const { data: membership } = await supabase
    .from('memberships')
    .select('org_id')
    .eq('org_id', corr.org_id)
    .eq('user_id', user.id)
    .maybeSingle()
  if (!membership) {
    logJson({ ...log, status: 'forbidden' })
    return json({ error: 'unauthorized' }, 403)
  }

  const mailHits = await rateHit(supabase, `mail:${corr.org_id}`, MAIL_WINDOW_S)
  if (mailHits === null || mailHits > MAIL_MAX_HITS) {
    logJson({ ...log, status: 'rate_limited' })
    return json({ error: 'rate_limited' }, 429)
  }

  const apiKey = Deno.env.get('RESEND_API_KEY')
  if (!apiKey) {
    logJson({ ...log, status: 'email_unavailable' })
    return json({ error: 'email_unavailable' }, 503)
  }
  const from = Deno.env.get('EMAIL_FROM') ?? 'Pharnos <onboarding@resend.dev>'

  // Adresses validées côté serveur (en-têtes Resend + interpolation HTML) — jamais de confiance
  // dans ce que le client a écrit en base.
  if (!EMAIL_RE.test(corr.recipient_email) || !EMAIL_RE.test(corr.sender_email)) {
    logJson({ ...log, status: 'bad_email' })
    return json({ error: 'bad_request' }, 400)
  }
  const escapeHtml = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  const safeSender = escapeHtml(corr.sender_email)
  const safeProduct = escapeHtml(corr.product_name)
  const note = escapeHtml((corr.note ?? '').slice(0, 500))
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      from,
      to: [corr.recipient_email],
      reply_to: corr.sender_email,
      subject: `Dossier ${corr.product_name.replace(/[\r\n]/g, ' ')} — review demandée via Pharnos`,
      html: [
        `<div style="font-family:system-ui,Segoe UI,Arial,sans-serif;max-width:560px;margin:auto;padding:24px">`,
        `<h2 style="margin:0 0 8px">Review de dossier réglementaire</h2>`,
        `<p style="margin:0 0 16px;color:#444"><strong>${safeSender}</strong> vous a transmis le dossier <strong>${safeProduct}</strong> pour review et soumission.</p>`,
        note ? `<p style="margin:0 0 16px;padding:12px;background:#f6f6f7;border-radius:8px;color:#333">${note}</p>` : '',
        `<p style="margin:0 0 24px"><a href="${canonicalUrl}" style="background:#18181b;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;display:inline-block">Ouvrir le dossier</a></p>`,
        `<p style="margin:0;color:#888;font-size:12px">Lien personnel — prévisualisez, téléchargez et rendez votre décision sans créer de compte. Si le lien est protégé, le mot de passe vous est communiqué séparément par l'expéditeur.</p>`,
        `<p style="margin:16px 0 0;color:#aaa;font-size:11px">Pharnos — OS des affaires réglementaires pharmaceutiques UEMOA/CEDEAO</p>`,
        `</div>`,
      ].join(''),
    }),
  })
  if (!res.ok) {
    const detail = (await res.text().catch(() => '')).slice(0, 200)
    logJson({ ...log, ms: Date.now() - started, status: 'email_failed', detail })
    return json({ error: 'email_failed' }, 502)
  }
  logJson({ ...log, ms: Date.now() - started, status: 'ok' })
  return json({ sent: true })
}
