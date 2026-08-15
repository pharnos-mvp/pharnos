// Edge Function `chariow-pulse` — le webhook qui fait NAÎTRE la commande, côté serveur (U1).
//
// C'est la pièce qui ferme le trou de sécurité n°1 du chantier : aujourd'hui `?paiement=ok` dans
// l'URL tient lieu de preuve de règlement. Sans effet tant que la confirmation n'ouvre qu'un
// `mailto:` — mais le jour où elle déclenche le moteur, c'est 1,96 $ d'IA offerts au prix d'un
// paramètre d'URL. À partir d'ici, le retour de paiement n'AFFICHE qu'un état déjà établi.
//
// Contrat de sécurité :
//   • `verify_jwt = false` : Chariow n'a pas de compte chez nous. Et **aucun en-tête CORS** — ce
//     n'est pas une surface navigateur, c'est du serveur à serveur. Une page web n'a rien à y faire.
//   • **La SIGNATURE d'abord (C3)** : chaque Pulse porte `x-chariow-signature: sha256=<hex>` —
//     HMAC-SHA256 du corps BRUT, clé = le secret `whsec_…` propre au Pulse (contrat complet :
//     chariow.dev, « Pulse Security »). Vérifiée en temps constant AVANT toute dépense (base, API).
//     Secret non posé → mode OBSERVATION : on journalise sans refuser — l'absence de configuration
//     ne doit pas suspendre les ventes, et la re-vérification reste l'autorité.
//   • **Le Pulse n'est toujours pas cru sur son CONTENU.** Signé ou pas, on ne lui accorde qu'un
//     IDENTIFIANT de vente à aller vérifier : produit, montant, acheteur viennent de
//     `GET /v1/sales/{id}`, jamais du corps reçu. La signature ferme le martèlement ; la
//     re-vérification ferme le mensonge.
//   • **Idempotence par la base** : `orders.chariow_sale_id` est `unique`. Chariow rejoue cinq fois
//     (1 min → 24 h) ; le deuxième Pulse ne crée rien.
//   • Écriture en service-role uniquement — les trois tables sont en RLS sans policy.
//   • Logs JSON **sans PII** : jamais l'adresse ni le nom de l'acheteur.
import { createClient } from 'npm:@supabase/supabase-js@2'

import { logJson, newReqId } from '../_shared/log.ts'
import { faireNaitreCommande } from '../_shared/order-birth.ts'
import { lirePulse, lireVente, PULSE_EVENT_VENTE } from '../_shared/orders-core.ts'
import { signaturePulseValide } from '../_shared/pulse-signature.ts'

const MAX_BODY_BYTES = 16 * 1024
const CHARIOW_TIMEOUT_MS = 15_000
const CHARIOW_SALES = 'https://api.chariow.com/v1/sales'
// Un webhook public reste une surface : on borne le débit GLOBAL. Le but n'est pas d'arrêter
// Chariow (qui n'en approchera jamais) mais d'empêcher un tiers de nous faire marteler l'API
// Chariow avec des identifiants inventés.
const RL_WINDOW_S = 300
const RL_MAX_HITS = 120
/** Par IP : Chariow rejoue au plus 5 fois par vente — 30 par fenêtre laisse dix ventes d'avance. */
const RL_IP_MAX_HITS = 30

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

/**
 * Acquittement. **200 sur tout ce qui est une DÉCISION** (événement ignoré, produit hors
 * périmètre, vente non réglée) : rejouer n'y changerait rien, et répondre en erreur ferait
 * revenir Chariow cinq fois pour le même verdict. Les 5xx sont réservés au TRANSPORT — là, un
 * rejeu a un sens.
 */
const acquitte = (raison: string) => json({ ok: true, ignored: raison }, 200)

Deno.serve(async (req) => {
  const log = { fn: 'chariow-pulse', reqId: newReqId() }
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  // ⚠️ Refuser AVANT de lire, comme les quatre autres surfaces d'après-paiement : `await req.text()`
  // puis mesurer, c'est avoir déjà tout mis en mémoire — et celle-ci est la surface la plus exposée
  // du lot, appelable par quiconque connaît l'URL. Filet : `content-length` peut manquer (transfert
  // par morceaux), et `.length` compte des unités UTF-16 donc MINORE les octets — marge de 2.
  const annonce = Number(req.headers.get('content-length') ?? '0')
  if (Number.isFinite(annonce) && annonce > MAX_BODY_BYTES) {
    // La taille dans le log : le corps réel porte `sale`+`store`+`product`+`customer` — bien plus
    // que le `{event, sale_id}` supposé à l'origine. Si un jour un Pulse dépasse le plafond, il
    // faut pouvoir dire DE COMBIEN sans rejouer la livraison.
    logJson({ ...log, status: 'body_too_large', octets: annonce })
    return json({ error: 'payload_too_large' }, 413)
  }
  // ⚠️ Les OCTETS, pas le texte : la signature couvre le corps BRUT tel que reçu. Décoder puis
  // ré-encoder pour le HMAC introduirait la seule classe d'écart (normalisation UTF-8) que le
  // contrat interdit explicitement.
  const octets = new Uint8Array(await req.arrayBuffer())
  if (octets.byteLength > MAX_BODY_BYTES) {
    logJson({ ...log, status: 'body_too_large', octets: octets.byteLength })
    return json({ error: 'payload_too_large' }, 413)
  }

  // ── C3 : la signature, AVANT toute dépense ────────────────────────────────────────────────────
  // Le contrôle est pur CPU : il tombe avant la base, avant la limitation de débit, avant l'appel
  // Chariow. Un tiers qui poste des corps forgés est arrêté au premier calcul.
  const whsec = Deno.env.get('CHARIOW_PULSE_SECRET')
  const recue = req.headers.get('x-chariow-signature') ?? ''
  if (whsec) {
    if (!(await signaturePulseValide(whsec, octets, recue))) {
      logJson({ ...log, status: 'signature_refusee' })
      return json({ error: 'invalid_signature' }, 401)
    }
  } else if (Deno.env.get('CHARIOW_PULSE_OBSERVE') === '1') {
    // Mode OBSERVATION — EXPLICITE, jamais un défaut : `CHARIOW_PULSE_OBSERVE=1` est posé le
    // temps que le secret soit copié depuis la console Chariow. Un secret PERDU dans un déploiement
    // ne rouvre pas la porte en silence : sans lui ET sans le drapeau, on ferme (branche suivante).
    logJson({ ...log, status: 'signature_non_verifiee', portee: recue ? 'presente' : 'absente' })
  } else {
    // Ni secret ni observation déclarée : porte FERMÉE. L'absence de configuration ne doit jamais
    // ouvrir — même règle que le secret cron de `job-tick`. La réconciliation (C1), authentifiée
    // par Vault, continue de faire naître les ventes pendant qu'on répare la configuration.
    logJson({ ...log, status: 'signature_non_configuree' })
    return json({ error: 'not_configured' }, 503)
  }

  let corps: unknown
  try {
    corps = JSON.parse(new TextDecoder().decode(octets))
  } catch {
    logJson({ ...log, status: 'bad_json' })
    return acquitte('json_illisible')
  }

  const lu = lirePulse(corps)
  if ('erreur' in lu) {
    logJson({ ...log, status: 'pulse_illisible', raison: lu.erreur })
    return acquitte(lu.erreur)
  }
  if (lu.event !== PULSE_EVENT_VENTE) {
    // Le magasin émet d'autres événements (remboursement, litige) : les ignorer explicitement vaut
    // mieux que de les laisser tomber dans un cas par défaut silencieux.
    logJson({ ...log, status: 'event_ignore', event: lu.event })
    return acquitte(`événement ${lu.event}`)
  }

  const apiKey = Deno.env.get('CHARIOW_API_KEY')
  if (!apiKey) {
    // Panne de CONFIGURATION, pas de décision : on veut le rejeu de Chariow une fois le secret posé.
    logJson({ ...log, status: 'no_api_key' })
    return json({ error: 'not_configured' }, 503)
  }

  // ── La limitation de débit, AVANT l'appel qu'elle protège ─────────────────────────────────────
  // ⚠️ Elle était posée APRÈS la re-vérification — c'est-à-dire après coup. Son propre commentaire
  // disait ce que le code ne faisait pas : sans elle ICI, quiconque connaît l'URL fait émettre par
  // notre serveur autant de `GET /v1/sales/<inventé>` PORTEURS DE NOTRE CLÉ API qu'il ouvre de
  // requêtes (15 s de timeout chacune). Chariow limite alors notre clé, la re-vérification des
  // VRAIES ventes tombe en 503, et les commandes n'existent qu'au rythme des rejeux — jusqu'à 24 h.
  // Un seau par IP en plus du global, comme les quatre autres surfaces ; fail-closed.
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  )
  const ip = req.headers.get('cf-connecting-ip')?.trim() ||
    (req.headers.get('x-forwarded-for') ?? '').split(',').map((x) => x.trim()).filter(Boolean)
      .pop() ||
    'unknown'
  for (
    const [bucket, max] of [
      [`pulse:ip:${ip}`, RL_IP_MAX_HITS],
      ['pulse:all', RL_MAX_HITS],
    ] as const
  ) {
    const { data: hits, error: rlErr } = await supabase.rpc('share_hit', {
      p_bucket: bucket,
      p_window_seconds: RL_WINDOW_S,
    })
    if (rlErr || typeof hits !== 'number' || hits > max) {
      logJson({ ...log, status: 'rate_limited', scope: bucket === 'pulse:all' ? 'all' : 'ip' })
      // 503 et non 200 : un rejeu APRÈS la fenêtre est exactement ce qu'on veut.
      return json({ error: 'rate_limited' }, 503)
    }
  }

  // ── La re-vérification : c'est ELLE qui authentifie la vente ──────────────────────────────────
  let vente: unknown
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), CHARIOW_TIMEOUT_MS)
  try {
    const res = await fetch(`${CHARIOW_SALES}/${encodeURIComponent(lu.saleId)}`, {
      headers: { Authorization: `Bearer ${apiKey}`, accept: 'application/json' },
      signal: ctrl.signal,
    })
    if (res.status === 404 || res.status === 410) {
      // Vente inconnue de Chariow : très probablement un Pulse forgé. Rien à rejouer.
      logJson({ ...log, status: 'vente_inconnue', http: res.status })
      return acquitte('vente inconnue')
    }
    if (!res.ok) {
      logJson({ ...log, status: 'chariow_http', http: res.status })
      return json({ error: 'upstream' }, 503)
    }
    vente = await res.json()
  } catch (e) {
    const aborted = (e as Error)?.name === 'AbortError'
    logJson({ ...log, status: aborted ? 'chariow_timeout' : 'chariow_error' })
    return json({ error: 'upstream' }, 503)
  } finally {
    clearTimeout(timer)
  }

  const v = lireVente(vente)
  if ('erreur' in v) {
    // Produit hors périmètre (les packs CTD Builder passent par le MÊME magasin), vente non réglée,
    // contact absent : trois décisions, aucune ne se rejoue.
    logJson({ ...log, status: 'vente_ecartee', raison: v.erreur })
    return acquitte(v.erreur)
  }

  // ── Naissance de la commande — le chemin PARTAGÉ avec la réconciliation (C1) ──────────────────
  const naissance = await faireNaitreCommande(supabase, v, log)
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
    // Jamais l'adresse : seulement si l'envoi a abouti.
    mail: naissance.mail,
    ref: v.ref ? v.ref.slice(0, 8) : null,
    // La taille RÉELLE des Pulses en prod : c'est elle qui dira si le plafond de 16 Ko a de la
    // marge, plutôt qu'une hypothèse de plus sur un corps qu'on a déjà mal deviné une fois.
    octets: octets.byteLength,
  })
  // 200 même si l'e-mail a échoué : la COMMANDE existe, et c'est elle qui fait foi. Un rejeu
  // Chariow retentera l'envoi grâce à `notified_at` resté nul.
  return json({ ok: true }, 200)
})
