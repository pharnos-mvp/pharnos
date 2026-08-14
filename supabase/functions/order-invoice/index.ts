// Edge Function `order-invoice` — la facture officielle, DURABLE (LOT C5).
//
// Les URLs de facture Chariow sont signées et expirent en ~1 h 30 : le lien de l'e-mail n°1 meurt
// avant que le comptable ne l'ouvre. Cette surface re-signe À LA VOLÉE : le jeton de livraison
// autorise, `GET /v1/sales/{id}` rend une URL fraîche, la page l'ouvre. Tant que le lien de
// livraison vit (30 jours), la facture vit.
//
// Contrat de sécurité :
//   • le jeton voyage dans le CORPS (POST), jamais dans une chaîne de requête — un jeton en URL
//     fuit dans les journaux de proxy et les Referer, et ce jeton EST l'accès à la commande ;
//   • la clé API Chariow ne sort jamais d'ici ; le navigateur ne reçoit que l'URL signée ;
//   • aucune PII : ni e-mail, ni nom — l'URL de facture est celle que Chariow destine à l'acheteur.
import { createClient } from 'npm:@supabase/supabase-js@2'

import { logJson, newReqId } from '../_shared/log.ts'
import { commandeParJeton, estRefus, statutHttp } from '../_shared/order-access.ts'

const CHARIOW_SALES = 'https://api.chariow.com/v1/sales'
const CHARIOW_TIMEOUT_MS = 15_000

const RL_WINDOW_S = 600
/** Une facture se télécharge quelques fois, pas cent : le seau par IP peut être serré. */
const RL_IP_MAX = 30
const RL_GLOBAL_MAX = 1_000

const ALLOWED_ORIGIN =
  /^https:\/\/app\.pharnos\.com$|^https:\/\/([a-z0-9-]+\.)?pharnos\.pages\.dev$|^http:\/\/localhost:\d+$/

const BASE_HEADERS = {
  'Access-Control-Allow-Headers': 'content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  Vary: 'Origin',
} as const

const cors = (o: string | null): Record<string, string> =>
  o && ALLOWED_ORIGIN.test(o) ? { ...BASE_HEADERS, 'Access-Control-Allow-Origin': o } : { ...BASE_HEADERS }

const json = (body: unknown, status: number, o: string | null) =>
  new Response(JSON.stringify(body), {
    status,
    // `no-store` : l'URL rendue est signée et périssable — un cache la servirait morte.
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...cors(o) },
  })

Deno.serve(async (req) => {
  const origin = req.headers.get('origin')
  const log = { fn: 'order-invoice', reqId: newReqId() }

  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin) })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405, origin)
  if (!origin || !ALLOWED_ORIGIN.test(origin)) return json({ error: 'forbidden' }, 403, origin)

  const annonce = Number(req.headers.get('content-length') ?? '0')
  if (Number.isFinite(annonce) && annonce > 4096) return json({ error: 'payload_too_large' }, 413, origin)

  let corps: Record<string, unknown>
  try {
    corps = JSON.parse(await req.text()) as Record<string, unknown>
  } catch {
    return json({ error: 'bad_request' }, 400, origin)
  }

  const sb = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  )

  const ip = req.headers.get('cf-connecting-ip')?.trim() ||
    (req.headers.get('x-forwarded-for') ?? '').split(',').map((s) => s.trim()).filter(Boolean).pop() ||
    'unknown'
  for (
    const [bucket, max] of [[`invoice:ip:${ip}`, RL_IP_MAX], ['invoice:all', RL_GLOBAL_MAX]] as const
  ) {
    const { data: hits, error } = await sb.rpc('share_hit', {
      p_bucket: bucket,
      p_window_seconds: RL_WINDOW_S,
    })
    if (error || typeof hits !== 'number' || hits > max) {
      logJson({ ...log, status: 'rate_limited' })
      return json({ error: 'rate_limited' }, 429, origin)
    }
  }

  const commande = await commandeParJeton(sb, corps.token)
  if (estRefus(commande)) return json({ error: commande.refus }, statutHttp(commande), origin)

  const apiKey = Deno.env.get('CHARIOW_API_KEY')
  if (!apiKey) {
    logJson({ ...log, status: 'no_api_key' })
    return json({ error: 'not_configured' }, 503, origin)
  }

  // L'identifiant de vente vit sur la commande — jamais transmis par le client.
  const { data: ligne, error: dbErr } = await sb
    .from('orders')
    .select('chariow_sale_id')
    .eq('id', commande.id)
    .maybeSingle()
  if (dbErr) return json({ error: 'db' }, 503, origin)
  const saleId = typeof ligne?.chariow_sale_id === 'string' ? ligne.chariow_sale_id : null
  if (!saleId) {
    // Commande née hors Chariow (injection de recette) : il n'existe pas de facture à re-signer.
    logJson({ ...log, status: 'sans_vente' })
    return json({ url: null }, 200, origin)
  }

  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), CHARIOW_TIMEOUT_MS)
  try {
    const res = await fetch(`${CHARIOW_SALES}/${encodeURIComponent(saleId)}`, {
      headers: { Authorization: `Bearer ${apiKey}`, accept: 'application/json' },
      signal: ctrl.signal,
    })
    if (!res.ok) {
      logJson({ ...log, status: 'chariow_http', http: res.status })
      return json({ error: 'upstream' }, 503, origin)
    }
    const vente = await res.json() as { data?: { invoice_download_url?: unknown } } | Record<string, unknown>
    // La forme réelle de l'API enveloppe parfois la vente sous `data` — on lit les deux, comme
    // `lireVente` : la facture est le SEUL champ qui nous intéresse ici.
    const brut = (vente as { data?: Record<string, unknown> }).data ?? vente as Record<string, unknown>
    const url = typeof brut.invoice_download_url === 'string' &&
        brut.invoice_download_url.startsWith('https://')
      ? brut.invoice_download_url
      : null
    logJson({ ...log, status: 'ok', facture: url ? 'fraiche' : 'absente' })
    return json({ url }, 200, origin)
  } catch (e) {
    const aborted = (e as Error)?.name === 'AbortError'
    logJson({ ...log, status: aborted ? 'chariow_timeout' : 'chariow_error' })
    return json({ error: 'upstream' }, 503, origin)
  } finally {
    clearTimeout(timer)
  }
})
