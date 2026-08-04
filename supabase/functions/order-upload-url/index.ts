// Edge Function `order-upload-url` — l'acheteur dépose son document (U2, étape 4 du parcours).
//
// C'est ici que l'invariant « aucune requête réseau ne porte le document avant le paiement »
// se paie ET se tient : le téléversement n'existe qu'après la vérification serveur, et il est
// autorisé par le JETON DE LIVRAISON, jamais par un paramètre d'URL.
//
// Contrat de sécurité :
//   • `verify_jwt = false` — l'acheteur n'a pas de compte. Le jeton EST l'autorisation.
//   • L'URL signée est portée sur UNE clé précise, calculée par le serveur : le client ne choisit
//     pas où il écrit. Il ne peut donc pas déposer ailleurs dans le bucket.
//   • **Aucune chaîne du client n'entre dans la clé** (ni nom de fichier, ni type) : le piège des
//     clés accentuées de Supabase disparaît par construction plutôt que par assainissement.
//   • Le nombre de dépôts est borné EN BASE (`deposits_used`, contrainte `between 0 and 3`) :
//     une commande à 570 F ne peut pas servir de dépôt de fichiers illimité.
//   • PDF uniquement — c'est le contrat réel de `prepareUpgradeSource` (pdf.js en entrée).
import { createClient } from 'npm:@supabase/supabase-js@2'

import { logJson, newReqId } from '../_shared/log.ts'
import { commandeParJeton, estRefus, statutHttp } from '../_shared/order-access.ts'
import {
  ETATS_DEPOSABLES,
  lireDemandeDepot,
  MAX_DEPOTS,
  peutDeposer,
  sourceObjectKey,
} from '../_shared/orders-core.ts'

const BUCKET = 'documents'
const MAX_BODY_BYTES = 4 * 1024
// Chaque appel crée une ligne et signe une URL : c'est peu cher, mais pas gratuit, et un jeton à
// 570 F ne doit pas pouvoir en générer des milliers. Le voisin `order-claim` en pose déjà.
const RL_WINDOW_S = 600
const RL_IP_MAX = 60
const RL_GLOBAL_MAX = 1200

const ALLOWED_ORIGIN =
  /^https:\/\/(www\.)?pharnos\.com$|^https:\/\/app\.pharnos\.com$|^https:\/\/([a-z0-9-]+\.)?pharnos-landing\.pages\.dev$|^https:\/\/([a-z0-9-]+\.)?pharnos-app\.pages\.dev$|^http:\/\/localhost:\d+$/

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
    headers: { 'content-type': 'application/json', ...cors(o) },
  })

Deno.serve(async (req) => {
  const origin = req.headers.get('origin')
  const log = { fn: 'order-upload-url', reqId: newReqId() }

  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin) })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405, origin)
  if (!origin || !ALLOWED_ORIGIN.test(origin)) {
    logJson({ ...log, status: 'origin_refused' })
    return json({ error: 'forbidden' }, 403, origin)
  }

  // ⚠️ Refuser AVANT de lire. `await req.text()` puis tester la longueur, c'est avoir déjà tout mis
  // en mémoire : un POST de 500 Mo depuis une origine forgée (un en-tête `Origin` s'écrit en une
  // ligne de curl) fait tomber l'isolat avant toute authentification.
  const annonce = Number(req.headers.get('content-length') ?? '0')
  if (Number.isFinite(annonce) && annonce > MAX_BODY_BYTES) {
    return json({ error: 'payload_too_large' }, 413, origin)
  }
  const brut = await req.text()
  // Filet : `content-length` peut être absent (transfert par morceaux). `.length` compte des unités
  // UTF-16, donc il MINORE le nombre d'octets — d'où la marge de 2.
  if (brut.length * 2 > MAX_BODY_BYTES) return json({ error: 'payload_too_large' }, 413, origin)

  let corps: Record<string, unknown>
  try {
    corps = JSON.parse(brut) as Record<string, unknown>
  } catch {
    return json({ error: 'bad_request' }, 400, origin)
  }

  const demande = lireDemandeDepot(corps)
  if ('erreur' in demande) {
    // Le message est RENDU au client : « seuls les PDF sont acceptés » se corrige en dix secondes,
    // un « bad_request » opaque fait ouvrir un ticket.
    logJson({ ...log, status: 'demande_refusee', raison: demande.erreur })
    return json({ error: 'invalid_source', message: demande.erreur }, 400, origin)
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  )

  const ip = req.headers.get('cf-connecting-ip')?.trim() ||
    (req.headers.get('x-forwarded-for') ?? '').split(',').map((s) => s.trim()).filter(Boolean).pop() ||
    'unknown'
  for (
    const [bucket, max] of [
      [`upload:ip:${ip}`, RL_IP_MAX],
      ['upload:all', RL_GLOBAL_MAX],
    ] as const
  ) {
    const { data: hits, error } = await supabase.rpc('share_hit', {
      p_bucket: bucket,
      p_window_seconds: RL_WINDOW_S,
    })
    // Fail-closed : une panne du compteur ne doit pas ouvrir la porte en grand.
    if (error || typeof hits !== 'number' || hits > max) {
      logJson({ ...log, status: 'rate_limited' })
      return json({ error: 'rate_limited' }, 429, origin)
    }
  }

  const commande = await commandeParJeton(supabase, corps.token)
  if (estRefus(commande)) {
    logJson({ ...log, status: `acces_${commande.refus}` })
    return json({ error: commande.refus }, statutHttp(commande), origin)
  }

  if (!peutDeposer(commande.status)) {
    // Le traitement est lancé ou terminé : accepter un nouveau document écraserait une analyse
    // en cours, ou pire, en ferait payer une seconde sans le dire.
    logJson({ ...log, status: 'depot_ferme', etat: commande.status })
    return json({ error: 'already_started', etat: commande.status }, 409, origin)
  }

  // ── Le dépôt se CONSOMME d'abord, et par compare-and-swap ─────────────────────────────────────
  // ⚠️ Lire `deposits_used` puis écrire `+1` ne borne RIEN : deux requêtes simultanées lisent 0 et
  // écrivent 1 toutes les deux. Cinquante POST parallèles avec le même jeton donnaient cinquante
  // jobs et cinquante URL signées pour un compteur à 1 — et la contrainte SQL `between 0 and 3` ne
  // voyait rien passer, puisque personne n'écrivait jamais 4.
  //
  // Le `.eq('deposits_used', …)` fait de l'écriture elle-même la garde : la seconde requête ne
  // touche aucune ligne. Et le dépôt est pris AVANT que le job n'existe — si la suite échoue, on a
  // brûlé un dépôt sur trois, ce qui est le bon côté du fail-safe.
  if (commande.depositsUsed >= MAX_DEPOTS) {
    logJson({ ...log, status: 'depots_epuises' })
    return json({ error: 'deposits_exhausted', max: MAX_DEPOTS }, 429, origin)
  }
  const { data: pris, error: casErr } = await supabase
    .from('orders')
    .update({ deposits_used: commande.depositsUsed + 1, doc_type: demande.docType })
    .eq('id', commande.id)
    .eq('deposits_used', commande.depositsUsed)
    .in('status', ETATS_DEPOSABLES)
    // ⚠️ Sans `.select()`, « aucune ligne touchée » ne se distingue pas d'un succès.
    .select('id')
  if (casErr) {
    logJson({ ...log, status: 'compteur_error' })
    return json({ error: 'db' }, 503, origin)
  }
  if (!pris?.length) {
    // Une autre requête est passée entre notre lecture et notre écriture. Ce n'est pas une panne.
    logJson({ ...log, status: 'depot_concurrent' })
    return json({ error: 'deposits_exhausted', max: MAX_DEPOTS }, 429, origin)
  }

  // ── Le job porte le document. Un nouveau dépôt = un NOUVEAU job ────────────────────────────────
  // Ne pas réutiliser le job précédent : ses rubriques éventuelles portent l'analyse de l'ANCIEN
  // document. Les mélanger produirait un rapport composite, faux et invisible.
  const { data: job, error: jobErr } = await supabase
    .from('upgrade_jobs')
    .insert({ order_id: commande.id, doc_type: demande.docType })
    .select('id')
    .single()
  if (jobErr || !job) {
    logJson({ ...log, status: 'job_error' })
    return json({ error: 'db' }, 503, origin)
  }

  const path = sourceObjectKey(commande.id, job.id)
  const { data: signed, error: sigErr } = await supabase.storage
    .from(BUCKET)
    .createSignedUploadUrl(path)
  if (sigErr || !signed) {
    logJson({ ...log, status: 'sign_error' })
    return json({ error: 'storage' }, 503, origin)
  }

  // Le chemin est écrit MAINTENANT, avant même que l'octet n'arrive : si le téléversement échoue,
  // la ligne reste sans fichier et la porte de recevabilité le dira. L'inverse — écrire le chemin
  // après coup, sur la foi du client — laisserait un job orphelin qu'aucun compteur ne verrait.
  const { error: majErr } = await supabase
    .from('upgrade_jobs')
    .update({ source_path: path })
    .eq('id', job.id)
  if (majErr) {
    logJson({ ...log, status: 'job_path_error' })
    return json({ error: 'db' }, 503, origin)
  }

  logJson({ ...log, status: 'ok', depot: commande.depositsUsed + 1, essai: commande.essai })
  return json(
    {
      jobId: job.id,
      path,
      // `token` de Storage, à passer à `uploadToSignedUrl` — sans rapport avec le jeton de livraison.
      uploadUrl: signed.signedUrl,
      uploadToken: signed.token,
      depositsLeft: MAX_DEPOTS - (commande.depositsUsed + 1),
    },
    200,
    origin,
  )
})
