// Edge Function `order-source` — la page publique récupère le document que l'acheteur a déposé (U3).
//
// POURQUOI CETTE SURFACE EXISTE. Le document est téléversé depuis `pharnos.com` (le pont U2), et il
// est lu depuis `app.pharnos.com` (la page `/u/{token}`). Deux origines, donc **aucun stockage
// navigateur partagé** : le fichier ne peut pas voyager autrement que par Storage, et la page n'a ni
// compte ni JWT pour l'y lire. Cette fonction est le seul pont — elle signe une URL de lecture,
// courte, sur une clé que le SERVEUR calcule.
//
// ⚠️ ELLE CONSTATE, ELLE NE CROIT PAS. Le téléversement se fait sur une URL signée : personne ne
// nous dit que les octets sont arrivés. `source_path` est écrit à l'ÉMISSION de l'URL, donc sa
// présence en base ne prouve rien. C'est le `list()` de Storage qui fait foi — et c'est seulement
// une fois l'objet constaté que la commande passe à `source_uploaded`. Sans ce constat, un acheteur
// revenu par l'e-mail n°1 se verrait redemander son fichier alors qu'il l'a déjà envoyé, et
// **brûlerait un dépôt sur trois** pour rien.
//
// Contrat de sécurité :
//   • `verify_jwt = false` — l'acheteur n'a pas de compte. Le jeton EST l'autorisation.
//   • La clé signée vient de `upgrade_jobs.source_path`, jamais du client : aucune lecture d'un
//     objet arbitraire du bucket n'est atteignable depuis ici.
//   • Le job doit appartenir à la commande du jeton (`.eq('order_id', …)`).
//   • URL de courte durée, débit borné (IP puis global, fail-closed), logs sans PII.
import { createClient } from 'npm:@supabase/supabase-js@2'

import { logJson, newReqId } from '../_shared/log.ts'
import { commandeParJeton, estRefus, statutHttp } from '../_shared/order-access.ts'
import {
  dejaLance,
  DOC_TYPES_VENDABLES,
  jugerObjetSource,
  SOURCE_OBJECT_NAME,
  sourceObjectFolder,
  statutHttpObjetSource,
} from '../_shared/orders-core.ts'

const BUCKET = 'documents'
const MAX_BODY_BYTES = 2 * 1024
/**
 * Durée de vie de l'URL signée. Assez pour télécharger 25 Mo sur un lien africain médiocre, assez
 * court pour qu'une URL retrouvée dans un historique ne vaille plus rien. La page en redemande une
 * si le téléchargement échoue — c'est un appel, pas un dépôt.
 */
const URL_TTL_S = 600
const RL_WINDOW_S = 600
/** La page appelle une fois par visite, deux si le téléchargement a échoué. 30 laisse la place. */
const RL_IP_MAX = 30
const RL_GLOBAL_MAX = 600

const ALLOWED_ORIGIN =
  /^https:\/\/app\.pharnos\.com$|^https:\/\/([a-z0-9-]+\.)?pharnos-app\.pages\.dev$|^http:\/\/localhost:\d+$/

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
    headers: {
      'content-type': 'application/json',
      // Une URL signée à durée de vie courte ne se met JAMAIS en cache : un proxy qui la garderait
      // servirait un lien mort à la visite suivante.
      'cache-control': 'no-store',
      ...cors(o),
    },
  })

Deno.serve(async (req) => {
  const origin = req.headers.get('origin')
  const log = { fn: 'order-source', reqId: newReqId() }

  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin) })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405, origin)
  if (!origin || !ALLOWED_ORIGIN.test(origin)) {
    logJson({ ...log, status: 'origin_refused' })
    return json({ error: 'forbidden' }, 403, origin)
  }

  // ⚠️ Refuser AVANT de lire : `await req.text()` puis mesurer, c'est avoir déjà tout mis en mémoire.
  const annonce = Number(req.headers.get('content-length') ?? '0')
  if (Number.isFinite(annonce) && annonce > MAX_BODY_BYTES) {
    return json({ error: 'payload_too_large' }, 413, origin)
  }
  const brut = await req.text()
  // `.length` compte des unités UTF-16, donc il MINORE les octets — d'où la marge de 2.
  if (brut.length * 2 > MAX_BODY_BYTES) return json({ error: 'payload_too_large' }, 413, origin)

  let corps: Record<string, unknown>
  try {
    corps = JSON.parse(brut) as Record<string, unknown>
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
    const [bucket, max] of [[`source:ip:${ip}`, RL_IP_MAX], ['source:all', RL_GLOBAL_MAX]] as const
  ) {
    const { data: hits, error } = await sb.rpc('share_hit', {
      p_bucket: bucket,
      p_window_seconds: RL_WINDOW_S,
    })
    // Fail-closed : une panne du compteur ne doit pas ouvrir la porte en grand.
    if (error || typeof hits !== 'number' || hits > max) {
      logJson({ ...log, status: 'rate_limited' })
      return json({ error: 'rate_limited' }, 429, origin)
    }
  }

  const commande = await commandeParJeton(sb, corps.token)
  if (estRefus(commande)) {
    logJson({ ...log, status: `acces_${commande.refus}` })
    return json({ error: commande.refus }, statutHttp(commande), origin)
  }

  // Une commande lancée n'a plus rien à préparer : le moteur travaille sur un corpus déjà franchi.
  // Resigner l'URL ici serait sans danger, mais laisserait croire à la page qu'elle doit recommencer.
  if (dejaLance(commande.status)) {
    logJson({ ...log, status: 'deja_lance', etat: commande.status })
    return json({ error: 'already_started', etat: commande.status }, 409, origin)
  }

  // ⚠️ UNE COMMANDE REFUSÉE NE REÇOIT RIEN — et la garde est ICI, pas dans l'écran.
  //
  // Après un refus, le document le plus récent est celui que la porte vient d'écarter. Le rendre
  // ferait re-préparer, re-soumettre, re-refuser — en boucle, jusqu'à épuiser les trois dépôts
  // d'une commande payée. Le front porte déjà cette règle (`doitChercherSource`), mais **une
  // garantie doit vivre dans la fonction qui ÉCRIT** : un second onglet, un rejeu ou une future
  // surface d'administration contournerait un calcul d'affichage.
  if (commande.status === 'gated_out') {
    logJson({ ...log, status: 'refuse_precedemment' })
    return json({ error: 'gated_out' }, 409, origin)
  }

  // Le job COURANT : le plus récent. Un nouveau dépôt en crée un nouveau, et le précédent porte le
  // document REFUSÉ — le rouvrir ferait analyser le mauvais fichier, sans que rien ne le signale.
  const { data: jobs, error: jobErr } = await sb
    .from('upgrade_jobs')
    .select('id, doc_type, source_path')
    .eq('order_id', commande.id)
    .not('source_path', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1)
  if (jobErr) {
    logJson({ ...log, status: 'db_error' })
    return json({ error: 'db' }, 503, origin)
  }
  const job = jobs?.[0]
  if (!job?.source_path) {
    // Cas NOMINAL de l'acheteur qui a fermé l'onglet avant le téléversement : ce n'est pas une
    // panne, c'est la page qui doit lui redemander son fichier.
    //
    // ⚠️ 409 et NON 404. Le 404 de ce parcours est déjà pris : c'est la réponse d'un jeton inconnu
    // (`order-access.ts`), et la page en fait « votre lien a expiré ». Un acheteur qui n'a rien
    // déposé y lirait la mort de sa commande au lieu d'un écran de dépôt.
    logJson({ ...log, status: 'aucun_depot' })
    return json({ error: 'no_source' }, 409, origin)
  }

  const { data: objets, error: lsErr } = await sb.storage
    .from(BUCKET)
    .list(sourceObjectFolder(job.source_path), { limit: 1, search: SOURCE_OBJECT_NAME })
  if (lsErr) {
    logJson({ ...log, status: 'storage_error' })
    return json({ error: 'storage' }, 503, origin)
  }
  const verdict = jugerObjetSource(objets?.[0])
  if (!verdict.ok) {
    logJson({ ...log, status: `objet_${verdict.refus}` })
    return json(
      verdict.refus === 'absent'
        ? { error: 'source_absente' }
        : { error: 'invalid_source', message: verdict.message },
      statutHttpObjetSource(verdict),
      origin,
    )
  }

  // ── L'objet est CONSTATÉ : la commande peut passer à `source_uploaded` ────────────────────────
  // ⚠️ `.eq('status', 'paid')` et NON `.in(ETATS_DEPOSABLES)` : cette liste contient `gated_out`,
  // donc un rejeu concurrent aurait pu faire REMONTER une commande refusée vers « préparation », en
  // pointant sur le document que la porte venait d'écarter. Entre notre lecture et cette écriture,
  // la porte a aussi pu lancer le travail : rétrograder un `running` rouvrirait le dépôt sur une
  // commande en cours — deux documents pour une analyse à ~2 $ pièce. Seul `paid` avance.
  // L'échec de cette écriture n'est PAS bloquant : elle ne fait qu'accélérer l'écran de reprise.
  if (commande.status === 'paid') {
    const { error: majErr } = await sb
      .from('orders')
      .update({ status: 'source_uploaded' })
      .eq('id', commande.id)
      .eq('status', 'paid')
    if (majErr) logJson({ ...log, status: 'statut_non_avance' })
  }

  const { data: signed, error: sigErr } = await sb.storage
    .from(BUCKET)
    .createSignedUrl(job.source_path, URL_TTL_S)
  if (sigErr || !signed?.signedUrl) {
    logJson({ ...log, status: 'sign_error' })
    return json({ error: 'storage' }, 503, origin)
  }

  logJson({ ...log, status: 'ok', octets: verdict.taille })
  return json(
    {
      jobId: job.id,
      // Liste blanche FERMÉE — jamais la valeur brute de la base : elle commande le gabarit lu par
      // l'écran, et un `constructor` y ferait le même dégât qu'à la porte.
      docType: DOC_TYPES_VENDABLES.has(job.doc_type) ? job.doc_type : 'rcp',
      url: signed.signedUrl,
      expiresIn: URL_TTL_S,
    },
    200,
    origin,
  )
})
