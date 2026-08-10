// Edge Function `order-claim` — le PONT entre le retour de paiement et la page de livraison (U1).
//
// L'acheteur revient de Chariow sur `pharnos.com`. Il détient sa référence (tirée par son
// navigateur AVANT le paiement) ; il lui manque le jeton qui ouvre `app.pharnos.com/u/{token}`.
// Cette fonction fait l'échange — mais seulement une fois que le WEBHOOK a créé la commande.
//
// ⚠️ **Le pont ne CRÉE jamais rien.** Il lit une commande née du Pulse re-vérifié. C'est tout
// l'invariant du chantier : `?paiement=ok` n'accorde rien, et une référence non plus. Tant que le
// webhook n'est pas passé, la réponse est « pas encore » — la landing interroge en boucle courte,
// le webhook pouvant arriver après le client.
//
// Contrat de sécurité :
//   • `verify_jwt = false` : l'acheteur n'a pas de compte. CORS restreint à la landing.
//   • La référence est un UUID STRICT (122 bits) : une chaîne libre ouvrirait un balayage de table
//     par tâtonnement. Débit borné par IP puis au global, fail-closed.
//   • Le jeton rendu est NEUF et propre au pont (`source: 'claim'`). Il ne remplace pas celui de
//     l'e-mail n°1 — les deux vivent, aucun n'est stocké en clair.
//   • Une commande expirée ne rend rien. Logs sans PII.
import { createClient } from 'npm:@supabase/supabase-js@2'

import { logJson, newReqId } from '../_shared/log.ts'
import {
  deliveryExpiryFrom,
  deliveryTokenHash,
  isValidRef,
  newDeliveryToken,
} from '../_shared/orders-core.ts'

const MAX_BODY_BYTES = 2 * 1024
/** Plafond de jetons par commande : le pont est interrogé en boucle, il ne doit pas en semer. */
const MAX_TOKENS_PAR_COMMANDE = 12
// La landing interroge toutes les 1,5 s pendant ~1 min : la fenêtre doit laisser passer une
// attente normale, et arrêter le balayage.
const IP_WINDOW_S = 600
const IP_MAX_HITS = 120
const GLOBAL_WINDOW_S = 600
const GLOBAL_MAX_HITS = 3000

const ALLOWED_ORIGIN =
  /^https:\/\/(www\.)?pharnos\.com$|^https:\/\/([a-z0-9-]+\.)?pharnos-landing\.pages\.dev$|^http:\/\/localhost:\d+$/

const BASE_HEADERS = {
  'Access-Control-Allow-Headers': 'content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  Vary: 'Origin',
} as const

const cors = (origin: string | null): Record<string, string> =>
  origin && ALLOWED_ORIGIN.test(origin)
    ? { ...BASE_HEADERS, 'Access-Control-Allow-Origin': origin }
    : { ...BASE_HEADERS }

const json = (body: unknown, status: number, origin: string | null) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...cors(origin) },
  })

/** IP réelle derrière Cloudflare. ⚠️ `x-forwarded-for` se lit par la FIN : le début est forgeable. */
function clientIp(req: Request): string {
  const cf = req.headers.get('cf-connecting-ip')
  if (cf) return cf.trim()
  const xff = req.headers.get('x-forwarded-for')
  if (!xff) return 'unknown'
  const parts = xff.split(',').map((s) => s.trim()).filter(Boolean)
  return parts.length ? parts[parts.length - 1] : 'unknown'
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin')
  const log = { fn: 'order-claim', reqId: newReqId() }

  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin) })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405, origin)
  if (!origin || !ALLOWED_ORIGIN.test(origin)) {
    logJson({ ...log, status: 'origin_refused' })
    return json({ error: 'forbidden' }, 403, origin)
  }

  const brut = await req.text()
  if (brut.length > MAX_BODY_BYTES) return json({ error: 'payload_too_large' }, 413, origin)

  let corps: Record<string, unknown>
  try {
    corps = JSON.parse(brut) as Record<string, unknown>
  } catch {
    return json({ error: 'bad_request' }, 400, origin)
  }

  const ref = corps.ref
  if (!isValidRef(ref)) {
    logJson({ ...log, status: 'ref_invalide' })
    return json({ error: 'bad_request' }, 400, origin)
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  )

  const ip = clientIp(req)
  for (
    const [bucket, windowS, max] of [
      [`claim:ip:${ip}`, IP_WINDOW_S, IP_MAX_HITS],
      ['claim:all', GLOBAL_WINDOW_S, GLOBAL_MAX_HITS],
    ] as const
  ) {
    const { data: hits, error } = await supabase.rpc('share_hit', {
      p_bucket: bucket,
      p_window_seconds: windowS,
    })
    // Fail-closed : une panne du compteur ne doit pas ouvrir la porte en grand.
    if (error || typeof hits !== 'number' || hits > max) {
      logJson({ ...log, status: 'rate_limited', scope: bucket === 'claim:all' ? 'all' : 'ip' })
      return json({ error: 'rate_limited' }, 429, origin)
    }
  }

  const { data: commande, error: lecErr } = await supabase
    .from('orders')
    .select('id, status, delivery_expires_at')
    .eq('ref', ref.toLowerCase())
    .maybeSingle()

  if (lecErr) {
    logJson({ ...log, status: 'db_error' })
    return json({ error: 'db' }, 503, origin)
  }
  if (!commande) {
    // Le cas NOMINAL des premières secondes : le webhook n'est pas encore passé. Ce n'est pas une
    // erreur, et la landing doit pouvoir la distinguer d'un refus pour continuer sa boucle.
    logJson({ ...log, status: 'en_attente' })
    return json({ status: 'pending' }, 200, origin)
  }

  if (new Date(commande.delivery_expires_at).getTime() <= Date.now()) {
    logJson({ ...log, status: 'expire' })
    return json({ status: 'expired' }, 410, origin)
  }

  // Le pont est interrogé en boucle : sans plafond, une page laissée ouverte sèmerait des jetons.
  const { count, error: cntErr } = await supabase
    .from('order_tokens')
    .select('token_hash', { count: 'exact', head: true })
    .eq('order_id', commande.id)
  if (cntErr) {
    logJson({ ...log, status: 'db_error' })
    return json({ error: 'db' }, 503, origin)
  }
  if ((count ?? 0) >= MAX_TOKENS_PAR_COMMANDE) {
    // On ne rend rien de neuf, mais on ne ment pas non plus : l'e-mail n°1 reste le chemin valide.
    logJson({ ...log, status: 'trop_de_jetons' })
    return json({ status: 'use_email' }, 429, origin)
  }

  const jeton = newDeliveryToken()
  const { error: insErr } = await supabase.from('order_tokens').insert({
    token_hash: await deliveryTokenHash(jeton),
    order_id: commande.id,
    // Le pont n'allonge JAMAIS la vie du lien : il recopie l'échéance de la commande. Sinon il
    // suffirait de revenir sur la page de retour pour repousser indéfiniment les 30 jours.
    expires_at: commande.delivery_expires_at,
    source: 'claim',
  })
  if (insErr) {
    logJson({ ...log, status: 'token_error' })
    return json({ error: 'db' }, 503, origin)
  }

  logJson({ ...log, status: 'ok', etat: commande.status })
  // Le navigateur reçoit le jeton et RIEN d'autre : ni prix, ni produit, ni identité. Il nomme une
  // commande, le serveur nomme tout le reste (invariant §2.7 n°4).
  return json({ status: 'ready', token: jeton }, 200, origin)
})
