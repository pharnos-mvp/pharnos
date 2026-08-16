// La NAISSANCE d'une commande — insert idempotent, jeton de livraison, e-mail n°1 (LOT C).
//
// Extraite de `chariow-pulse` pour que la RÉCONCILIATION ACTIVE (C1) emprunte EXACTEMENT le même
// chemin : deux implémentations de la naissance finiraient par diverger sur l'idempotence ou sur
// le rejeu d'e-mail — et c'est précisément le genre d'écart qui ne se voit qu'à la vente réelle.
//
// ⚠️ L'appelant fournit une vente DÉJÀ VÉRIFIÉE (`lireVente` sur `GET /v1/sales/{id}`) : ce module
// ne parle jamais à Chariow. La confiance vient de la re-vérification, jamais du canal d'arrivée
// (Pulse signé ou balayage cron — même bar).
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'

import { logJson } from './log.ts'
import {
  deliveryExpiryFrom,
  deliveryTokenHash,
  newDeliveryToken,
  type VenteVerifiee,
} from './orders-core.ts'

/** L'après-paiement vit dans `web/`, sur le patron de page publique par jeton (§2.1). */
const LIEN_LIVRAISON = 'https://app.pharnos.com/u'

export type NaissanceResultat =
  /** Commande créée (ou e-mail renvoyé sur une commande jamais notifiée). */
  | {
    statut: 'nee'
    orderId: string
    mail: 'sent' | 'failed'
    renaissance: boolean
    /**
     * La référence RÉELLEMENT posée sur la commande — `null` si elle a été abandonnée (déjà prise
     * par une autre vente). L'appelant journalise CE champ, jamais celui qu'il avait l'intention
     * d'écrire : le log est le seul témoin du run, il ne doit pas affirmer l'inverse de la base.
     */
    refPosee: string | null
  }
  /** La commande existe et son e-mail est parti : il n'y a rien à faire. */
  | { statut: 'rejeu' }
  /** Panne d'écriture — l'appelant décide du rejeu (503 au webhook, prochain tour au cron). */
  | { statut: 'erreur' }

/**
 * Fait naître la commande d'une vente vérifiée. Idempotente par `orders.chariow_sale_id UNIQUE` :
 * l'appeler deux fois — webhook PUIS réconciliation, ou cinq rejeux Chariow — ne crée rien deux
 * fois, et retente l'e-mail n°1 tant que `notified_at` est nul.
 */
export async function faireNaitreCommande(
  sb: SupabaseClient,
  v: VenteVerifiee,
  log: Record<string, unknown>,
): Promise<NaissanceResultat> {
  const maintenant = new Date()
  const expire = deliveryExpiryFrom(maintenant).toISOString()
  const { data: cree, error: insErr } = await sb
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
  let renaissance = false

  if (insErr) {
    // 23505 = violation d'unicité : le REJEU, cas nominal du webhook comme du balayage. Tout autre
    // code est une vraie panne d'écriture.
    if (insErr.code !== '23505') {
      logJson({ ...log, status: 'insert_error', code: insErr.code })
      return { statut: 'erreur' }
    }
    // ⚠️ DEUX contraintes uniques sur cette table : `chariow_sale_id` ET `ref` (`orders_ref_key`,
    // posée par 0083 — 0091 n'a retiré que le NOT NULL). Tant que le webhook écrivait toujours
    // `ref: null`, seule la première pouvait sauter ; depuis que la référence voyage, la seconde
    // est armée.
    //
    // Laquelle a cédé ? On ne le DEVINE pas dans le texte de l'erreur — un format PostgREST qui
    // change, une contrainte renommée, et le rail redeviendrait muet en silence. On le CONSTATE :
    //   • une ligne porte déjà cette vente  ⇒ le conflit venait de `chariow_sale_id` : rejeu nominal ;
    //   • aucune ligne                      ⇒ il venait de la RÉFÉRENCE : elle appartient à une
    //     autre commande, et on renaît SANS elle plutôt que de tuer une vente réglée (relire par
    //     `chariow_sale_id` ne trouverait rien, on rendrait 503, et Chariow rejouerait le même
    //     conflit cinq fois sur 24 h). Le pont est perdu, la commande ne l'est pas : l'e-mail n°1
    //     reste le chemin d'accès.
    //
    // L'ordre compte aussi pour le BRUIT : sur un rejeu Chariow ordinaire les DEUX contraintes
    // cèdent, et Postgres rapporte la première dans l'ordre des OID — celle de la référence.
    // Se fier au message aurait donc allumé une alarme « référence en conflit » à chaque rejeu
    // sain, et gaspillé un insert. La récursion est bornée à 2 par construction : `ref: null` ne
    // peut pas rejouer ce conflit, Postgres n'indexant pas les NULL dans une contrainte d'unicité.
    const { data: deja } = await sb
      .from('orders')
      .select('id, notified_at, ref')
      .eq('chariow_sale_id', v.saleId)
      .maybeSingle()
    if (!deja) {
      if (v.ref) {
        logJson({ ...log, status: 'ref_en_conflit' })
        return await faireNaitreCommande(sb, { ...v, ref: null }, log)
      }
      logJson({ ...log, status: 'conflit_sans_ligne' })
      return { statut: 'erreur' }
    }
    // ⚠️ REMPLIR, jamais écraser — et AVANT le retour « rejeu », sinon ce code serait mort dans le
    // seul cas qui le justifie. C'est la trajectoire du 14/08/2026 : le Pulse n'arrive pas, la
    // réconciliation fait naître la commande SANS référence (elle n'en a aucune), puis le Pulse
    // arrive enfin — et sa référence était jetée. La salle d'attente restait aveugle sur le chemin
    // même où le défaut avait coûté la vente. Le `.is('ref', null)` rend l'opération sûre : elle ne
    // peut structurellement pas déplacer le pont d'une commande qui en a déjà un.
    if (v.ref && !deja.ref) {
      // `.select('id')` n'est pas décoratif : sans lui, PostgREST rend 204 qu'il ait touché une
      // ligne ou zéro, et on annoncerait « posée » après une course perdue.
      const { data: touchees, error: majErr } = await sb
        .from('orders')
        .update({ ref: v.ref })
        .eq('id', deja.id)
        .is('ref', null)
        .select('id')
      // Échec = cette référence appartient à une autre commande. On se tait : la commande vit.
      if (majErr) logJson({ ...log, status: 'ref_backfill_refuse', code: majErr.code })
      else logJson({ ...log, status: (touchees?.length ?? 0) > 0 ? 'ref_backfill' : 'ref_backfill_neant' })
    }
    if (deja.notified_at) return { statut: 'rejeu' }
    // La commande existe mais son e-mail n'est JAMAIS parti. On en émet simplement un NOUVEAU :
    // les jetons sont multiples par conception (`order_tokens`), rien n'est invalidé.
    orderId = deja.id
    renaissance = true
  }

  if (!orderId) {
    logJson({ ...log, status: 'sans_order_id' })
    return { statut: 'erreur' }
  }

  const jeton = newDeliveryToken()
  const { error: tokErr } = await sb.from('order_tokens').insert({
    token_hash: await deliveryTokenHash(jeton),
    order_id: orderId,
    expires_at: expire,
    source: 'email',
  })
  if (tokErr) {
    // Sans jeton, l'e-mail n°1 ne mènerait nulle part : mieux vaut un rejeu qu'un lien mort.
    logJson({ ...log, status: 'token_error' })
    return { statut: 'erreur' }
  }

  // ── E-mail n°1 : le FILET du parcours ─────────────────────────────────────────────────────────
  // Ce n'est pas une courtoisie. C'est le seul chemin d'accès de l'acheteur vers son livrable s'il
  // ferme l'onglet avant la redirection — cas explicitement prévu par le plan (§2.3, étape 4).
  const lien = `${LIEN_LIVRAISON}/${jeton}`
  const envoye = await envoyerEmailCommande(v, lien)
  if (envoye) {
    await sb.from('orders').update({ notified_at: new Date().toISOString() }).eq('id', orderId)
  }
  return {
    statut: 'nee',
    orderId,
    mail: envoye ? 'sent' : 'failed',
    renaissance,
    // Dans la branche récursive, `v.ref` vaut déjà `null` : la vérité remonte d'elle-même.
    refPosee: v.ref,
  }
}

const escapeHtml = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string,
  )

/**
 * Identité légale portée par le REÇU — AASK SARL, la structure derrière Pharnos.
 *
 * ⚠️ Ce n'est pas de la décoration : l'attestation d'immatriculation exige que l'IFU figure
 * « sur toutes les quittances, factures ou lettres » émises. Demande CEO du 2026-08-14, après
 * une première vente réelle passée sans aucun reçu.
 */
const RECU_VENDEUR = {
  nom: 'Pharnos — un service de AASK SARL',
  rccm: 'RCCM Cotonou N° RB/COT/21 B 31197',
  ifu: 'IFU 3202113643386',
  adresse: 'Zogbohouè, 03 BP 4245 Jéricho, Cotonou, Bénin',
  contact: 'contact@pharnos.com',
}

/** Libellés facturables des offres — celui du reçu, pas celui du catalogue technique. */
const RECU_LIBELLES: Record<string, { fr: string; en: string }> = {
  up1: { fr: 'Mise à niveau documentaire — 1 document', en: 'Document upgrade — 1 document' },
  up3: {
    fr: 'Mise à niveau documentaire — les trois documents',
    en: 'Document upgrade — all three documents',
  },
}

/** Bloc reçu de l'e-mail n°1 — montant, méthode, vendeur, et la facture officielle si la vente
 *  en porte une. Tout vient de la vente VÉRIFIÉE ; un champ absent se tait au lieu de mentir. */
function blocRecu(v: VenteVerifiee): string {
  const en = v.lang === 'en'
  const lignes: string[] = []
  const libelle = RECU_LIBELLES[v.offre]?.[v.lang] ?? v.offre
  const montant = v.amountMinor !== null
    ? `${v.amountMinor.toLocaleString(en ? 'en-US' : 'fr-FR')} ${escapeHtml(v.currency ?? 'FCFA')}`
    : null
  lignes.push(
    `<tr><td style="padding:2px 12px 2px 0;color:#6b7280">${en ? 'Order' : 'Commande'}</td><td>${escapeHtml(libelle)}</td></tr>`,
  )
  if (montant) {
    lignes.push(
      `<tr><td style="padding:2px 12px 2px 0;color:#6b7280">${en ? 'Amount paid' : 'Montant réglé'}</td><td><strong>${montant}</strong></td></tr>`,
    )
  }
  if (v.paymentMethod) {
    lignes.push(
      `<tr><td style="padding:2px 12px 2px 0;color:#6b7280">${en ? 'Payment method' : 'Moyen de paiement'}</td><td>${escapeHtml(v.paymentMethod)}</td></tr>`,
    )
  }
  lignes.push(
    `<tr><td style="padding:2px 12px 2px 0;color:#6b7280">${en ? 'Reference' : 'Référence'}</td><td>${escapeHtml(v.saleId)}</td></tr>`,
  )
  // ⚠️ Le relevé bancaire ne dira ni « Pharnos » ni « Chariow » : le processeur débite sous SON
  // libellé. Le dire ICI évite la contestation de bonne foi — et le litige qui va avec (C5).
  const releve = `<tr><td style="padding:2px 12px 2px 0;color:#6b7280">${
    en ? 'On your statement' : 'Sur votre relevé'
  }</td><td>${en ? 'the charge appears as “MiMo Global”' : 'le débit apparaît sous « MiMo Global »'}</td></tr>`
  lignes.push(releve)
  // La facture Chariow expire en ~1 h 30 (URL signée) : le lien direct sert tout de suite, la
  // PAGE DE SUIVI reste le chemin durable (`order-invoice` re-signe à la volée — C5).
  const facture = v.invoiceUrl
    ? `<p style="margin:8px 0 0"><a href="${escapeHtml(v.invoiceUrl)}" style="color:#1d4ed8">${
      en ? 'Download the official invoice (PDF)' : 'Télécharger la facture officielle (PDF)'
    }</a><br><span style="color:#6b7280;font-size:11px">${
      en
        ? 'This link expires after a few hours — the invoice stays available from your tracking page.'
        : 'Ce lien expire après quelques heures — la facture reste téléchargeable depuis votre page de suivi.'
    }</span></p>`
    : `<p style="margin:8px 0 0;color:#6b7280;font-size:11px">${
      en
        ? 'Your official invoice stays available from your tracking page.'
        : 'Votre facture officielle reste téléchargeable depuis votre page de suivi.'
    }</p>`
  return [
    `<div style="margin-top:20px;padding:14px 16px;border:1px solid #e5e7eb;border-radius:10px;font-size:13px">`,
    `<p style="margin:0 0 8px;font-weight:700">${en ? 'Payment receipt' : 'Reçu de paiement'}</p>`,
    `<table style="border-collapse:collapse">${lignes.join('')}</table>`,
    facture,
    `<p style="margin:10px 0 0;color:#6b7280;font-size:11px">${escapeHtml(RECU_VENDEUR.nom)} · ${
      escapeHtml(RECU_VENDEUR.rccm)
    } · ${escapeHtml(RECU_VENDEUR.ifu)}<br>${escapeHtml(RECU_VENDEUR.adresse)} · ${
      escapeHtml(RECU_VENDEUR.contact)
    }</p>`,
    `</div>`,
  ].join('')
}

/**
 * La version TEXTE BRUT de l'e-mail n°1 (C5). Les filtres notent mieux un multipart complet, et
 * un lecteur en texte seul — courant sur les webmails d'entreprise verrouillés — recevait un
 * message VIDE : le lien de livraison, c'est-à-dire l'accès à la commande, n'existait pas pour lui.
 */
export function texteEmailCommande(v: VenteVerifiee, lien: string): string {
  const en = v.lang === 'en'
  const bonjour = v.firstName ? `${en ? 'Hello' : 'Bonjour'} ${v.firstName},` : en ? 'Hello,' : 'Bonjour,'
  const libelle = RECU_LIBELLES[v.offre]?.[v.lang] ?? v.offre
  const montant = v.amountMinor !== null
    ? `${v.amountMinor.toLocaleString(en ? 'en-US' : 'fr-FR')} ${v.currency ?? 'FCFA'}`
    : null
  const lignes = en
    ? [
      bonjour,
      '',
      'Your payment has been received and your order is registered.',
      'Everything happens on your secure page — the link stays valid for 30 days:',
      '',
      lien,
      '',
      'On that page you upload your document, we check it is the right kind, and the analysis starts. You may close the tab while it runs.',
      '',
      'You may also receive a separate Chariow e-mail mentioning a “licence key”: it does not apply to this order — the link above is your only access.',
      '',
      '--- Payment receipt ---',
      `Order: ${libelle}`,
      ...(montant ? [`Amount paid: ${montant}`] : []),
      ...(v.paymentMethod ? [`Payment method: ${v.paymentMethod}`] : []),
      `Reference: ${v.saleId}`,
      'On your bank statement, the charge appears as “MiMo Global”.',
      'Your official invoice stays available from your tracking page.',
      '',
      `${RECU_VENDEUR.nom} · ${RECU_VENDEUR.rccm} · ${RECU_VENDEUR.ifu}`,
      `${RECU_VENDEUR.adresse} · ${RECU_VENDEUR.contact}`,
    ]
    : [
      bonjour,
      '',
      'Votre règlement nous est bien parvenu et votre commande est enregistrée.',
      'Tout se passe sur votre page sécurisée — le lien reste valable 30 jours :',
      '',
      lien,
      '',
      'Vous y déposerez votre document, nous vérifions qu’il s’agit bien du bon type, puis l’analyse démarre. Vous pouvez fermer l’onglet pendant le traitement.',
      '',
      'Il se peut que Chariow vous envoie séparément un e-mail mentionnant une « clé de licence » : elle ne concerne pas cette commande — le lien ci-dessus est votre seul accès.',
      '',
      '--- Reçu de paiement ---',
      `Commande : ${libelle}`,
      ...(montant ? [`Montant réglé : ${montant}`] : []),
      ...(v.paymentMethod ? [`Moyen de paiement : ${v.paymentMethod}`] : []),
      `Référence : ${v.saleId}`,
      'Sur votre relevé bancaire, le débit apparaît sous « MiMo Global ».',
      'Votre facture officielle reste téléchargeable depuis votre page de suivi.',
      '',
      `${RECU_VENDEUR.nom} · ${RECU_VENDEUR.rccm} · ${RECU_VENDEUR.ifu}`,
      `${RECU_VENDEUR.adresse} · ${RECU_VENDEUR.contact}`,
    ]
  return lignes.join('\n')
}

/** Le HTML de l'e-mail n°1 — exporté pour le test de dérive du gabarit (mêmes clauses que le texte). */
export function htmlEmailCommande(v: VenteVerifiee, lien: string): string {
  const en = v.lang === 'en'
  const bonjour = v.firstName
    ? `${en ? 'Hello' : 'Bonjour'} ${escapeHtml(v.firstName)},`
    : (en ? 'Hello,' : 'Bonjour,')
  const licence = en
    ? '<p style="color:#6b7280;font-size:12px">You may also receive a separate Chariow e-mail mentioning a “licence key”: it does not apply to this order — the link above is your only access.</p>'
    : '<p style="color:#6b7280;font-size:12px">Il se peut que Chariow vous envoie séparément un e-mail mentionnant une « clé de licence » : elle ne concerne pas cette commande — le lien ci-dessus est votre seul accès.</p>'
  return en
    ? [
      `<p>${bonjour}</p>`,
      '<p>Your payment has been received and your order is registered. Everything happens on the secure page below — <strong>you can close this email and come back later</strong>: the link stays valid for 30 days.</p>',
      `<p><a href="${lien}" style="display:inline-block;background:#d29922;color:#20160a;font-weight:700;padding:12px 22px;border-radius:99px;text-decoration:none">Open my upgrade →</a></p>`,
      '<p>On that page you will upload your document, we check it is the right kind, and the analysis starts. <strong>You may close the tab while it runs</strong> — come back to this link whenever you like, it stays valid for 30 days.</p>',
      `<p style="color:#6b7280;font-size:12px">If the button does not work, copy this address into your browser:<br>${lien}</p>`,
      licence,
      blocRecu(v),
    ].join('')
    : [
      `<p>${bonjour}</p>`,
      '<p>Votre règlement nous est bien parvenu et votre commande est enregistrée. Tout se passe sur la page sécurisée ci-dessous — <strong>vous pouvez fermer cet e-mail et y revenir plus tard</strong> : le lien reste valable 30 jours.</p>',
      `<p><a href="${lien}" style="display:inline-block;background:#d29922;color:#20160a;font-weight:700;padding:12px 22px;border-radius:99px;text-decoration:none">Ouvrir ma mise à niveau →</a></p>`,
      '<p>Vous y déposerez votre document, nous vérifions qu’il s’agit bien du bon type, puis l’analyse démarre. <strong>Vous pouvez fermer l’onglet pendant le traitement</strong> — revenez sur ce lien quand vous voulez, il reste valable 30 jours.</p>',
      `<p style="color:#6b7280;font-size:12px">Si le bouton ne fonctionne pas, recopiez cette adresse dans votre navigateur :<br>${lien}</p>`,
      licence,
      blocRecu(v),
    ].join('')
}

async function envoyerEmailCommande(v: VenteVerifiee, lien: string): Promise<boolean> {
  const apiKey = Deno.env.get('RESEND_API_KEY')
  if (!apiKey) return false
  const from = Deno.env.get('EMAIL_FROM') ?? 'Pharnos <onboarding@resend.dev>'
  const en = v.lang === 'en'
  const sujet = v.essai
    ? (en ? '[TEST] Your order is registered' : '[RECETTE] Votre commande est enregistrée')
    : (en ? 'Your order is registered — Pharnos' : 'Votre commande est enregistrée — Pharnos')
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        from,
        to: [v.email],
        subject: sujet,
        html: htmlEmailCommande(v, lien),
        // Multipart complet (C5) : mieux noté par les filtres, et lisible en texte seul.
        text: texteEmailCommande(v, lien),
      }),
    })
    return res.ok
  } catch {
    return false
  }
}
