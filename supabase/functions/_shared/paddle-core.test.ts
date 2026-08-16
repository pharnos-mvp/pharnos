// deno test — noyau du rail Paddle. Module pur : aucun réseau.
//
// Les formes utilisées ici sont RÉELLES : relevées sur le compte sandbox (transaction
// `txn_01m04prg…`, catalogue Pharnos), jamais inventées. C'est la leçon du rail Chariow, où deux
// formes « documentaires » ont fait perdre une vente : le corps réel portait l'identifiant ailleurs.
import { assertEquals } from 'jsr:@std/assert@1'

import { lireEvenementPaddle, lireTransactionPaddle, PADDLE_EVENT_VENTE } from './paddle-core.ts'

const TXN = 'txn_01m04prg3480m270fsmdd4w102'
const REF = '8f3a2c10-4b6d-4e21-9c77-2a1b5e9d0f34'

/** Une transaction réglée, telle que l'API REST la rend (snake_case, montants en CHAÎNE). */
const transaction = (over: Record<string, unknown> = {}) => ({
  id: TXN,
  status: 'completed',
  custom_data: { ref: REF, lang: 'fr' },
  items: [
    {
      price: {
        id: 'pri_01m04k4tt3g4nats5t6jbyzf4r',
        product_id: 'pro_01m04k4tp6k7tfadvn74w6rmaw',
        custom_data: { offre: 'up1' },
      },
    },
  ],
  details: {
    totals: { subtotal: '2417', tax: '0', total: '2417', grand_total: '2417', currency_code: 'EUR' },
  },
  customer: { email: 'ra@laboratoire-exemple.fr', name: 'Laboratoire Exemple SA' },
  payments: [{ status: 'captured', method_details: { type: 'card' } }],
  ...over,
})

/* ─────────────────────────────────── L'événement webhook ───────────────────────────────────── */

Deno.test('événement Paddle : on ne retient que le TYPE et l’identifiant de transaction', () => {
  const lu = lireEvenementPaddle({
    event_id: 'evt_01abc',
    event_type: PADDLE_EVENT_VENTE,
    notification_id: 'ntf_01abc',
    occurred_at: '2026-08-16T07:00:00Z',
    // Tout ce qui suit est ignoré : le montant et l'offre viennent de l'API re-vérifiée.
    data: { id: TXN, status: 'completed', details: { totals: { grand_total: '999999' } } },
  })
  assertEquals(lu, { eventType: PADDLE_EVENT_VENTE, transactionId: TXN })
})

Deno.test('événement Paddle : un corps sans type ni identifiant valide est refusé', () => {
  for (const mauvais of [
    null,
    'texte',
    {},
    { event_type: PADDLE_EVENT_VENTE },
    { event_type: PADDLE_EVENT_VENTE, data: {} },
    { event_type: PADDLE_EVENT_VENTE, data: { id: 42 } },
    { event_type: PADDLE_EVENT_VENTE, data: { id: 'SALEX5MD9EZOYKITEPM' } }, // un id CHARIOW
    { event_type: PADDLE_EVENT_VENTE, data: { id: 'txn_TROP_COURT' } },
    { data: { id: TXN } },
  ]) {
    assertEquals('erreur' in lireEvenementPaddle(mauvais), true, `accepté : ${JSON.stringify(mauvais)}`)
  }
})

/* ─────────────────────────── La transaction, telle que l'API la confirme ───────────────────── */

Deno.test('transaction : une transaction réglée sur une offre du catalogue devient une commande', () => {
  const v = lireTransactionPaddle(transaction(), true)
  assertEquals(v, {
    saleId: TXN,
    offre: 'up1',
    essai: true,
    amountMinor: 2417,
    currency: 'EUR',
    email: 'ra@laboratoire-exemple.fr',
    firstName: 'Laboratoire',
    lastName: 'Exemple SA',
    ref: REF,
    lang: 'fr',
    paymentMethod: 'card',
    invoiceUrl: null,
  })
  // La ressource peut être enveloppée dans `data`.
  assertEquals(lireTransactionPaddle({ data: transaction() }, true), v)
})

Deno.test('⚠️ transaction : l’OFFRE vient du CATALOGUE, jamais des métadonnées de la transaction', () => {
  // `custom_data` de la transaction transite par le navigateur au checkout. Si l'offre s'y lisait,
  // un acheteur paierait 29 € et se déclarerait le bundle à 69 € — c'est l'invariant jumeau de
  // « le régime vient du produit » côté Chariow.
  const truque = transaction({ custom_data: { ref: REF, lang: 'fr', offre: 'up3' } })
  const v = lireTransactionPaddle(truque, true)
  assertEquals('erreur' in v ? 'erreur' : v.offre, 'up1')

  // Et une offre HORS PÉRIMÈTRE de cette chaîne (le catalogue Paddle porte aussi les audits et le
  // CTD Builder) s'écarte sans rien créer, au lieu de mourir après la dépense moteur.
  const audit = transaction({
    items: [{ price: { id: 'pri_x', custom_data: { offre: 'audit-ra' } } }],
  })
  assertEquals('erreur' in lireTransactionPaddle(audit, true), true)
})

Deno.test('⚠️ transaction : le RÉGIME d’essai est imposé par l’environnement, jamais par la donnée', () => {
  // Un acheteur ne doit pas pouvoir se déclarer en recette : le drapeau vient de l'appelant
  // (bac à sable ou production), pas du corps.
  const truque = transaction({ custom_data: { ref: REF, essai: '1' } })
  assertEquals('erreur' in truque ? 'erreur' : (lireTransactionPaddle(truque, false) as { essai: boolean }).essai, false)
  assertEquals((lireTransactionPaddle(transaction(), true) as { essai: boolean }).essai, true)
})

Deno.test('transaction : NON RÉGLÉE ⇒ aucune commande', () => {
  // `billed` = facture émise, pas encore payée : c'est l'état réel d'une facture B2B à 30 jours.
  for (const statut of ['billed', 'ready', 'draft', 'canceled', 'past_due', '']) {
    const v = lireTransactionPaddle(transaction({ status: statut }), true)
    assertEquals('erreur' in v, true, `acceptée à tort : ${statut}`)
  }
  assertEquals('erreur' in lireTransactionPaddle(transaction({ status: 'paid' }), true), false)
})

Deno.test('transaction : sans adresse de contact, on REFUSE plutôt que de créer une orpheline', () => {
  // L'e-mail n°1 est le seul chemin d'accès au livrable si l'acheteur ferme l'onglet.
  for (const client of [null, {}, { name: 'X' }, { email: '   ' }]) {
    const v = lireTransactionPaddle(transaction({ customer: client }), true)
    assertEquals('erreur' in v, true, `acceptée : ${JSON.stringify(client)}`)
  }
})

Deno.test('transaction : montant, nom et moyen de paiement sont lus SANS bloquer la commande', () => {
  // Un montant illisible ne doit pas coûter une commande payée : il devient inconnu.
  const sansTotaux = lireTransactionPaddle(transaction({ details: {} }), true)
  assertEquals('erreur' in sansTotaux ? 'erreur' : sansTotaux.amountMinor, null)

  // Un nom d'un seul mot n'a pas de nom de famille — on n'en invente pas.
  const monoNom = lireTransactionPaddle(
    transaction({ customer: { email: 'x@y.fr', name: 'Sanofi' } }),
    true,
  )
  assertEquals('erreur' in monoNom ? 'erreur' : [monoNom.firstName, monoNom.lastName], ['Sanofi', null])

  // Aucun paiement listé (facture manuelle) : pas de moyen inventé.
  const sansPaiement = lireTransactionPaddle(transaction({ payments: [] }), true)
  assertEquals('erreur' in sansPaiement ? 'erreur' : sansPaiement.paymentMethod, null)
})

Deno.test('transaction : une référence non-UUID est ignorée, la commande se crée quand même', () => {
  // Même règle que sur le rail Chariow : la référence sert le PONT, elle ne conditionne pas la
  // naissance — l'acheteur a payé.
  const v = lireTransactionPaddle(transaction({ custom_data: { ref: 'pas-un-uuid' } }), true)
  assertEquals('erreur' in v ? 'erreur' : v.ref, null)
  assertEquals('erreur' in v ? 'erreur' : v.lang, 'fr')
  // La langue se lit des métadonnées et retombe sur le français.
  const en = lireTransactionPaddle(transaction({ custom_data: { lang: 'en' } }), true)
  assertEquals('erreur' in en ? 'erreur' : en.lang, 'en')
})
