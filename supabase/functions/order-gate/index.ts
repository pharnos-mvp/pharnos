// Edge Function `order-gate` — la porte de recevabilité, ET le lancement quand elle s'ouvre (U3).
//
// Le plan prévoyait deux surfaces (`order-gate` puis `order-start`). Elles n'en font qu'une ici,
// et c'est délibéré : **il n'y a aucune décision de l'utilisateur entre les deux**. Séparer, ce
// serait offrir une fenêtre où une commande est « recevable mais pas lancée » — un état que rien
// ne ferme, et deux surfaces publiques au lieu d'une. Le verdict et sa conséquence tiennent donc
// dans le même appel.
//
// Contrat de sécurité, et il est commercial autant que technique :
//   • **Un refus ne consomme AUCUN crédit**, et le dit. Aucune ligne `upgrade_sections` n'est
//     créée avant que la porte ne soit franchie : il n'y a donc rien à « rembourser ».
//   • Le corpus de contrôle vient du NAVIGATEUR (`prepareUpgradeSource`) : le serveur ne relit pas
//     le PDF, il n'en a ni le temps ni le besoin. La provenance (`text` | `ocr`) est DÉCLARÉE par
//     le navigateur, jamais devinée — c'est elle qui commande la tolérance de lecture.
//   • Relancer une commande déjà lancée est refusé (409) : sans cela, un double clic doublerait
//     les 60 appels IA, soit ~2 $ pour rien.
import { createClient } from 'npm:@supabase/supabase-js@2'

import { flattenRubrics } from '../_shared/conformity-specs.ts'
import { CONFORMITY_SPECS, type ConformityDocType } from '../_shared/conformity-specs.ts'
import { logJson, newReqId } from '../_shared/log.ts'
import { commandeParJeton, estRefus, statutHttp } from '../_shared/order-access.ts'
import { jugerRecevabilite, messageRefus } from '../_shared/order-gate-core.ts'
import {
  dejaLance,
  DOC_TYPES_VENDABLES,
  ETATS_DEPOSABLES,
  isValidRef as isUuid,
  jugerObjetSource,
  MAX_DEPOTS,
  SOURCE_OBJECT_NAME,
  sourceObjectFolder,
  statutHttpObjetSource,
} from '../_shared/orders-core.ts'

const BUCKET = 'documents'
/**
 * Corpus de contrôle accepté. Aligné sur la borne du rapprochement approché (`order-gate-core`) :
 * accepter dix fois plus que ce qu'on sait juger sous le budget CPU serait une invitation au 546.
 */
const MAX_BODY_BYTES = 400_000
const RL_WINDOW_S = 600
const RL_IP_MAX = 40
const RL_GLOBAL_MAX = 600
const DOC_LABELS: Record<string, { fr: string; en: string }> = {
  rcp: { fr: 'un RCP (Résumé des Caractéristiques du Produit)', en: 'an SmPC' },
  notice: { fr: 'une notice patient', en: 'a package leaflet' },
  labeling: { fr: 'un étiquetage', en: 'a labelling document' },
}

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
    headers: { 'content-type': 'application/json', ...cors(o) },
  })

Deno.serve(async (req) => {
  const origin = req.headers.get('origin')
  const log = { fn: 'order-gate', reqId: newReqId() }

  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin) })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405, origin)
  if (!origin || !ALLOWED_ORIGIN.test(origin)) {
    logJson({ ...log, status: 'origin_refused' })
    return json({ error: 'forbidden' }, 403, origin)
  }

  // Refuser AVANT de lire : sinon un corps démesuré est déjà en mémoire quand on le rejette.
  const annonce = Number(req.headers.get('content-length') ?? '0')
  if (Number.isFinite(annonce) && annonce > MAX_BODY_BYTES * 2) {
    return json({ error: 'payload_too_large' }, 413, origin)
  }
  const brut = await req.text()
  if (brut.length > MAX_BODY_BYTES * 2) return json({ error: 'payload_too_large' }, 413, origin)

  let corps: Record<string, unknown>
  try {
    corps = JSON.parse(brut) as Record<string, unknown>
  } catch {
    return json({ error: 'bad_request' }, 400, origin)
  }

  const controlText = typeof corps.controlText === 'string' ? corps.controlText : ''
  const sourceKind = corps.sourceKind === 'ocr' ? 'ocr' : 'text'
  const jobId = typeof corps.jobId === 'string' ? corps.jobId : ''
  // ⚠️ `jobId` part dans un `.eq('id', …)` sur une colonne `uuid` : une chaîne libre y déclenche un
  // `22P02` côté Postgres, que l'on traduirait en 503 « db » — un 400 du client déguisé en panne
  // serveur, qui masquerait un jour un vrai incident de base derrière du bruit.
  if (!controlText || !isUuid(jobId)) {
    return json({ error: 'bad_request' }, 400, origin)
  }
  if (controlText.length > MAX_BODY_BYTES) {
    return json({ error: 'payload_too_large' }, 413, origin)
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  )

  for (
    const [bucket, max] of [
      [`gate:ip:${
        req.headers.get('cf-connecting-ip')?.trim() ||
        (req.headers.get('x-forwarded-for') ?? '').split(',').map((s) => s.trim()).filter(Boolean).pop() ||
        'unknown'
      }`, RL_IP_MAX],
      ['gate:all', RL_GLOBAL_MAX],
    ] as const
  ) {
    const { data: hits, error } = await supabase.rpc('share_hit', {
      p_bucket: bucket,
      p_window_seconds: RL_WINDOW_S,
    })
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

  // ⚠️ LA GARDE PASSE AVANT TOUTE ÉCRITURE, et c'est le correctif d'un défaut grave : la branche de
  // refus posait `gated_out` d'abord, ce qui rendait la garde inatteignable — puis rouvrait le
  // dépôt. On pouvait alors relancer autant de traitements qu'on voulait sur une seule commande
  // payée, à ~2 $ pièce, en alternant « faux document » et « vrai document ».
  if (dejaLance(commande.status)) {
    logJson({ ...log, status: 'deja_lance', etat: commande.status })
    return json({ status: 'already_running' }, 409, origin)
  }

  // Le job doit appartenir à CETTE commande : sans ce contrôle, un jeton valide permettrait de
  // lancer le travail sur le document d'une autre commande.
  const { data: job, error: jobErr } = await supabase
    .from('upgrade_jobs')
    .select('id, order_id, doc_type, source_path, started_at')
    .eq('id', jobId)
    .eq('order_id', commande.id)
    .maybeSingle()
  if (jobErr) {
    logJson({ ...log, status: 'db_error' })
    return json({ error: 'db' }, 503, origin)
  }
  if (!job || !job.source_path) {
    logJson({ ...log, status: 'job_inconnu' })
    return json({ error: 'not_found' }, 404, origin)
  }

  // ── Le fichier existe-t-il VRAIMENT, et est-ce bien un PDF ? ──────────────────────────────────
  // ⚠️ `source_path` est écrit à l'émission de l'URL signée, donc il est toujours renseigné : sa
  // présence ne prouve rien. Sans ce contrôle, on pouvait demander une URL, ne rien téléverser,
  // envoyer un corpus inventé, et faire partir le moteur sur un objet inexistant — la commande
  // restait bloquée en `running`. C'est AUSSI le seul endroit où le type et la taille réels sont
  // constatés : `contentType` et `size` du dépôt sont DÉCLARÉS par le client, et l'URL signée ne
  // contraint ni l'un ni l'autre.
  const { data: objets, error: lsErr } = await supabase.storage
    .from(BUCKET)
    .list(sourceObjectFolder(job.source_path), { limit: 1, search: SOURCE_OBJECT_NAME })
  if (lsErr) {
    logJson({ ...log, status: 'storage_error' })
    return json({ error: 'storage' }, 503, origin)
  }
  // Jugement PARTAGÉ avec `order-source` : la page ne doit jamais pouvoir télécharger un fichier
  // que la porte refusera ensuite, ni l'inverse.
  const verdictObjet = jugerObjetSource(objets?.[0])
  if (!verdictObjet.ok) {
    if (verdictObjet.refus === 'absent') {
      logJson({ ...log, status: 'source_absente' })
      return json({ error: 'source_absente' }, 409, origin)
    }
    logJson({ ...log, status: `objet_${verdictObjet.refus}` })
    return json(
      { error: 'invalid_source', message: verdictObjet.message },
      statutHttpObjetSource(verdictObjet),
      origin,
    )
  }

  // ⚠️ `in` sur un objet répond `true` pour `constructor`, `toString`, `valueOf`… — les clés du
  // prototype. `docType: 'constructor'` faisait donc de `spec` un `Object`, et `flattenRubrics`
  // levait une `TypeError` non capturée : 500 SANS en-tête CORS, job perdu. Liste blanche fermée.
  const docType = (DOC_TYPES_VENDABLES.has(job.doc_type) ? job.doc_type : 'rcp') as ConformityDocType
  const spec = CONFORMITY_SPECS[docType]

  // ── La porte ──────────────────────────────────────────────────────────────────────────────────
  const verdict = jugerRecevabilite(controlText, sourceKind, spec)
  if (!verdict.recevable) {
    // Le statut passe à `gated_out` — un état À PART, jamais `failed` : la commande est intacte,
    // l'acheteur peut redéposer, et le tableau de bord ne doit pas compter cela comme une panne.
    //
    // ⚠️ `.in(ETATS_DEPOSABLES)` : on ne rétrograde JAMAIS une commande déjà lancée. Sans cette
    // condition, un refus concurrent d'un traitement en cours le rouvrirait au dépôt.
    await supabase
      .from('orders')
      .update({ status: 'gated_out' })
      .eq('id', commande.id)
      .in('status', ETATS_DEPOSABLES)
    const restants = Math.max(0, MAX_DEPOTS - commande.depositsUsed)
    const label = (DOC_LABELS[docType] ?? DOC_LABELS.rcp)[commande.lang]
    logJson({ ...log, status: 'refuse', trouves: verdict.trouves.length, cherches: verdict.cherches })
    return json(
      {
        status: 'refused',
        // ⚠️ La formulation compte autant que le verdict : elle dit que RIEN n'a été débité.
        message: messageRefus(commande.lang, label, restants),
        depositsLeft: restants,
        reperesTrouves: verdict.trouves.length,
      },
      200,
      origin,
    )
  }

  // ── Le lancement : c'est l'ÉCRITURE qui fait autorité, pas la lecture qui la précède ───────────
  //
  // ⚠️ Le verrou est posé sur le JOB (`started_at is null`), pas sur la commande, pour deux raisons.
  // D'abord parce qu'entre le `select` et l'`update` une autre requête a pu passer : seule une
  // écriture conditionnelle tranche. Ensuite parce qu'une commande `up3` porte TROIS documents —
  // un verrou sur la commande aurait rendu les documents 2 et 3 impossibles à traiter, la commande
  // étant déjà `running` depuis le premier.
  //
  // ⚠️ MAIS LE CAS SUR LE JOB NE SUFFIT PAS, et c'est un défaut trouvé en revue de branche : il
  // empêche de relancer LE MÊME job, jamais de lancer DEUX jobs de la même commande. Un acheteur
  // qui redépose en crée un second ; deux portes concurrentes — deux onglets — passaient la lecture
  // `dejaLance` toutes les deux, puis chacune sa propre CAS. Deux fois 34 rubriques, ~4 $ sur une
  // commande à 29 €, dont la moitié invisible puisque `order-status` ne lit que le job le plus
  // récent. La borne est désormais en BASE, à la seule granularité qui ne casse pas le bundle :
  // un index unique partiel sur (order_id, doc_type) parmi les jobs en vol (migration `0087`).
  // Une seconde porte se fait refuser par Postgres, pas par une lecture qu'on espère à jour.
  const rubriques = flattenRubrics(spec)
  const lignes = rubriques.map((r) => ({
    job_id: job.id,
    section_id: r.id,
    phase: 'conformity' as const,
  }))

  const { data: pris, error: casErr } = await supabase
    .from('upgrade_jobs')
    .update({
      // Déclarée par le navigateur, jamais devinée ici : elle commande la tolérance du contrôle
      // d'ancrage ET l'encart « votre document est un scan » du rapport.
      source_kind: sourceKind,
      // Le corpus SURVIT à cette invocation : le worker en a besoin à chaque vague pour vérifier en
      // code les citations et l'ancrage des chiffres. Le re-dériver du PDF coûterait pdf.js et, sur
      // un scan, une reconnaissance complète — à chaque vague, alors que le navigateur l'a déjà
      // faite une fois. C'est la coupure du plan : le navigateur calcule, le serveur attend.
      control_text: controlText,
      sections_total: lignes.length,
      phase: 'conformity',
      started_at: new Date().toISOString(),
    })
    .eq('id', job.id)
    .is('started_at', null)
    .select('id')
  if (casErr) {
    // ⚠️ `23505` n'est PAS une panne : c'est l'index `upgrade_jobs_un_en_vol_par_document` qui vient
    // de refuser un second traitement en vol pour le même document. C'est le cas nominal de deux
    // onglets, et il se répond comme tel — surtout pas en 503, qui inviterait à réessayer.
    if ((casErr as { code?: string }).code === '23505') {
      logJson({ ...log, status: 'lancement_concurrent_base' })
      return json({ status: 'already_running' }, 409, origin)
    }
    logJson({ ...log, status: 'job_maj_error' })
    return json({ error: 'db' }, 503, origin)
  }
  if (!pris?.length) {
    // Un autre appel a lancé ce job entre-temps. 409, et surtout AUCUNE rubrique créée.
    logJson({ ...log, status: 'lancement_concurrent' })
    return json({ status: 'already_running' }, 409, origin)
  }

  // Les rubriques ne sont mises en file qu'APRÈS la prise du verrou : c'est ce qui garantit qu'un
  // second appel ne peut pas en semer une deuxième série. Seule la phase de CONFORMITÉ est créée —
  // les rubriques de traduction dépendent de ce que la conformité produit, et celles de la revue de
  // ce que la traduction produit : les créer d'avance figerait une liste non encore déterminée.
  //
  // `upsert` idempotent sur (job_id, phase, section_id) : un rejeu après coupure réseau ne crée pas
  // de doublon et ne réinitialise pas ce qui aurait déjà tourné.
  const { error: secErr } = await supabase
    .from('upgrade_sections')
    .upsert(lignes, { onConflict: 'job_id,phase,section_id', ignoreDuplicates: true })
  if (secErr) {
    // Le verrou est pris mais la file est vide : le job ne partira pas tout seul. On le rend
    // relançable plutôt que de le laisser en carafe — c'est le seul endroit où rendre `started_at`
    // est correct, puisque aucune rubrique n'existe encore.
    await supabase.from('upgrade_jobs').update({ started_at: null }).eq('id', job.id)
    logJson({ ...log, status: 'sections_error' })
    return json({ error: 'db' }, 503, origin)
  }

  // Le statut de la COMMANDE suit, et n'est qu'un reflet pour l'affichage : la vérité du travail
  // vit sur le job. Son échec ne doit donc pas faire échouer un lancement déjà acquis.
  await supabase
    .from('orders')
    .update({ status: 'running' })
    .eq('id', commande.id)
    .in('status', ETATS_DEPOSABLES)

  logJson({
    ...log,
    status: 'lance',
    sections: lignes.length,
    kind: sourceKind,
    essai: commande.essai,
  })
  return json({ status: 'started', sectionsTotal: lignes.length, jobId: job.id }, 200, origin)
})
