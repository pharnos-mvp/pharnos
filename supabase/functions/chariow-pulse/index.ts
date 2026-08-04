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
//   • **Le Pulse n'est pas cru.** Les Pulses Chariow ne portent AUCUN secret de signature (vérifié
//     en console le 2026-07-28). On ne lui accorde qu'une chose : un IDENTIFIANT de vente à aller
//     vérifier. Produit, montant, acheteur viennent de `GET /v1/sales/{id}`, jamais du corps reçu.
//   • **Idempotence par la base** : `orders.chariow_sale_id` est `unique`. Chariow rejoue cinq fois
//     (1 min → 24 h) ; le deuxième Pulse ne crée rien.
//   • Écriture en service-role uniquement — les trois tables sont en RLS sans policy.
//   • Logs JSON **sans PII** : jamais l'adresse ni le nom de l'acheteur.
import { createClient } from 'npm:@supabase/supabase-js@2'

import { logJson, newReqId } from '../_shared/log.ts'
import {
  deliveryExpiryFrom,
  deliveryTokenHash,
  lirePulse,
  lireVente,
  newDeliveryToken,
  PULSE_EVENT_VENTE,
} from '../_shared/orders-core.ts'

const MAX_BODY_BYTES = 16 * 1024
const CHARIOW_TIMEOUT_MS = 15_000
const CHARIOW_SALES = 'https://api.chariow.com/v1/sales'
/** L'après-paiement vit dans `web/`, sur le patron de page publique par jeton (§2.1). */
const LIEN_LIVRAISON = 'https://app.pharnos.com/u'
// Un webhook public reste une surface : on borne le débit GLOBAL. Le but n'est pas d'arrêter
// Chariow (qui n'en approchera jamais) mais d'empêcher un tiers de nous faire marteler l'API
// Chariow avec des identifiants inventés.
const RL_WINDOW_S = 300
const RL_MAX_HITS = 120

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

  const brut = await req.text()
  if (brut.length > MAX_BODY_BYTES) {
    logJson({ ...log, status: 'body_too_large' })
    return json({ error: 'payload_too_large' }, 413)
  }

  let corps: unknown
  try {
    corps = JSON.parse(brut)
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

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  )

  const { data: hits, error: rlErr } = await supabase.rpc('share_hit', {
    p_bucket: 'pulse:all',
    p_window_seconds: RL_WINDOW_S,
  })
  if (rlErr || typeof hits !== 'number' || hits > RL_MAX_HITS) {
    logJson({ ...log, status: 'rate_limited' })
    // 503 et non 200 : un rejeu APRÈS la fenêtre est exactement ce qu'on veut.
    return json({ error: 'rate_limited' }, 503)
  }

  // ── Naissance de la commande, idempotente par la contrainte `unique` ──────────────────────────
  const maintenant = new Date()
  const expire = deliveryExpiryFrom(maintenant).toISOString()
  const { data: cree, error: insErr } = await supabase
    .from('orders')
    .insert({
      ref: v.ref,
      chariow_sale_id: v.saleId,
      offre: v.offre,
      essai: v.essai,
      amount_minor: v.amountMinor,
      currency: v.currency,
      email: v.email,
      first_name: v.firstName,
      last_name: v.lastName,
      lang: v.lang,
      delivery_expires_at: expire,
    })
    .select('id')
    .maybeSingle()

  let orderId: string | null = cree?.id ?? null

  if (insErr) {
    // 23505 = violation d'unicité : c'est le REJEU, le cas nominal du webhook. Tout autre code est
    // une vraie panne d'écriture, et Chariow doit revenir.
    if (insErr.code !== '23505') {
      logJson({ ...log, status: 'insert_error', code: insErr.code })
      return json({ error: 'db' }, 503)
    }
    const { data: deja } = await supabase
      .from('orders')
      .select('id, notified_at')
      .eq('chariow_sale_id', v.saleId)
      .maybeSingle()
    if (!deja) {
      logJson({ ...log, status: 'conflit_sans_ligne' })
      return json({ error: 'db' }, 503)
    }
    if (deja.notified_at) {
      logJson({ ...log, status: 'rejeu', essai: v.essai })
      return json({ ok: true, replay: true }, 200)
    }
    // La commande existe mais son e-mail n'est JAMAIS parti. On en émet simplement un NOUVEAU :
    // les jetons sont multiples par conception (`order_tokens`), donc rien n'est invalidé et il
    // n'y a aucune course à assumer. C'est ce qui rend l'e-mail n°1 fiable à travers les cinq
    // rejeux de Chariow.
    orderId = deja.id
  }

  if (!orderId) {
    logJson({ ...log, status: 'sans_order_id' })
    return json({ error: 'db' }, 503)
  }

  const jeton = newDeliveryToken()
  const { error: tokErr } = await supabase.from('order_tokens').insert({
    token_hash: await deliveryTokenHash(jeton),
    order_id: orderId,
    expires_at: expire,
    source: 'email',
  })
  if (tokErr) {
    // Sans jeton, l'e-mail n°1 ne mènerait nulle part : mieux vaut le rejeu de Chariow qu'un
    // message porteur d'un lien mort.
    logJson({ ...log, status: 'token_error' })
    return json({ error: 'db' }, 503)
  }

  // ── E-mail n°1 : le FILET du parcours ─────────────────────────────────────────────────────────
  // Ce n'est pas une courtoisie. C'est le seul chemin d'accès de l'acheteur vers son livrable s'il
  // ferme l'onglet avant la redirection — cas explicitement prévu par le plan (§2.3, étape 4).
  const lien = `${LIEN_LIVRAISON}/${jeton}`
  const envoye = await envoyerEmail(v.email, v.firstName, lien, v.lang, v.essai)
  if (envoye && orderId) {
    await supabase.from('orders').update({ notified_at: new Date().toISOString() }).eq('id', orderId)
  }

  logJson({
    ...log,
    status: 'ok',
    offre: v.offre,
    essai: v.essai,
    // Jamais l'adresse : seulement si l'envoi a abouti.
    mail: envoye ? 'sent' : 'failed',
    ref: v.ref ? v.ref.slice(0, 8) : null,
  })
  // 200 même si l'e-mail a échoué : la COMMANDE existe, et c'est elle qui fait foi. Un rejeu
  // Chariow retentera l'envoi grâce à `notified_at` resté nul.
  return json({ ok: true }, 200)
})

const escapeHtml = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string,
  )

async function envoyerEmail(
  to: string,
  prenom: string | null,
  lien: string,
  lang: 'fr' | 'en',
  essai: boolean,
): Promise<boolean> {
  const apiKey = Deno.env.get('RESEND_API_KEY')
  if (!apiKey) return false
  const from = Deno.env.get('EMAIL_FROM') ?? 'Pharnos <onboarding@resend.dev>'
  const en = lang === 'en'
  const bonjour = prenom ? `${en ? 'Hello' : 'Bonjour'} ${escapeHtml(prenom)},` : (en ? 'Hello,' : 'Bonjour,')
  const sujet = essai
    ? (en ? '[TEST] Your order is registered' : '[RECETTE] Votre commande est enregistrée')
    : (en ? 'Your order is registered — Pharnos' : 'Votre commande est enregistrée — Pharnos')

  const corps = en
    ? [
      `<p>${bonjour}</p>`,
      '<p>Your payment has been received and your order is registered. Everything happens on the secure page below — <strong>you can close this email and come back later</strong>: the link stays valid for 30 days.</p>',
      `<p><a href="${lien}" style="display:inline-block;background:#d29922;color:#20160a;font-weight:700;padding:12px 22px;border-radius:99px;text-decoration:none">Open my upgrade →</a></p>`,
      '<p>On that page you will upload your document, we check it is the right kind, and the analysis starts. <strong>You may close the tab while it runs</strong> — we email you again as soon as your files are ready.</p>',
      `<p style="color:#6b7280;font-size:12px">If the button does not work, copy this address into your browser:<br>${lien}</p>`,
    ].join('')
    : [
      `<p>${bonjour}</p>`,
      '<p>Votre règlement nous est bien parvenu et votre commande est enregistrée. Tout se passe sur la page sécurisée ci-dessous — <strong>vous pouvez fermer cet e-mail et y revenir plus tard</strong> : le lien reste valable 30 jours.</p>',
      `<p><a href="${lien}" style="display:inline-block;background:#d29922;color:#20160a;font-weight:700;padding:12px 22px;border-radius:99px;text-decoration:none">Ouvrir ma mise à niveau →</a></p>`,
      '<p>Vous y déposerez votre document, nous vérifions qu’il s’agit bien du bon type, puis l’analyse démarre. <strong>Vous pouvez fermer l’onglet pendant le traitement</strong> — nous vous réécrivons dès que vos fichiers sont prêts.</p>',
      `<p style="color:#6b7280;font-size:12px">Si le bouton ne fonctionne pas, recopiez cette adresse dans votre navigateur :<br>${lien}</p>`,
    ].join('')

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from, to: [to], subject: sujet, html: corps }),
    })
    return res.ok
  } catch {
    return false
  }
}
