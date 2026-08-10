// Edge Function `chariow-pulse` — webhook des ventes Chariow (Pulse `successful.sale`).
// Première écriture serveur d'un encaissement : la vente re-vérifiée entre dans `orders`
// (migration 0083) avec son numéro de facture. PLAN-CHARIOW lots L1+L3.
//
// Contrat sécurité :
//   • verify_jwt = false : Chariow n'a pas de compte chez nous. Un Pulse n'est PAS signé
//     (vérifié dans leur console : URL + événement, aucun champ secret) — c'est un signal,
//     jamais une preuve. La séquence est donc : recevoir → re-vérifier `GET /v1/sales/{id}`
//     avec NOTRE clé serveur → n'enregistrer QUE ce que l'API confirme. Rien du corps du
//     Pulse n'entre en base ; on n'en lit que l'identifiant de vente.
//   • URL non devinable : le Pulse est configuré avec `?jeton=<CHARIOW_PULSE_TOKEN>` ;
//     comparaison en temps constant (même garde que le jeton de recette), fail-closed —
//     secret absent = endpoint fermé. Sans le jeton : 404, indistinguable d'une route morte.
//   • Idempotence EN BASE : `orders.chariow_sale_id` unique — un rejeu (Chariow rejoue
//     jusqu'à 5 fois) renvoie la ligne existante, n'écrit rien, ne numérote rien.
//   • Rate-limit fail-closed via `share_hit` : l'endpoint est public, un scanner ne doit pas
//     pouvoir nous faire marteler l'API Chariow.
//   • Logs JSON sans PII : jamais le nom, l'e-mail ni le téléphone de l'acheteur.
//
// Codes de réponse — ils PILOTENT les rejeux Chariow, ce ne sont pas des ornements :
//   • 200 : traité, OU rejet DÉFINITIF (vente introuvable, produit inconnu, statut fermé) —
//     rejouer ne changerait rien, on éteint la file. Le rejet reste tracé dans les logs.
//   • 5xx : pépin TRANSITOIRE (API Chariow injoignable, base indisponible) — Chariow rejoue
//     (1 min → 24 h) et l'idempotence rend le rejeu sûr.
import { createClient } from 'npm:@supabase/supabase-js@2'

import {
  CHARIOW_SALES_ENDPOINT,
  lireSaleId,
  lireVente,
} from '../_shared/chariow-pulse-core.ts'
import { essaiAutorise } from '../_shared/checkout-core.ts'
import { logJson, newReqId } from '../_shared/log.ts'
import { clientIp } from '../_shared/net.ts'

const MAX_BODY_BYTES = 32 * 1024
// Chariow rejoue au plus 5 fois par vente ; 120/h global couvre un jour de ventes exceptionnel,
// et coupe court à un martèlement. Par IP, 60/h : leurs relais sont peu nombreux.
const IP_WINDOW_S = 3600
const IP_MAX_HITS = 60
const GLOBAL_WINDOW_S = 3600
const GLOBAL_MAX_HITS = 120
const CHARIOW_TIMEOUT_MS = 15_000

const json = (body: unknown, status: number): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })

Deno.serve(async (req) => {
  const log = { fn: 'chariow-pulse', reqId: newReqId() }

  if (req.method !== 'POST') return json({ error: 'not_found' }, 404)

  // Jeton d'URL AVANT toute lecture du corps : sans lui, la route n'existe pas.
  const jeton = new URL(req.url).searchParams.get('jeton')
  if (!essaiAutorise(jeton, Deno.env.get('CHARIOW_PULSE_TOKEN'))) {
    logJson({ ...log, status: 'forbidden_token' })
    return json({ error: 'not_found' }, 404)
  }

  const apiKey = Deno.env.get('CHARIOW_API_KEY')
  if (!apiKey) {
    // Configuration absente = on ne peut RIEN vérifier : transitoire, Chariow rejouera.
    logJson({ ...log, status: 'missing_api_key' })
    return json({ error: 'server_error' }, 500)
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false } },
    )

    // Rate-limit fail-closed : par IP puis global — 503 dans les deux cas, le rejeu Chariow
    // repassera quand la fenêtre sera retombée. Aucun 429 « désignant un abuseur » ici :
    // l'appelant légitime est un robot, pas un humain à ménager.
    const ip = clientIp(req.headers)
    const limits: ReadonlyArray<[string, number, number]> = [
      [`pulse:ip:${ip}`, IP_WINDOW_S, IP_MAX_HITS],
      ['pulse:all', GLOBAL_WINDOW_S, GLOBAL_MAX_HITS],
    ]
    for (const [bucket, windowS, max] of limits) {
      const { data: hits, error } = await supabase.rpc('share_hit', {
        p_bucket: bucket,
        p_window_seconds: windowS,
      })
      if (error || typeof hits !== 'number' || hits > max) {
        logJson({
          ...log,
          status: error || typeof hits !== 'number' ? 'rate_limit_unavailable' : 'rate_limited',
          scope: bucket === 'pulse:all' ? 'all' : 'ip',
        })
        return json({ error: 'rate_limited' }, 503)
      }
    }

    const raw = await req.text()
    if (raw.length > MAX_BODY_BYTES) return json({ error: 'payload_too_large' }, 413)
    let body: unknown = null
    try {
      body = JSON.parse(raw)
    } catch {
      // corps illisible : saleId absent → 400 juste en dessous.
    }
    const saleId = lireSaleId(body)
    if (!saleId) {
      // Sans identifiant, rien à vérifier ni à rejouer : définitif. Les clés du corps (jamais
      // les valeurs) sont tracées pour diagnostiquer un changement de forme du Pulse.
      logJson({
        ...log,
        status: 'sale_id_absent',
        cles: typeof body === 'object' && body !== null ? Object.keys(body).slice(0, 12) : [],
      })
      return json({ error: 'bad_request' }, 400)
    }

    // Re-vérification serveur — LA porte. Bornée dans le temps ; un dépassement est transitoire.
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), CHARIOW_TIMEOUT_MS)
    let res: Response
    try {
      res = await fetch(`${CHARIOW_SALES_ENDPOINT}/${saleId}`, {
        headers: { Authorization: `Bearer ${apiKey}`, accept: 'application/json' },
        signal: ctrl.signal,
      })
    } finally {
      clearTimeout(timer)
    }
    let corps: unknown = null
    try {
      corps = await res.json()
    } catch {
      // corps illisible : lireVente le classera en `reponse`.
    }

    const lu = lireVente(res.status, corps)
    if (!lu.ok) {
      logJson({
        ...log,
        status: `vente_${lu.raison}`,
        detail: lu.detail ?? null,
        httpStatus: res.status,
        saleId,
      })
      // `introuvable` (forgeage), `statut_ferme` (remboursée, échouée) et `produit_inconnu`
      // sont définitifs : 200 éteint les rejeux, la trace reste. `reponse` (5xx, schéma) et
      // `statut_inconnu` (nomenclature à compléter) sont transitoires : 502, Chariow rejoue
      // jusqu'à 24 h — le temps de corriger sans perdre la vente.
      return lu.raison === 'reponse' || lu.raison === 'statut_inconnu'
        ? json({ error: 'upstream' }, 502)
        : json({ received: true, recorded: false }, 200)
    }

    const v = lu.vente
    const { data, error } = await supabase.rpc('record_chariow_sale', {
      p_sale_id: v.saleId,
      p_purchase_id: v.purchaseId,
      p_offer: v.offre,
      p_essai: v.essai,
      p_credits: v.credits,
      p_amount: v.montant,
      p_currency: v.devise,
      p_email: v.email,
      p_first_name: v.prenom,
      p_last_name: v.nom,
      p_phone: v.telephone,
      p_country: v.pays,
      p_ref: v.ref,
      p_metadata: v.metadata,
    })
    if (error) {
      // Base indisponible ou contrainte inattendue : transitoire, l'idempotence absorbe le rejeu.
      logJson({ ...log, status: 'db_error', err: error.message.slice(0, 200), saleId })
      return json({ error: 'server_error' }, 500)
    }

    const resultat = data as { order_id?: string; invoice_number?: string | null; inserted?: boolean }
    logJson({
      ...log,
      status: 'ok',
      saleId,
      offre: v.offre,
      essai: v.essai,
      credits: v.credits,
      montant: v.montant,
      devise: v.devise,
      inserted: resultat?.inserted ?? null,
      facture: Boolean(resultat?.invoice_number),
      ref: v.ref ? v.ref.slice(0, 8) : null,
    })
    return json({ received: true, recorded: true }, 200)
  } catch (e) {
    const aborted = e instanceof DOMException && e.name === 'AbortError'
    logJson({
      ...log,
      status: aborted ? 'chariow_timeout' : 'error',
      err: e instanceof Error ? e.message.slice(0, 200) : String(e).slice(0, 200),
    })
    return json({ error: 'server_error' }, aborted ? 504 : 500)
  }
})
