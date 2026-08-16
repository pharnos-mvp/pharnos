// Edge Function `paddle-webhook` — le SECOND rail : une transaction Paddle devient une commande.
//
// POURQUOI DEUX RAILS. Chariow est le seul à encaisser le mobile money UEMOA ; Paddle est merchant
// of record — il devient le vendeur légal, s'immatricule et reverse la TVA dans plus de 100
// juridictions à notre place. Ni l'un ni l'autre ne couvre les deux besoins : la double
// implémentation est l'état final, pas un provisoire.
//
// Ce fichier est le JUMEAU de `chariow-pulse`, et ses invariants sont les mêmes — délibérément :
//   • `verify_jwt = false`, aucun en-tête CORS : c'est du serveur à serveur.
//   • **La SIGNATURE d'abord** : `Paddle-Signature: ts=…;h1=…`, HMAC-SHA256 de `ts:corps brut`.
//     Fail-closed : sans `PADDLE_WEBHOOK_SECRET`, la porte est FERMÉE (503) — jamais un mode
//     « on laisse passer en attendant ».
//   • **Le webhook n'est pas cru sur son CONTENU** : on ne lui accorde qu'un IDENTIFIANT de
//     transaction, re-vérifié par `GET /transactions/{id}`. L'offre vient du catalogue, le régime
//     d'essai de l'environnement.
//   • **Idempotence par la base** : `orders.chariow_sale_id` est unique — il porte ici l'identifiant
//     Paddle (`txn_…`), qui ne peut pas se confondre avec un identifiant Chariow (`SALE…`).
//   • Logs JSON sans PII : jamais l'adresse ni le nom de l'acheteur.
import { createClient } from 'npm:@supabase/supabase-js@2'

import { logJson, newReqId } from '../_shared/log.ts'
import { faireNaitreCommande } from '../_shared/order-birth.ts'
import { lireEvenementPaddle, lireTransactionPaddle, PADDLE_EVENT_VENTE } from '../_shared/paddle-core.ts'
import { signaturePaddleValide } from '../_shared/paddle-signature.ts'

const MAX_BODY_BYTES = 64 * 1024
const PADDLE_TIMEOUT_MS = 15_000
const RL_WINDOW_S = 300
const RL_MAX_HITS = 120
const RL_IP_MAX_HITS = 30

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

/** 200 sur toute DÉCISION : rejouer n'y changerait rien. Les 5xx sont réservés au TRANSPORT. */
const acquitte = (raison: string) => json({ ok: true, ignored: raison }, 200)

/** Bac à sable ou production — commande l'hôte d'API ET le régime d'essai des commandes. */
const enBacASable = () => Deno.env.get('PADDLE_ENV') !== 'live'
const hoteApi = () => enBacASable() ? 'https://sandbox-api.paddle.com' : 'https://api.paddle.com'

Deno.serve(async (req) => {
  const log = { fn: 'paddle-webhook', reqId: newReqId() }
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  // Refuser AVANT de lire : cette surface est appelable par quiconque connaît l'URL. Les charges
  // utiles Paddle sont plus grasses que les Pulses Chariow (la transaction entière y figure).
  const annonce = Number(req.headers.get('content-length') ?? '0')
  if (Number.isFinite(annonce) && annonce > MAX_BODY_BYTES) {
    logJson({ ...log, status: 'body_too_large', octets: annonce })
    return json({ error: 'payload_too_large' }, 413)
  }
  // Les OCTETS, pas le texte : la signature couvre `ts:corps brut`. Décoder puis ré-encoder
  // introduirait la normalisation UTF-8, seule classe d'écart que le contrat interdit.
  const octets = new Uint8Array(await req.arrayBuffer())
  if (octets.byteLength > MAX_BODY_BYTES) {
    logJson({ ...log, status: 'body_too_large', octets: octets.byteLength })
    return json({ error: 'payload_too_large' }, 413)
  }

  // ── La signature, AVANT toute dépense ─────────────────────────────────────────────────────────
  const secret = Deno.env.get('PADDLE_WEBHOOK_SECRET')
  if (!secret) {
    // Fail-closed, sans mode d'observation : ce rail naît APRÈS la leçon du mode observation de
    // `chariow-pulse`, où un corps non authentifié pouvait nommer la référence d'une commande.
    logJson({ ...log, status: 'signature_non_configuree' })
    return json({ error: 'not_configured' }, 503)
  }
  if (!(await signaturePaddleValide(secret, octets, req.headers.get('paddle-signature') ?? ''))) {
    logJson({ ...log, status: 'signature_refusee' })
    return json({ error: 'invalid_signature' }, 401)
  }

  let corps: unknown
  try {
    corps = JSON.parse(new TextDecoder().decode(octets))
  } catch {
    logJson({ ...log, status: 'bad_json' })
    return acquitte('json_illisible')
  }

  const lu = lireEvenementPaddle(corps)
  if ('erreur' in lu) {
    logJson({ ...log, status: 'evenement_illisible', raison: lu.erreur })
    return acquitte(lu.erreur)
  }
  if (lu.eventType !== PADDLE_EVENT_VENTE) {
    // Paddle émet des dizaines d'événements (transaction.created, .billed, .updated…). Les ignorer
    // EXPLICITEMENT vaut mieux que de les laisser tomber dans un cas par défaut silencieux.
    logJson({ ...log, status: 'event_ignore', event: lu.eventType })
    return acquitte(`événement ${lu.eventType}`)
  }

  const apiKey = Deno.env.get('PADDLE_API_KEY')
  if (!apiKey) {
    logJson({ ...log, status: 'no_api_key' })
    return json({ error: 'not_configured' }, 503)
  }

  // ── La limitation de débit, AVANT l'appel qu'elle protège ────────────────────────────────────
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  )
  const ip = req.headers.get('cf-connecting-ip')?.trim() ||
    (req.headers.get('x-forwarded-for') ?? '').split(',').map((x) => x.trim()).filter(Boolean).pop() ||
    'unknown'
  for (
    const [bucket, max] of [
      [`paddle:ip:${ip}`, RL_IP_MAX_HITS],
      ['paddle:all', RL_MAX_HITS],
    ] as const
  ) {
    const { data: hits, error: rlErr } = await supabase.rpc('share_hit', {
      p_bucket: bucket,
      p_window_seconds: RL_WINDOW_S,
    })
    if (rlErr || typeof hits !== 'number' || hits > max) {
      logJson({ ...log, status: 'rate_limited', scope: bucket === 'paddle:all' ? 'all' : 'ip' })
      return json({ error: 'rate_limited' }, 503)
    }
  }

  // ── La re-vérification : c'est ELLE qui authentifie la transaction ────────────────────────────
  let brut: unknown
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), PADDLE_TIMEOUT_MS)
  try {
    const url = `${hoteApi()}/transactions/${encodeURIComponent(lu.transactionId)}?include=customer`
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey}`, accept: 'application/json' },
      signal: ctrl.signal,
    })
    if (res.status === 404 || res.status === 410) {
      logJson({ ...log, status: 'transaction_inconnue', http: res.status })
      return acquitte('transaction inconnue')
    }
    if (!res.ok) {
      logJson({ ...log, status: 'paddle_http', http: res.status })
      return json({ error: 'upstream' }, 503)
    }
    brut = await res.json()
  } catch (e) {
    const aborted = (e as Error)?.name === 'AbortError'
    logJson({ ...log, status: aborted ? 'paddle_timeout' : 'paddle_error' })
    return json({ error: 'upstream' }, 503)
  } finally {
    clearTimeout(timer)
  }

  // Le régime d'essai vient de l'ENVIRONNEMENT : en bac à sable, aucun argent réel n'a bougé.
  const v = lireTransactionPaddle(brut, enBacASable())
  if ('erreur' in v) {
    logJson({ ...log, status: 'transaction_ecartee', raison: v.erreur })
    return acquitte(v.erreur)
  }

  // ── Naissance — le chemin PARTAGÉ avec Chariow et la réconciliation ───────────────────────────
  // C'est tout l'intérêt d'avoir extrait `order-birth` : le second rail n'en réécrit pas une ligne.
  const naissance = await faireNaitreCommande(supabase, v, log, 'paddle')
  if (naissance.statut === 'erreur') return json({ error: 'db' }, 503)
  if (naissance.statut === 'rejeu') {
    logJson({ ...log, status: 'rejeu', essai: v.essai })
    return json({ ok: true, replay: true }, 200)
  }

  logJson({
    ...log,
    status: 'ok',
    offre: v.offre,
    essai: v.essai,
    mail: naissance.mail,
    ref: naissance.refPosee ? naissance.refPosee.slice(0, 8) : null,
    octets: octets.byteLength,
  })
  return json({ ok: true }, 200)
})
