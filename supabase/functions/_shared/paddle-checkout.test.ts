// deno test — ouverture d'un paiement Paddle. Module pur, sauf la recette JUMELLE de la fin, qui
// lit `landing/_headers` (le seul lien entre ce que le serveur rend et ce que la CSP autorise).
import { assert, assertEquals } from 'jsr:@std/assert@1'

import {
  CHEMIN_TUNNEL,
  corpsTransactionPaddle,
  lireTransactionCreee,
  paddleApi,
  prixParOffre,
  urlTunnel,
} from './paddle-checkout.ts'
import type { CommandeValidee } from './checkout-core.ts'

const CMD: CommandeValidee = {
  offre: 'up1',
  ref: '8f3a2c10-4b6d-4e21-9c77-2a1b5e9d0f34',
  prenom: 'Awa',
  nom: 'Ndiaye',
  email: 'ra@labo.sn',
  telephone: '770000000',
  paysTel: 'SN',
  langue: 'fr',
}
const PRIX = 'pri_01m04k4tt3g4nats5t6jbyzf4r'
const TXN = 'txn_01m04prg3480m270fsmdd4w102'
const DEMANDEE = 'https://pharnos.com/tunnel/paddle?e=s&lang=fr'
const RENDUE = `https://pharnos.com/tunnel/paddle?_ptxn=${TXN}&e=s&lang=fr`

const reponse = (url: string, id = TXN) => ({ data: { id, checkout: { url } } })

Deno.test('bac à sable et production sont deux HÔTES, jamais un drapeau', () => {
  assertEquals(paddleApi(true), 'https://sandbox-api.paddle.com')
  assertEquals(paddleApi(false), 'https://api.paddle.com')
})

Deno.test('prixParOffre : la correspondance vient de l’environnement, et se valide', () => {
  assertEquals(prixParOffre(JSON.stringify({ up1: PRIX })), { up1: PRIX })
  // Un identifiant mal formé est ÉCARTÉ, pas transmis : une variable mal collée doit se voir ici,
  // pas au premier acheteur.
  assertEquals(prixParOffre(JSON.stringify({ up1: PRIX, up3: 'pri_court', bad: 42 })), { up1: PRIX })
  // Rien de lisible ⇒ correspondance VIDE : l'appelant refuse proprement au lieu de tomber en 500.
  for (const mauvais of [undefined, '', 'pas du json', '[]', 'null', '"texte"', '42']) {
    assertEquals(prixParOffre(mauvais), {}, `accepté : ${mauvais}`)
  }
})

Deno.test('urlTunnel : le tunnel vit sur l’origine DE L’ACHETEUR', () => {
  // `frame-ancestors 'self'` : la page cadrée doit être de même origine que la page mère. Servir
  // l'apex à quelqu'un venu de `www.` donnerait un cadre refusé après le clic « Payer ».
  assertEquals(urlTunnel('https://pharnos.com', 'fr', true), DEMANDEE)
  assertEquals(
    urlTunnel('https://www.pharnos.com', 'en', false),
    'https://www.pharnos.com/tunnel/paddle?e=l&lang=en',
  )
})

Deno.test('corps de transaction : la RÉFÉRENCE voyage, AUCUNE identité ne part', () => {
  const corps = corpsTransactionPaddle(CMD, PRIX, DEMANDEE)
  assertEquals(corps.items, [{ price_id: PRIX, quantity: 1 }])
  assertEquals(corps.custom_data, { ref: CMD.ref, offre: 'up1', lang: 'fr' })
  assertEquals(corps.collection_mode, 'automatic')
  assertEquals(corps.checkout, { url: DEMANDEE })
  // ⚠️ Le garde-fou du jour : une adresse saisie dans un formulaire anonyme n'est pas prouvée.
  // La transmettre ferait émettre la facture — un document légal — au nom d'un tiers.
  const serialise = JSON.stringify(corps)
  for (const pii of [CMD.email, CMD.prenom, CMD.nom, CMD.telephone]) {
    assertEquals(serialise.includes(pii), false, `identité transmise : ${pii}`)
  }
  assertEquals('customer_id' in corps, false)
})

Deno.test('réponse : seule l’URL EXACTEMENT demandée est transmise', () => {
  assertEquals(lireTransactionCreee(201, reponse(RENDUE), DEMANDEE), {
    ok: true,
    url: RENDUE,
    transactionId: TXN,
  })
  assertEquals(lireTransactionCreee(200, reponse(RENDUE), DEMANDEE).ok, true)

  // ⚠️ Rediriger un acheteur au milieu d'un paiement vers autre chose que la page qu'on a
  // demandée est la position de phishing idéale — hôte voisin, sous-domaine, chemin différent,
  // schéma dégradé, ou une transaction qui n'est pas celle qu'on vient de créer.
  const refuses = [
    `https://pharnos.com.attaquant.fr/tunnel/paddle?_ptxn=${TXN}`,
    `https://www.pharnos.com/tunnel/paddle?_ptxn=${TXN}&e=s&lang=fr`,
    `https://pharnos.com/modele?_ptxn=${TXN}`,
    `http://pharnos.com/tunnel/paddle?_ptxn=${TXN}&e=s&lang=fr`,
    'https://pharnos.com/tunnel/paddle?e=s&lang=fr',
    `https://pharnos.com/tunnel/paddle?_ptxn=txn_01m04prg3480m270fsmdd4w999&e=s&lang=fr`,
    'pas une url',
  ]
  for (const url of refuses) {
    assertEquals(
      lireTransactionCreee(201, reponse(url), DEMANDEE),
      { ok: false, erreur: 'paddle' },
      `accepté : ${url}`,
    )
  }
})

Deno.test('réponse : tout refus est NOTRE faute, jamais celle de l’acheteur', () => {
  // Le corps envoyé ne contient rien qu'il ait saisi : un 400 dit que NOTRE catalogue ou NOTRE clé
  // ne va pas. Le classer « données » lui reprocherait un e-mail correct, en boucle.
  for (const status of [400, 422, 401, 403, 500, 503]) {
    assertEquals(lireTransactionCreee(status, { error: {} }, DEMANDEE), {
      ok: false,
      erreur: 'paddle',
    })
  }
  // Une réponse 200 sans URL exploitable n'est pas un succès.
  assertEquals(lireTransactionCreee(200, { data: { id: TXN } }, DEMANDEE), {
    ok: false,
    erreur: 'paddle',
  })
  assertEquals(lireTransactionCreee(200, null, DEMANDEE), { ok: false, erreur: 'paddle' })
  // Un identifiant hors forme ne doit pas devenir une clé d'idempotence en base.
  assertEquals(lireTransactionCreee(201, reponse(RENDUE, 'txn_court'), DEMANDEE), {
    ok: false,
    erreur: 'paddle',
  })
})

Deno.test('tunnel-jumeau — la page rendue par le serveur est AFFICHABLE par la CSP', async () => {
  // Le jumeau du rail Chariow (`hotes-jumeaux`) vérifie qu'un hôte accepté est cadrable. Ici
  // l'URL rendue est une page à NOUS : ce qu'il faut vérifier n'est plus un hôte mais que le
  // chemin servi porte bien l'exception qui laisse vivre le tunnel. Sans ce test, retirer le bloc
  // `/tunnel/*` de `landing/_headers` — ou renommer le chemin d'un côté seulement — rendrait un
  // cadre BLANC après le clic « Payer », sans erreur ni repli : le pire des échecs.
  const texte = await Deno.readTextFile(new URL('../../../landing/_headers', import.meta.url))

  const blocs = new Map<string, string[]>()
  let courant = ''
  for (const ligne of texte.split('\n')) {
    if (!ligne.trim() || ligne.trimStart().startsWith('#')) continue
    if (ligne.startsWith('/')) blocs.set((courant = ligne.trim()), [])
    else if (courant) blocs.get(courant)!.push(ligne.trim())
  }

  // Le bloc le PLUS spécifique qui couvre le chemin du tunnel — `/*` couvre tout, il ne compte pas.
  const glob = [...blocs.keys()]
    .filter((g) => g !== '/*' && g.endsWith('/*') && CHEMIN_TUNNEL.startsWith(g.slice(0, -1)))
    .sort((a, b) => b.length - a.length)[0]
  assert(glob, `aucune exception _headers ne couvre ${CHEMIN_TUNNEL}`)

  const lignes = blocs.get(glob)!
  const csp = lignes.find((l) => l.startsWith('Content-Security-Policy:')) ?? ''
  const directive = (nom: string) => new RegExp(`${nom} ([^;]+)`).exec(csp)?.[1]?.trim() ?? ''

  // ⚠️ Le détachement est le SEUL mécanisme qui retire l'en-tête de `/*` : les règles Cloudflare
  // Pages se cumulent, et deux politiques présentes doivent TOUTES passer — la plus stricte gagne.
  assert(lignes.includes('! Content-Security-Policy'), `${glob} ne détache pas la CSP de /*`)
  assert(lignes.includes('! X-Frame-Options'), `${glob} ne détache pas X-Frame-Options`)

  assert(directive('script-src').includes('https://cdn.paddle.com'), 'Paddle.js resterait bloqué')
  assert(directive('frame-src').includes('https://*.paddle.com'), 'le tunnel Paddle serait bloqué')
  assert(directive('connect-src').includes('https://*.paddle.com'), 'Paddle.js ne pourrait rien appeler')
  // Cadrable par pharnos.com, et par personne d'autre.
  assertEquals(directive('frame-ancestors'), "'self'")

  // L'assouplissement reste BORNÉ à ce chemin : le reste du site n'exécute aucun script tiers.
  const racine = blocs.get('/*')!.find((l) => l.startsWith('Content-Security-Policy:')) ?? ''
  assertEquals(racine.includes('paddle.com'), false, 'la CSP globale s’est ouverte à Paddle')

  // La page existe vraiment là où le serveur promet de l'envoyer.
  const page = new URL(`../../../landing${CHEMIN_TUNNEL}.html`, import.meta.url)
  assert((await Deno.stat(page)).isFile, `${CHEMIN_TUNNEL}.html absent de landing/`)
})
