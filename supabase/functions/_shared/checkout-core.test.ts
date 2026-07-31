// Contrat du cœur de `checkout`. Surface PUBLIQUE sans authentification : chaque test décrit
// une entrée hostile ou malformée qu'elle doit refuser, et ce qui doit rester vrai de la
// requête envoyée à Chariow — c'est un ordre d'encaissement, pas un formulaire de contact.
import { assert, assertEquals } from 'jsr:@std/assert@1'

import {
  CHARIOW_ENDPOINT,
  corpsChariow,
  lireReponseChariow,
  OFFRES_CHARIOW,
  RETOURS,
  validerCommande,
} from './checkout-core.ts'

const base = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  offre: 'up1',
  ref: '11de0d87-9e03-4d8a-9bb4-fbd971522423',
  prenom: 'Awa',
  nom: 'Diallo',
  email: 'awa@laboratoire.com',
  telephone: '+229 01 96 44 17 76',
  paysTel: 'bj',
  ...over,
})

Deno.test('validerCommande — accepte un payload nominal et normalise', () => {
  const v = validerCommande(base())
  assert(v.ok)
  assertEquals(v.cmd.offre, 'up1')
  // Le téléphone ne garde que les chiffres, SANS l'indicatif déjà porté par `country_code` :
  // « +229 01 96… » avec Bénin sélectionné ne doit jamais devenir +229 229… chez le processeur.
  assertEquals(v.cmd.telephone, '0196441776')
  // L'indicatif pays remonte en ISO majuscule.
  assertEquals(v.cmd.paysTel, 'BJ')
  // Langue absente → français, jamais un rejet.
  assertEquals(v.cmd.langue, 'fr')
})

Deno.test('validerCommande — saisie nationale et internationale donnent le MÊME numéro', () => {
  const nat = validerCommande(base({ telephone: '01 96 44 17 76' }))
  const int = validerCommande(base({ telephone: '+229 01 96 44 17 76' }))
  assert(nat.ok && int.ok)
  assertEquals(nat.cmd.telephone, int.cmd.telephone)
})

Deno.test('validerCommande — la langue est un enum fermé, `en` accepté, le reste → fr', () => {
  const en = validerCommande(base({ langue: 'en' }))
  assert(en.ok)
  assertEquals(en.cmd.langue, 'en')
  const autre = validerCommande(base({ langue: 'https://mal.example' }))
  assert(autre.ok)
  assertEquals(autre.cmd.langue, 'fr')
})

Deno.test('validerCommande — refuse une offre inconnue (jamais de product_id du client)', () => {
  const v = validerCommande(base({ offre: 'prd_hf86pys5' }))
  assert(!v.ok)
  assertEquals(v.champs, ['offre'])
})

Deno.test('validerCommande — la référence doit être un UUID des nôtres', () => {
  for (const ref of ['abc', '', 42, 'sal_xyz789', null]) {
    const v = validerCommande(base({ ref }))
    assert(!v.ok, String(ref))
    assert(v.champs.includes('ref'))
  }
})

Deno.test('validerCommande — e-mail et téléphone bornés (8 chiffres minimum, comme partout)', () => {
  assert(!validerCommande(base({ email: 'pas-un-email' })).ok)
  assert(!validerCommande(base({ telephone: '1234567' })).ok)
  assert(!validerCommande(base({ telephone: '1'.repeat(30) })).ok)
  assert(!validerCommande(base({ paysTel: 'Bénin' })).ok)
})

Deno.test('validerCommande — liste TOUS les champs fautifs d’un coup', () => {
  const v = validerCommande({})
  assert(!v.ok)
  assertEquals(v.champs.sort(), ['email', 'nom', 'offre', 'paysTel', 'prenom', 'ref', 'telephone'])
})

Deno.test('corpsChariow — porte le produit mappé, la référence en métadonnées, le retour serveur', () => {
  const v = validerCommande(base())
  assert(v.ok)
  const corps = corpsChariow(v.cmd, '203.0.113.7')
  assertEquals(corps.product_id, OFFRES_CHARIOW.up1.productId)
  assertEquals(corps.redirect_url, RETOURS.fr)
  assertEquals(corps.custom_metadata, { ref: v.cmd.ref, offre: 'up1' })
  assertEquals(corps.phone, { number: '0196441776', country_code: 'BJ' })
})

Deno.test("corpsChariow — l'IP de l'acheteur est transmise : sans elle, tout le monde est en DE", () => {
  // Mesuré le 31/07 : sans `customer_ip`, Chariow voit l'IP de notre Edge (Francfort) et
  // renvoie `country=DE` pour un déposant béninois — mobile money local inaccessible.
  const v = validerCommande(base())
  assert(v.ok)
  assertEquals(corpsChariow(v.cmd, '203.0.113.7').customer_ip, '203.0.113.7')
  assert(!('customer_ip' in corpsChariow(v.cmd, 'unknown')))
})

Deno.test("corpsChariow — l'anglophone revient sur le miroir EN, jamais sur la page FR", () => {
  const v = validerCommande(base({ langue: 'en' }))
  assert(v.ok)
  assertEquals(corpsChariow(v.cmd, 'unknown').redirect_url, RETOURS.en)
  assert(RETOURS.en.startsWith('https://pharnos.com/en/'))
})

Deno.test('corpsChariow — la devise de règlement suit le pays de l’acheteur', () => {
  // Zone UEMOA : le XOF natif de la boutique, on ne transmet RIEN.
  const bj = validerCommande(base())
  assert(bj.ok)
  assert(!('payment_currency' in corpsChariow(bj.cmd, 'unknown')))
  // Zone euro → EUR ; ailleurs → USD (le corridor carte universel — un Indien sur une offre
  // en francs CFA voyait « Request failed with status code 400 », vu en live le 31/07).
  for (
    const [pays, devise] of [
      ['FR', 'EUR'],
      ['BE', 'EUR'],
      ['US', 'USD'],
      ['IN', 'USD'],
      ['TR', 'USD'],
      ['CN', 'USD'],
    ] as const
  ) {
    const v = validerCommande(base({ paysTel: pays, telephone: '612345678' }))
    assert(v.ok, pays)
    assertEquals(corpsChariow(v.cmd, 'unknown').payment_currency, devise, pays)
  }
})

Deno.test('validerCommande — le dédoublonnage d’indicatif couvre aussi les pays hors UEMOA', () => {
  const us = validerCommande(base({ paysTel: 'US', telephone: '+1 415 555 01 99' }))
  assert(us.ok)
  assertEquals(us.cmd.telephone, '4155550199')
  const inTel = validerCommande(base({ paysTel: 'IN', telephone: '+91 98765 43210' }))
  assert(inTel.ok)
  assertEquals(inTel.cmd.telephone, '9876543210')
})


Deno.test('lireReponseChariow — accepte le seul cas payant : step payment + hôte de paiement connu', () => {
  for (
    const url of [
      'https://payment.chariow.com/checkout?token=abc',
      // Observé en live le 31/07/2026 : Chariow délègue à son PSP Moneroo.
      'https://checkout.moneroo.io/py_0ej4xpfpob79?country=BJ',
    ]
  ) {
    const r = lireReponseChariow(200, {
      data: {
        step: 'payment',
        purchase: { id: 'sal_x', status: 'awaiting_payment' },
        payment: { checkout_url: url, transaction_id: 't' },
      },
    })
    assert(r.ok, url)
    assertEquals(r.url, url)
  }
})

Deno.test('lireReponseChariow — un hôte inconnu ne devient JAMAIS une redirection', () => {
  // Position de phishing idéale : un acheteur en confiance, au milieu d'un paiement.
  for (
    const url of [
      'https://mal.example/checkout',
      'https://chariow.com.mal.example/x',
      'https://payment-chariow.com/x',
    ]
  ) {
    const r = lireReponseChariow(200, {
      data: { step: 'payment', payment: { checkout_url: url } },
    })
    assert(!r.ok, url)
    assertEquals(r.erreur, 'chariow')
  }
})

Deno.test('lireReponseChariow — « déjà acheté » est un cas nommé, pas un succès', () => {
  const r = lireReponseChariow(200, { data: { step: 'already_purchased', message: 'x' } })
  assert(!r.ok)
  assertEquals(r.erreur, 'deja_achete')
})

Deno.test('lireReponseChariow — tout le reste est une erreur franche', () => {
  // Un lien http, une étape inconnue, un corps vide, un 4xx : jamais de redirection hasardeuse.
  for (
    const [status, corps] of [
      [200, { data: { step: 'payment', payment: { checkout_url: 'http://mal.example' } } }],
      [200, { data: { step: 'completed', payment: { checkout_url: null } } }],
      [200, {}],
      [422, { message: 'Validation failure' }],
      [401, { message: 'Non autorisé' }],
    ] as const
  ) {
    const r = lireReponseChariow(status as number, corps)
    assert(!r.ok, JSON.stringify(corps))
    assertEquals(r.erreur, 'chariow')
  }
})

Deno.test('constantes — endpoint Chariow en https, retours sur pharnos.com', () => {
  assert(CHARIOW_ENDPOINT.startsWith('https://api.chariow.com/'))
  assert(RETOURS.fr.startsWith('https://pharnos.com/modele'))
  assert(RETOURS.en.startsWith('https://pharnos.com/en/template'))
})
