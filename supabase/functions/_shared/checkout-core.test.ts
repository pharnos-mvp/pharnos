// Contrat du cœur de `checkout`. Surface PUBLIQUE sans authentification : chaque test décrit
// une entrée hostile ou malformée qu'elle doit refuser, et ce qui doit rester vrai de la
// requête envoyée à Chariow — c'est un ordre d'encaissement, pas un formulaire de contact.
import { assert, assertEquals } from 'jsr:@std/assert@1'

import {
  CHARIOW_ENDPOINT,
  corpsChariow,
  essaiAutorise,
  HOTES_PAIEMENT,
  INDICATIFS,
  lireReponseChariow,
  OFFRES_CHARIOW,
  OFFRES_ESSAI,
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
  // ⚠️ `lang` en fait partie : c'est la SEULE façon dont `chariow-pulse` connaîtra la langue de
  // l'acheteur au moment d'envoyer l'e-mail n°1 — son unique chemin d'accès si l'onglet est fermé.
  assertEquals(corps.custom_metadata, { ref: v.cmd.ref, offre: 'up1', lang: 'fr' })
  assertEquals(corps.phone, { number: '0196441776', country_code: 'BJ' })
})

Deno.test('corpsChariow — SANS jeton, on vend au prix public : le mode recette ne s’allume pas seul', () => {
  const v = validerCommande(base())
  assert(v.ok)
  // L'argument omis est le cas le plus fréquent : il doit valoir « production ».
  assertEquals(corpsChariow(v.cmd, 'unknown').product_id, OFFRES_CHARIOW.up1.productId)
  assertEquals(corpsChariow(v.cmd, 'unknown', false).product_id, OFFRES_CHARIOW.up1.productId)
})

Deno.test('corpsChariow — en recette, produit de test ET marque dans les métadonnées', () => {
  for (const offre of ['up1', 'up3'] as const) {
    const v = validerCommande(base({ offre }))
    assert(v.ok)
    const corps = corpsChariow(v.cmd, 'unknown', true)
    assertEquals(corps.product_id, OFFRES_ESSAI[offre].productId)
    // Une commande de recette doit se reconnaître dans le back-office sans recouper les montants.
    assertEquals(corps.custom_metadata, { ref: v.cmd.ref, offre, lang: 'fr', essai: '1' })
    // Les deux catalogues couvrent EXACTEMENT les mêmes offres : une offre présente en
    // production mais absente en recette ferait planter l'Edge sur `.productId` d'undefined.
    assert(OFFRES_ESSAI[offre].productId !== OFFRES_CHARIOW[offre].productId)
  }
  assertEquals(Object.keys(OFFRES_ESSAI).sort(), Object.keys(OFFRES_CHARIOW).sort())
})

Deno.test('essaiAutorise — ferme par défaut : pas de secret, pas de recette', () => {
  // ⚠️ Nommé `attendu`, PAS `secret` : gitleaks scanne tout l'historique et lit
  // `secret = '<30 caractères>'` comme une clé publiée. Un faux positif dans un test devient
  // une CI rouge, puis une allowlist, puis un scanner à qui on a appris à se taire.
  const attendu = 'jeton-de-recette-assez-long-01'
  // Valeur de référence absente, vide, ou trop courte pour en être une : rien ne passe.
  for (const s of [undefined, '', 'court', 'x'.repeat(15)]) {
    assertEquals(essaiAutorise(s, s), false)
    assertEquals(essaiAutorise('n’importe quoi', s), false)
  }
  // Le bon jeton passe, tout le reste échoue — y compris un préfixe et un non-texte.
  assertEquals(essaiAutorise(attendu, attendu), true)
  assertEquals(essaiAutorise(attendu.slice(0, -1), attendu), false)
  assertEquals(essaiAutorise(attendu + 'x', attendu), false)
  assertEquals(essaiAutorise(attendu.slice(0, -1) + 'X', attendu), false)
  for (const bidon of [null, undefined, 1, true, {}, ['a']]) {
    assertEquals(essaiAutorise(bidon, attendu), false)
  }
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
  assert(RETOURS.en.includes('lang=en'))
  assert(RETOURS.fr.includes('lang=fr'))
})

Deno.test('corpsChariow — la devise de règlement suit le pays de l’acheteur', () => {
  // Zone UEMOA : le XOF natif de la boutique, on ne transmet RIEN.
  const bj = validerCommande(base())
  assert(bj.ok)
  assert(!('payment_currency' in corpsChariow(bj.cmd, 'unknown')))
  // Hors zone franc : TOUJOURS l'euro, jamais le dollar. Le prix est annonce « 29 EUR
  // (19 000 FCFA) » — facturer dans une troisieme devise montre au client un montant qu'il
  // n'a jamais lu (« $33.68 » vu en live le 31/07).
  for (
    const [pays, devise] of [
      ['FR', 'EUR'],
      ['BE', 'EUR'],
      ['US', 'EUR'],
      ['IN', 'EUR'],
      ['TR', 'EUR'],
      ['CN', 'EUR'],
      ['CM', 'EUR'],
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
      // Observé en live le 31/07/2026 : Chariow délègue à son PSP Moneroo.
      'https://checkout.moneroo.io/py_0ej4xpfpob79?country=BJ',
      'https://adbhrqbd.mychariow.com/prd_x/checkout',
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
      'https://moneroo.io.mal.example/x',
      'https://payment-moneroo.io/x',
      // Accepté avant le 31/07 mais ABSENT du `frame-src` : cadre blanc silencieux.
      'https://payment.chariow.com/checkout?token=abc',
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

Deno.test('lireReponseChariow — un 422 est un refus de DONNÉES, pas une panne', () => {
  // Cas nominal du marché : un déposant béninois dépose au Niger et garde son numéro
  // béninois. Chariow refuse le couple indicatif/numéro — l'acheteur doit le savoir et
  // corriger sur NOTRE formulaire, jamais être renvoyé vers la boutique.
  const r = lireReponseChariow(422, {
    message: 'The phone.number field is invalid.',
    errors: { 'phone.number': ['invalid'] },
  })
  assert(!r.ok)
  assertEquals(r.erreur, 'donnees')
  assertEquals(r.champs, ['phone.number'])
})

Deno.test('lireReponseChariow — tout le reste est une erreur franche', () => {
  // Un lien http, une étape inconnue, un corps vide, un 4xx : jamais de redirection hasardeuse.
  for (
    const [status, corps] of [
      [200, { data: { step: 'payment', payment: { checkout_url: 'http://mal.example' } } }],
      [200, { data: { step: 'completed', payment: { checkout_url: null } } }],
      [200, {}],
      [401, { message: 'Non autorisé' }],
      [500, { message: 'Erreur interne' }],
    ] as const
  ) {
    const r = lireReponseChariow(status as number, corps)
    assert(!r.ok, JSON.stringify(corps))
    assertEquals(r.erreur, 'chariow')
  }
})

Deno.test('constantes — endpoint Chariow en https, retours sur la page CADRABLE', () => {
  assert(CHARIOW_ENDPOINT.startsWith('https://api.chariow.com/'))
  // `/paiement/retour` est la seule page exceptée de `frame-ancestors 'none'` : y revenir est
  // la condition pour que le cadre de paiement puisse se lire au retour.
  for (const url of [RETOURS.fr, RETOURS.en]) {
    assert(url.startsWith('https://pharnos.com/paiement/retour?'), url)
    assert(url.includes('paiement=ok'), url)
  }
})

Deno.test('hotes-jumeaux — tout hôte accepté par le serveur est cadrable par la CSP', async () => {
  // Un hôte accepté ici mais absent du `frame-src` donne un cadre BLANC, sans erreur ni
  // repli. Les deux listes vivent dans deux fichiers : ce test est leur seul lien.
  const headers = await Deno.readTextFile(
    new URL('../../../landing/_headers', import.meta.url),
  )
  // La DIRECTIVE, pas le commentaire qui la documente juste au-dessus.
  const ligne = headers
    .split('\n')
    .find((l) => l.includes('Content-Security-Policy:') && l.includes('frame-src'))
  assert(ligne, 'aucune directive frame-src dans landing/_headers')
  const frameSrc = /frame-src ([^;]+)/.exec(ligne)?.[1] ?? ''
  for (
    const hote of [
      'checkout.moneroo.io',
      'pay.moneroo.io',
      'pharnos.mychariow.com',
      // Domaine de marque de la boutique (CNAME → Vercel), vérifié côté Chariow le 01/08.
      'services.pharnos.com',
    ]
  ) {
    assert(HOTES_PAIEMENT.test(hote), `${hote} refusé par le serveur`)
    const couvert = frameSrc
      .split(/\s+/)
      .filter(Boolean)
      .some((src) =>
        src.startsWith('https://*.')
          ? hote.endsWith(src.slice('https://*.'.length))
          : src === `https://${hote}`
      )
    assert(couvert, `${hote} accepté par le serveur mais absent du frame-src`)
  }
})

Deno.test('indicatifs-jumeaux — tout pays proposé au formulaire est dédoublonnable ici', async () => {
  // Un pays offert au choix mais absent de la table serveur perd le dédoublonnage : « +229 01
  // 96… » part en `229019…`, le processeur refuse, et le refus ressemble à une faute du client.
  // Les deux listes vivent dans deux fichiers : ce test est leur seul lien.
  const js = await Deno.readTextFile(new URL('../../../landing/modele.js', import.meta.url))
  const bloc = js.slice(js.indexOf('const INDICATIFS = ['))
  const front = [...bloc.slice(0, bloc.indexOf('];')).matchAll(/\["([A-Z]{2})", "(\d+)"/g)]
  // Exact et bidirectionnel : un pays serveur-seulement est du code mort, un pays
  // formulaire-seulement casse le dédoublonnage. Le comptage strict attrape les deux.
  assertEquals(
    front.length,
    Object.keys(INDICATIFS).length,
    'les deux listes n’ont pas le même nombre de pays',
  )
  for (const [, iso, code] of front) {
    assertEquals(INDICATIFS[iso as string], code, `${iso} absent ou divergent côté serveur`)
  }
})
