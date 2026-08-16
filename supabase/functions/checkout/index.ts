// Edge Function `checkout` — ouvre une session de paiement pour la Bibliothèque réglementaire
// (pharnos.com/modele), afin que l'identité du client se saisisse dans NOTRE design et que la
// boutique du processeur ne soit jamais visible : le navigateur reçoit une URL de paiement et
// rien d'autre.
//
// DEUX RAILS, un seul contrat de sortie (`{url}`) : Chariow encaisse le mobile money UEMOA,
// Paddle est merchant of record pour le reste du monde. La bascule est `RAIL_PAIEMENT`, et le
// navigateur ne sait pas — n'a pas à savoir — lequel l'a servi.
//
// Contrat sécurité :
//   • verify_jwt = false : l'acheteur n'a pas de compte. Surface minuscule — POST JSON borné,
//     AUCUNE donnée lue, aucune écriture en base ici, et rien d'écrit chez le processeur non
//     plus : on crée un ordre de paiement, jamais une fiche client à partir d'une adresse que
//     personne n'a prouvée.
//   • La clé du processeur ne sort JAMAIS du serveur ; le navigateur nomme une OFFRE
//     (`up1`/`up3`), le serveur seul nomme le produit (mapping dans checkout-core / PADDLE_PRICES).
//   • CORS dédié à la landing (même allowlist que demo-request) — l'app n'appelle pas ceci.
//   • Anti-abus : rate-limit par IP puis global via `share_hit` (service-role, fail-closed).
//     Pas de honeypot : le formulaire est DERRIÈRE deux clics volontaires et l'appel Chariow
//     est lui-même borné par le plafond.
//   • Logs JSON sans PII : jamais le nom, l'e-mail ni le téléphone de l'acheteur.
import { createClient } from 'npm:@supabase/supabase-js@2'

import {
  CHARIOW_ENDPOINT,
  type CommandeValidee,
  corpsChariow,
  essaiAutorise,
  lireReponseChariow,
  validerCommande,
} from '../_shared/checkout-core.ts'
import { logJson, newReqId } from '../_shared/log.ts'
import {
  corpsTransactionPaddle,
  lireTransactionCreee,
  PADDLE_VERSION,
  paddleApi,
  prixParOffre,
  regimeCoherent,
  urlTunnel,
} from '../_shared/paddle-checkout.ts'
import { clientIp } from '../_shared/net.ts'

const MAX_BODY_BYTES = 4 * 1024
// 20 sessions/h par IP — large pour un acheteur qui se reprend, et les opérateurs mobiles
// UEMOA font passer des immeubles entiers derrière une même IP (CGNAT). 120/h au global
// (protège notre réputation d'appelant API chez Chariow autant que leur quota).
const IP_WINDOW_S = 3600
const IP_MAX_HITS = 20
const GLOBAL_WINDOW_S = 3600
const GLOBAL_MAX_HITS = 120
// L'API du processeur répond en pratique en moins de 5 s ; au-delà de 15, l'acheteur a déjà
// renoncé — on répond une erreur franche. Le budget est celui d'UN appel : les deux rails ne font
// qu'une seule requête sortante sur le chemin chaud, et rien de facultatif ne doit pouvoir manger
// le temps de la seule qui encaisse.
const PAIEMENT_TIMEOUT_MS = 15_000

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

/**
 * Ouvre un paiement PADDLE. Même contrat de sortie que le chemin Chariow — `{url}` ou une erreur
 * nommée — pour que le navigateur n'ait rien à savoir du rail qui l'a servi.
 *
 * UN SEUL appel sortant, volontairement. La version précédente en faisait trois (chercher le
 * client, le créer, créer la transaction) pour pré-remplir le tunnel : un confort qui partageait
 * son budget de temps avec la seule requête qui encaisse, et qui surtout rattachait la vente à un
 * client Paddle désigné par une adresse que PERSONNE n'avait prouvée. Le pré-remplissage, s'il
 * revient, se fera côté navigateur — afficher sans lier.
 *
 * ⚠️ Aucun repli inter-rails : toutes les sorties portent `repli: 'aucun'`. Renvoyer un acheteur
 * européen vers Chariow parce que Paddle a hoqueté annulerait la seule raison d'être de ce rail —
 * la TVA collectée et reversée par un merchant of record.
 */
async function ouvrirPaiementPaddle(
  cmd: CommandeValidee,
  essai: boolean,
  log: Record<string, unknown>,
  origin: string | null,
): Promise<Response> {
  const ferme = (status: number) => json({ error: 'server_error', repli: 'aucun' }, status, origin)
  const bacASable = Deno.env.get('PADDLE_ENV') !== 'live'
  const apiKey = Deno.env.get('PADDLE_API_KEY')
  const prix = prixParOffre(Deno.env.get('PADDLE_PRICES'))[cmd.offre]
  if (!apiKey || !prix) {
    // Configuration incomplète = vente fermée sur ce rail, pas de demi-mesure. Le log dit LEQUEL
    // des deux manque plutôt que « erreur serveur » : un rail basculé mais inopérant est un
    // incident à voir tout de suite, pas une ligne à retrouver plus tard.
    logJson({ ...log, status: 'paddle_non_configure', cle: Boolean(apiKey), prix: Boolean(prix) })
    return ferme(503)
  }
  if (!regimeCoherent(bacASable, essai)) {
    // UNE équivalence, pas deux gardes : le régime d'essai de ce rail EST le bac à sable, et les
    // deux écarts coûtent. Un essai en production facture le plein tarif à qui croyait tester ; un
    // bac à sable sans jeton de recette laisse n'importe quel visiteur repartir avec les cinq
    // fichiers réels, moteur à notre charge. Le log dit LEQUEL des deux, pas seulement « refusé ».
    logJson({ ...log, status: 'paddle_regime_incoherent', bacASable, essai, offre: cmd.offre })
    return ferme(503)
  }

  // L'origine de l'ACHETEUR porte le tunnel : la page ne se laisse cadrer que par elle-même.
  // Repli sur l'apex quand l'appel arrive sans `Origin` (navigation directe, outil de recette).
  const origineTunnel = origin && ALLOWED_ORIGIN.test(origin) ? origin : 'https://pharnos.com'
  const urlDemandee = urlTunnel(origineTunnel, cmd.langue, bacASable)

  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), PAIEMENT_TIMEOUT_MS)
  try {
    const res = await fetch(`${paddleApi(bacASable)}/transactions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
        'Paddle-Version': PADDLE_VERSION,
        // La référence de commande est déjà unique par commande : un double-clic sur « Payer »
        // rend la MÊME transaction au lieu d'en semer une seconde, orpheline.
        'Paddle-Idempotency-Key': cmd.ref,
      },
      signal: ctrl.signal,
      body: JSON.stringify(corpsTransactionPaddle(cmd, prix, urlDemandee)),
    })
    const corps = await res.json().catch(() => null)
    const lu = lireTransactionCreee(res.status, corps, urlDemandee)
    if (!lu.ok) {
      // Le CODE et non le détail : les détails de validation Paddle ré-échoient la valeur soumise,
      // et ce fichier promet des logs sans PII. Le code est une énumération stable, donc plus
      // exploitable.
      const err = (corps as { error?: { code?: unknown } } | null)?.error
      logJson({
        ...log,
        status: 'paddle_refus',
        rail: 'paddle',
        httpStatus: res.status,
        offre: cmd.offre,
        essai,
        ref: cmd.ref.slice(0, 8),
        code: typeof err?.code === 'string' ? err.code : null,
      })
      return ferme(502)
    }
    logJson({
      ...log,
      status: 'ok',
      rail: 'paddle',
      offre: cmd.offre,
      essai,
      ref: cmd.ref.slice(0, 8),
      txn: lu.transactionId.slice(0, 12),
    })
    return json({ url: lu.url }, 200, origin)
  } catch (e) {
    // Le message est journalisé : sans lui, un bug de NOTRE code se présente comme une panne amont
    // et se diagnostique à l'aveugle. Il vient de nous, pas de l'acheteur — donc sans PII.
    const aborted = e instanceof DOMException && e.name === 'AbortError'
    logJson({
      ...log,
      status: aborted ? 'paddle_timeout' : 'paddle_error',
      rail: 'paddle',
      err: aborted ? null : String(e).slice(0, 200),
    })
    return ferme(aborted ? 504 : 502)
  } finally {
    clearTimeout(timer)
  }
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin')
  const log = { fn: 'checkout', reqId: newReqId() }

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

    const v = validerCommande(body)
    if (!v.ok) {
      logJson({ ...log, status: 'invalid_fields', champs: v.champs })
      return json({ error: 'invalid_fields', champs: v.champs }, 400, origin)
    }

    // Recette : le navigateur PRÉSENTE un jeton, il ne le choisit pas. Sans `CHECKOUT_ESSAI_TOKEN`
    // en secret, aucun essai n'est possible — l'absence de configuration ferme le mode, elle ne
    // l'ouvre pas.
    const essai = essaiAutorise(body.essai, Deno.env.get('CHECKOUT_ESSAI_TOKEN'))

    // Rate-limit fail-closed : par IP puis global. `clientIp` lit le XFF par la FIN — la
    // première entrée est celle que l'appelant a bien voulu écrire.
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false } },
    )
    const ip = clientIp(req.headers)
    const limits: ReadonlyArray<[string, number, number]> = [
      [`checkout:ip:${ip}`, IP_WINDOW_S, IP_MAX_HITS],
      ['checkout:all', GLOBAL_WINDOW_S, GLOBAL_MAX_HITS],
    ]
    for (const [bucket, windowS, max] of limits) {
      const scope = bucket === 'checkout:all' ? 'all' : 'ip'
      const { data: hits, error } = await supabase.rpc('share_hit', {
        p_bucket: bucket,
        p_window_seconds: windowS,
      })
      // ⚠️ Un pépin technique du compteur ou la saturation du plafond GLOBAL ne ferment pas la
      // vente : 503 → le navigateur retombe sur le lien de paiement direct, qui vit sans nous.
      // Le 429 est réservé au plafond PAR IP — le seul qui désigne un abuseur ; en faire le
      // code de tout échec offrirait à n'importe quel script le pouvoir de fermer la boutique
      // pour tout le monde au prix de 120 requêtes.
      if (error || typeof hits !== 'number') {
        logJson({ ...log, status: 'rate_limit_unavailable', scope })
        return json({ error: 'server_error' }, 503, origin)
      }
      if (hits > max) {
        logJson({ ...log, status: 'rate_limited', scope })
        return json({ error: 'rate_limited' }, scope === 'all' ? 503 : 429, origin)
      }
    }

    // ── Le RAIL — une bascule, jamais une règle métier ─────────────────────────────────────────
    // `RAIL_PAIEMENT=paddle` fait passer l'encaissement par le merchant of record ; toute autre
    // valeur (y compris absente) garde Chariow. Une variable d'environnement plutôt qu'une règle
    // par pays : le jour où le compte Paddle est validé, la bascule se retourne en dix secondes,
    // sans redéploiement ni logique à débuguer. La règle par pays viendra quand il y aura des
    // ventes réelles sur les deux rails à comparer.
    //
    // Le rail voyage dans TOUTES les lignes de log à partir d'ici : une valeur mal casée
    // (`Paddle`, ou avec une espace) sert Chariow, et sans ce champ ce basculement muet se
    // chercherait pendant une heure.
    const rail = Deno.env.get('RAIL_PAIEMENT') === 'paddle' ? 'paddle' : 'chariow'
    Object.assign(log, { rail })
    if (rail === 'paddle') return await ouvrirPaiementPaddle(v.cmd, essai, log, origin)

    // La clé Chariow n'est exigée que sur SON rail : sans cette place, un secret Chariow expiré
    // fermerait une boutique qui ne passe plus par lui, et le rail Paddle ne pourrait pas vivre
    // seul le jour où l'autre sera décommissionné.
    const apiKey = Deno.env.get('CHARIOW_API_KEY')
    if (!apiKey) {
      // Configuration absente = vente fermée, pas de demi-mesure : le front garde son repli.
      logJson({ ...log, status: 'missing_api_key' })
      return json({ error: 'server_error' }, 500, origin)
    }

    // L'ordre d'encaissement part vers Chariow — borné dans le temps : au-delà, erreur franche.
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), PAIEMENT_TIMEOUT_MS)
    let res: Response
    try {
      res = await fetch(CHARIOW_ENDPOINT, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify(corpsChariow(v.cmd, ip, essai)),
        signal: ctrl.signal,
      })
    } finally {
      clearTimeout(timer)
    }

    let corps: unknown = null
    try {
      corps = await res.json()
    } catch {
      // corps illisible : lireReponseChariow le classera en erreur franche.
    }
    const lu = lireReponseChariow(res.status, corps)
    if (!lu.ok) {
      // Le MOTIF du refus est journalisé : sans lui, un échec d'encaissement se diagnostique
      // à l'aveugle. `message` de Chariow décrit la règle violée et ne porte pas de PII —
      // les champs fautifs (`errors`) sont réduits à leurs NOMS, jamais à leurs valeurs.
      const detail = corps as { message?: unknown; errors?: Record<string, unknown> } | null
      logJson({
        ...log,
        status: lu.erreur,
        httpStatus: res.status,
        offre: v.cmd.offre,
        essai,
        ref: v.cmd.ref.slice(0, 8),
        motif: typeof detail?.message === 'string' ? detail.message.slice(0, 300) : null,
        champs: detail?.errors ? Object.keys(detail.errors).slice(0, 12) : null,
      })
      // `donnees` → 400 : c'est la saisie du client qu'il faut corriger, sur NOTRE formulaire.
      const code = lu.erreur === 'deja_achete' ? 409 : lu.erreur === 'donnees' ? 400 : 502
      return json({ error: lu.erreur, champs: lu.champs ?? [] }, code, origin)
    }

    logJson({ ...log, status: 'ok', offre: v.cmd.offre, essai, ref: v.cmd.ref.slice(0, 8) })
    return json({ url: lu.url }, 200, origin)
  } catch (e) {
    const aborted = e instanceof DOMException && e.name === 'AbortError'
    logJson({
      ...log,
      status: aborted ? 'chariow_timeout' : 'error',
      err: e instanceof Error ? e.message.slice(0, 200) : String(e).slice(0, 200),
    })
    return json({ error: 'server_error' }, aborted ? 504 : 500, origin)
  }
})
