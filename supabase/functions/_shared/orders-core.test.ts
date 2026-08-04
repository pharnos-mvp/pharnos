// deno test — noyau « paiement → commande » (U1). Aucun réseau : tout ce qui décide est pur.
import { assertEquals, assertNotEquals, assertMatch } from 'jsr:@std/assert@1'

import {
  deliveryExpiryFrom,
  deliveryTokenHash,
  isValidDeliveryToken,
  isValidRef,
  lirePulse,
  lireVente,
  newDeliveryToken,
  PRODUITS,
  PULSE_EVENT_VENTE,
} from './orders-core.ts'

const REF = '3f2504e0-4f89-11d3-9a0c-0305e82c3301'

/** Une vente réglée telle que l'API la rend, forme « à plat ». */
const vente = (over: Record<string, unknown> = {}) => ({
  id: 'sale_123',
  status: 'paid',
  product_id: 'prd_hf86pys5',
  amount: 19000,
  currency: 'XOF',
  customer_email: 'client@labo.sn',
  customer_first_name: 'Awa',
  customer_last_name: 'Ndiaye',
  custom_metadata: { ref: REF, offre: 'up1' },
  ...over,
})

/* ─────────────────────────────────── Le jeton de livraison ─────────────────────────────────── */

Deno.test('jeton : 43 caractères base64url, tiré du générateur du système', () => {
  const t = newDeliveryToken()
  assertEquals(t.length, 43)
  assertMatch(t, /^[A-Za-z0-9_-]{43}$/)
  assertEquals(isValidDeliveryToken(t), true)
  // Deux tirages ne se ressemblent pas : c'est 256 bits, pas un compteur.
  assertNotEquals(newDeliveryToken(), newDeliveryToken())
})

Deno.test('jeton : ce qui n’est pas un jeton est refusé', () => {
  for (const mauvais of ['', 'court', 'a'.repeat(42), 'a'.repeat(44), 'a'.repeat(42) + '+', null, 42, {}]) {
    assertEquals(isValidDeliveryToken(mauvais), false)
  }
})

Deno.test('jeton : l’empreinte stockée est un SHA-256 hex, stable et indexable', async () => {
  // ⚠️ C'est ce qui rend `order-status` tenable : le lien est interrogé toutes les 2 s pendant
  // toute la génération, donc la recherche doit être un index, pas un balayage. Un PBKDF2 (sel par
  // ligne) obligerait à re-dériver le hash pour CHAQUE commande à chaque appel.
  const t = newDeliveryToken()
  const h = await deliveryTokenHash(t)
  assertMatch(h, /^[0-9a-f]{64}$/)
  assertEquals(await deliveryTokenHash(t), h)
  assertNotEquals(await deliveryTokenHash(newDeliveryToken()), h)
})

Deno.test('jeton : le lien expire à 30 jours, depuis une horloge INJECTÉE', () => {
  const t0 = new Date('2026-08-04T10:00:00.000Z')
  assertEquals(deliveryExpiryFrom(t0).toISOString(), '2026-09-03T10:00:00.000Z')
})

/* ────────────────────────────────────────── Le Pulse ───────────────────────────────────────── */

Deno.test('Pulse : l’identifiant se lit à plat comme sous `data`', () => {
  assertEquals(
    lirePulse({ event: PULSE_EVENT_VENTE, sale_id: 'sale_9' }),
    { event: PULSE_EVENT_VENTE, saleId: 'sale_9' },
  )
  assertEquals(
    lirePulse({ type: PULSE_EVENT_VENTE, data: { id: 'sale_9' } }),
    { event: PULSE_EVENT_VENTE, saleId: 'sale_9' },
  )
})

Deno.test('Pulse : un corps sans événement ni identifiant est refusé', () => {
  for (const mauvais of [null, 'texte', {}, { event: 'x' }, { event: 'x', sale_id: '' }, { sale_id: 'a' }]) {
    const lu = lirePulse(mauvais)
    assertEquals('erreur' in lu, true, `accepté à tort : ${JSON.stringify(mauvais)}`)
  }
  // Un identifiant démesuré est refusé AVANT de partir en URL vers l'API.
  assertEquals('erreur' in lirePulse({ event: 'x', sale_id: 'a'.repeat(121) }), true)
})

Deno.test('Pulse : RIEN d’autre que l’événement et l’identifiant n’est retenu', () => {
  // Les Pulses Chariow ne portent aucun secret de signature : tout champ qu'on leur emprunterait
  // deviendrait forgeable par quiconque connaît l'URL. Ici, un montant et un produit soufflés dans
  // le corps ne survivent pas à la lecture.
  const lu = lirePulse({
    event: PULSE_EVENT_VENTE,
    sale_id: 'sale_9',
    amount: 1,
    product_id: 'prd_hf86pys5',
    status: 'paid',
  })
  assertEquals(lu, { event: PULSE_EVENT_VENTE, saleId: 'sale_9' })
})

/* ─────────────────────────────── La vente vérifiée auprès de l’API ─────────────────────────── */

Deno.test('vente : une vente réglée sur un produit connu devient une commande', () => {
  const v = lireVente(vente())
  assertEquals('erreur' in v, false)
  assertEquals(v, {
    saleId: 'sale_123',
    offre: 'up1',
    essai: false,
    amountMinor: 19000,
    currency: 'XOF',
    email: 'client@labo.sn',
    firstName: 'Awa',
    lastName: 'Ndiaye',
    ref: REF,
    lang: 'fr',
  })
})

Deno.test('vente : la LANGUE se lit des métadonnées, et retombe sur le français', () => {
  // Elle n'accorde aucun droit et ne se déduit d'aucun produit : la lire des métadonnées est ici
  // légitime, là où `offre` et `essai` ne le seraient pas. Le pire qu'un forgeur en tire, c'est de
  // recevoir SON PROPRE e-mail dans l'autre langue.
  assertEquals((lireVente(vente({ custom_metadata: { ref: REF, lang: 'en' } })) as { lang: string }).lang, 'en')
  assertEquals((lireVente(vente({ custom_metadata: { ref: REF } })) as { lang: string }).lang, 'fr')
  // Toute valeur inconnue retombe sur le marché principal plutôt que de casser l'envoi.
  assertEquals((lireVente(vente({ custom_metadata: { lang: 'de' } })) as { lang: string }).lang, 'fr')
})

Deno.test('vente : la ressource peut être enveloppée dans `data`', () => {
  const v = lireVente({ data: vente() })
  assertEquals((v as { saleId: string }).saleId, 'sale_123')
})

Deno.test('vente : NON RÉGLÉE ⇒ aucune commande', () => {
  for (const statut of ['pending', 'failed', 'refunded', 'canceled', '', 'expired']) {
    const v = lireVente(vente({ status: statut }))
    assertEquals('erreur' in v, true, `statut « ${statut} » accepté à tort`)
  }
  // Les libellés d'une vente aboutie sont acceptés, quelle que soit la variante d'intégration.
  for (const statut of ['paid', 'completed', 'success', 'successful']) {
    assertEquals('erreur' in lireVente(vente({ status: statut })), false, statut)
  }
})

Deno.test('vente : un produit HORS PÉRIMÈTRE s’acquitte sans rien créer', () => {
  // Le même magasin vend les packs CTD Builder : leurs ventes frappent le même webhook. Ce n'est
  // pas une panne, c'est une vente qui ne nous concerne pas.
  const v = lireVente(vente({ product_id: 'prd_ctdbuilder49' }))
  assertEquals('erreur' in v, true)
  assertMatch((v as { erreur: string }).erreur, /hors périmètre/)
})

Deno.test('vente : le RÉGIME vient du produit, jamais des métadonnées', () => {
  // ⚠️ L'invariant central. Une métadonnée est posée à la création de session — donc par notre
  // `checkout` — mais une vente conclue par un autre chemin n'en porte aucune, et un tiers qui
  // saurait forger le corps d'un Pulse ne doit pas pouvoir se déclarer en recette (ni l'inverse).
  const publicAvecEssai = lireVente(vente({ custom_metadata: { ref: REF, essai: '1' } }))
  assertEquals((publicAvecEssai as { essai: boolean }).essai, false)

  const recetteSansMeta = lireVente(vente({ product_id: 'prd_g3norblb', custom_metadata: {} }))
  assertEquals((recetteSansMeta as { essai: boolean }).essai, true)
  assertEquals((recetteSansMeta as { offre: string }).offre, 'up1')

  // Et l'offre non plus ne se laisse pas souffler : le produit fait foi.
  const offreForgee = lireVente(vente({ custom_metadata: { ref: REF, offre: 'up3' } }))
  assertEquals((offreForgee as { offre: string }).offre, 'up1')
})

Deno.test('vente : les 4 produits du catalogue sont couverts, et eux seuls', () => {
  assertEquals(Object.keys(PRODUITS).length, 4)
  const regimes = Object.values(PRODUITS).map((p) => `${p.offre}:${p.essai}`).sort()
  assertEquals(regimes, ['up1:false', 'up1:true', 'up3:false', 'up3:true'])
})

Deno.test('vente : sans adresse de contact, on REFUSE plutôt que de créer une orpheline', () => {
  // Sans e-mail, l'acheteur n'a aucun moyen de retrouver son livrable si l'onglet se ferme :
  // l'e-mail n°1 EST le filet du parcours.
  const v = lireVente(vente({ customer_email: undefined, email: undefined, customer: {} }))
  assertEquals('erreur' in v, true)
  // L'adresse peut être portée par l'objet `customer`.
  const dansCustomer = lireVente(
    vente({ customer_email: undefined, customer: { email: 'a@b.sn' } }),
  )
  assertEquals((dansCustomer as { email: string }).email, 'a@b.sn')
})

Deno.test('vente : une référence non-UUID est ignorée, la commande se crée quand même', () => {
  // La référence n'est QUE la clé du pont. Une vente hors parcours en est dépourvue — l'acheteur a
  // payé, il a droit à sa commande ; il l'atteindra par l'e-mail n°1 au lieu de la redirection.
  for (const mauvaise of ['../etc', "' or 1=1", 'x'.repeat(60), '']) {
    const v = lireVente(vente({ custom_metadata: { ref: mauvaise } }))
    assertEquals('erreur' in v, false)
    assertEquals((v as { ref: string | null }).ref, null)
  }
})

Deno.test('vente : un montant illisible ne bloque pas la commande, il devient inconnu', () => {
  // Le montant sert la trace comptable, jamais le droit au service : le refuser priverait un
  // acheteur RÉGLÉ de son livrable pour un champ décoratif.
  const v = lireVente(vente({ amount: 'gratuit' }))
  assertEquals('erreur' in v, false)
  assertEquals((v as { amountMinor: number | null }).amountMinor, null)
})

/* ──────────────────────────────────────── Le pont ──────────────────────────────────────────── */

Deno.test('pont : seule une référence UUID est recevable', () => {
  assertEquals(isValidRef(REF), true)
  assertEquals(isValidRef(REF.toUpperCase()), true)
  for (const mauvaise of ['', 'abc', REF + 'x', "' or '1'='1", null, 42, {}]) {
    assertEquals(isValidRef(mauvaise), false, `accepté à tort : ${String(mauvaise)}`)
  }
})
