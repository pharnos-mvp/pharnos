// deno test — noyau « paiement → commande » (U1). Aucun réseau : tout ce qui décide est pur.
import { assertEquals, assertNotEquals, assertMatch } from 'jsr:@std/assert@1'

import {
  dejaLance,
  deliveryExpiryFrom,
  deliveryTokenHash,
  DOC_TYPES_VENDABLES,
  ETATS_DEPOSABLES,
  isValidDeliveryToken,
  peutDeposer,
  isValidRef,
  lireDemandeDepot,
  lirePulse,
  lireVente,
  MAX_SOURCE_BYTES,
  newDeliveryToken,
  PRODUITS,
  PULSE_EVENT_VENTE,
  DOSSIER_IMPOSSIBLE,
  jugerObjetSource,
  sourceObjectFolder,
  sourceObjectKey,
  statutHttpObjetSource,
  TYPE_SOURCE,
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

Deno.test('Pulse : la forme RÉELLE des Pulses prod — l’identifiant sous `sale.id`', () => {
  // Rejeu de la vente réelle du 14/08/2026 (console Chariow, 15/08) : le corps signé est
  // `{ event, sale: { id, … }, store, product, customer }` — pas de `data`, pas de `sale_id` à
  // plat. Avant ce test, ce corps s'acquittait `pulse_illisible` et la naissance retombait sur
  // la réconciliation (2 min de latence au lieu de l'instantané).
  assertEquals(
    lirePulse({
      event: PULSE_EVENT_VENTE,
      sale: { id: 'SALEX5MD9EZOYKITEPM', status: 'completed', custom_metadata: { offre: 'up1' } },
      store: { id: 'store_x' },
      product: { id: 'prd_hf86pys5' },
      customer: { id: 'cus_x' },
    }),
    { event: PULSE_EVENT_VENTE, saleId: 'SALEX5MD9EZOYKITEPM' },
  )
})

Deno.test('Pulse : `sale.id` prime sur l’`id` de racine — l’un est la vente, l’autre peut-être le Pulse', () => {
  // Le premier candidat UTILISABLE, jamais le premier non nul : un `id` de racine (ambigu) ou un
  // `sale_id: ''` ne doit ni détourner ni tuer le `sale.id` valide. Trouvé en revue de diff.
  for (const corps of [
    { event: PULSE_EVENT_VENTE, id: 'evt_123', sale: { id: 'SALEX5MD9EZOYKITEPM' } },
    { event: PULSE_EVENT_VENTE, sale_id: '', sale: { id: 'SALEX5MD9EZOYKITEPM' } },
    { event: PULSE_EVENT_VENTE, data: { sale: { id: 'SALEX5MD9EZOYKITEPM' } } },
    { event: PULSE_EVENT_VENTE, sale: { id: '  SALEX5MD9EZOYKITEPM  ' } },
  ]) {
    assertEquals(
      lirePulse(corps),
      { event: PULSE_EVENT_VENTE, saleId: 'SALEX5MD9EZOYKITEPM' },
      `perdu sur : ${JSON.stringify(corps)}`,
    )
  }
})

Deno.test('Pulse : un corps sans événement ni identifiant est refusé', () => {
  for (const mauvais of [
    null,
    'texte',
    {},
    { event: 'x' },
    { event: 'x', sale_id: '' },
    { sale_id: 'a' },
    { event: 'x', sale: { id: 42 } },
    { event: 'x', sale: 'SALE_9' },
    { event: 'x', sale: null },
    { event: 'x', sale: ['SALE_9'] },
    // `.` et `..` se normaliseraient en segments de chemin dans l'URL de re-vérification.
    { event: 'x', sale: { id: '..' } },
    { event: 'x', sale: { id: '.' } },
  ]) {
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
    paymentMethod: null,
    invoiceUrl: null,
  })
})

Deno.test('vente : le montant en OBJET — la forme RÉELLE de l’API — est lu, avec méthode et facture', () => {
  // Appris sur la PREMIÈRE vente réelle (2026-08-14) : `amount` arrive en objet
  // `{ value, formatted, currency }` — `Number(objet)` rendait NaN et la commande naissait sans
  // montant. La méthode de paiement et la facture officielle nourrissent le REÇU de l'e-mail n°1.
  const v = lireVente(vente({
    amount_minor: undefined,
    currency: undefined,
    amount: { value: 570, formatted: 'F CFA 570', currency: 'XOF' },
    payment: { method: { name: 'Credit Card (Visa/MasterCard)' } },
    invoice_download_url: 'https://download.chariow.com/sale/SALE123/invoice?sig=x',
  })) as Record<string, unknown>
  assertEquals(v.amountMinor, 570)
  assertEquals(v.currency, 'XOF')
  assertEquals(v.paymentMethod, 'Credit Card (Visa/MasterCard)')
  assertEquals(v.invoiceUrl, 'https://download.chariow.com/sale/SALE123/invoice?sig=x')
  // Un lien de facture non-HTTPS est écarté : il finirait cliquable dans un e-mail.
  const sans = lireVente(vente({ invoice_download_url: 'http://pirate.example/x' })) as Record<string, unknown>
  assertEquals(sans.invoiceUrl, null)
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

/* ─────────────────────────────────────── Le dépôt ──────────────────────────────────────────── */

Deno.test('dépôt : PDF uniquement — le refus tombe AU DÉPÔT, pas après paiement', () => {
  // `prepareUpgradeSource` entre par `readPdfPages` (pdf.js) : une image ou un DOCX n'échoueraient
  // pas ici mais bien plus loin, sur une pile d'appels déjà payée. Refuser tôt, et le DIRE.
  assertEquals('erreur' in lireDemandeDepot({ contentType: TYPE_SOURCE, size: 1024 }), false)
  for (const type of ['image/png', 'application/msword', 'text/plain', '', undefined]) {
    const d = lireDemandeDepot({ contentType: type, size: 1024 })
    assertEquals('erreur' in d, true, `type accepté à tort : ${String(type)}`)
  }
})

Deno.test('dépôt : la taille est bornée des DEUX côtés', () => {
  assertEquals('erreur' in lireDemandeDepot({ contentType: TYPE_SOURCE, size: 0 }), true)
  assertEquals('erreur' in lireDemandeDepot({ contentType: TYPE_SOURCE, size: -1 }), true)
  assertEquals('erreur' in lireDemandeDepot({ contentType: TYPE_SOURCE, size: 'gros' }), true)
  assertEquals('erreur' in lireDemandeDepot({ contentType: TYPE_SOURCE, size: MAX_SOURCE_BYTES }), false)
  assertEquals('erreur' in lireDemandeDepot({ contentType: TYPE_SOURCE, size: MAX_SOURCE_BYTES + 1 }), true)
})

Deno.test('dépôt : un type ABSENT retombe sur `rcp` — le seul livrable aujourd’hui', () => {
  // Un appelant qui ne se prononce pas n'est pas un appelant qui se trompe. Et le repli tombe sur
  // `rcp` précisément parce que c'est le seul type que la chaîne sait LIVRER (cf. le test
  // « vendable mais non livrable » plus bas — notice et labeling refusent tant que leur gabarit
  // d'assemblage n'existe pas).
  const d = lireDemandeDepot({ contentType: TYPE_SOURCE, size: 10 })
  assertEquals((d as { docType: string }).docType, 'rcp')
})

Deno.test('dépôt : AUCUNE chaîne du client n’entre dans la clé Storage', () => {
  // ⚠️ C'est ce qui fait disparaître le piège « Invalid key » de Supabase par CONSTRUCTION, au lieu
  // de dépendre d'une fonction d'assainissement qu'on peut oublier d'appeler. Le nom d'origine du
  // fichier n'est pas perdu pour autant : il vit en base, où le jeu de caractères est libre.
  const cle = sourceObjectKey('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222')
  assertEquals(
    cle,
    'orders/11111111-1111-1111-1111-111111111111/22222222-2222-2222-2222-222222222222/source.pdf',
  )
  // Purement ASCII, aucun caractère de traversée de chemin.
  assertMatch(cle, /^[A-Za-z0-9/_.-]+$/)
  assertEquals(cle.includes('..'), false)
})

/* ─────────────────────────────────── Les gardes d'état ─────────────────────────────────────── */

Deno.test('gardes : on ne dépose que depuis un état déposable', () => {
  for (const s of ['paid', 'source_uploaded', 'gated_out']) {
    assertEquals(peutDeposer(s), true, s)
  }
  for (const s of ['running', 'done', 'failed', 'inconnu', '']) {
    assertEquals(peutDeposer(s), false, s)
  }
})

Deno.test('gardes : `running` et `done` sont des points de NON-RETOUR', () => {
  // ⚠️ Le test qui aurait rendu visible le blocker de la revue. La branche de refus de `order-gate`
  // réécrivait `orders.status` AVANT cette garde, la rendant inatteignable : on relançait alors
  // autant de traitements qu'on voulait sur une seule commande payée, à ~2 $ pièce, en alternant
  // un faux document (qui remettait l'état à `gated_out`) et un vrai (qui relançait).
  assertEquals(dejaLance('running'), true)
  assertEquals(dejaLance('done'), true)
  for (const s of ['paid', 'source_uploaded', 'gated_out', 'failed']) {
    assertEquals(dejaLance(s), false, s)
  }
  // Les deux ensembles ne se recouvrent JAMAIS : un état ne peut pas être à la fois déposable et
  // lancé, sans quoi l'ordre des gardes redeviendrait significatif.
  for (const s of ETATS_DEPOSABLES) assertEquals(dejaLance(s), false, s)
})

Deno.test('gardes : `ETATS_DEPOSABLES` et `peutDeposer` ne peuvent pas diverger', () => {
  // La liste part en `.in(...)` du compare-and-swap SQL, la fonction sert à l'écran : deux
  // définitions de la même règle qui glisseraient l'une par rapport à l'autre rouvriraient un
  // chemin d'écriture que l'affichage croirait fermé.
  for (const s of ETATS_DEPOSABLES) assertEquals(peutDeposer(s), true, s)
  assertEquals(ETATS_DEPOSABLES.length, 3)
})

Deno.test('dépôt : les clés du PROTOTYPE ne sont pas des types de document', () => {
  // ⚠️ `'constructor' in CONFORMITY_SPECS` vaut `true`, comme `toString` et `valueOf`. Avec un `in`,
  // `docType: 'constructor'` faisait de `spec` un `Object`, et `flattenRubrics` levait une
  // `TypeError` non capturée : 500 SANS en-tête CORS — le navigateur ne voit qu'une panne réseau —
  // et un job définitivement inutilisable.
  for (const poison of ['constructor', 'toString', 'valueOf', 'hasOwnProperty', '__proto__']) {
    assertEquals(DOC_TYPES_VENDABLES.has(poison), false, poison)
    assertEquals('erreur' in lireDemandeDepot({ contentType: TYPE_SOURCE, size: 10, docType: poison }), true, poison)
  }
})

Deno.test('dépôt : un type PRÉSENT mais inconnu fait REFUSER — il ne retombe pas sur `rcp`', () => {
  // ⚠️ Le défaut que ce test ferme a coûté une commande entière. La landing nomme l'étiquetage
  // `etiquetage`, la liste blanche le nomme `labeling` : avec un repli muet, l'acheteur d'un
  // étiquetage voyait son document enregistré comme un RCP, jugé contre le gabarit du RCP, et
  // refusé — trois fois, jusqu'à épuisement des dépôts d'une commande payée, sans qu'aucun écran
  // ne puisse expliquer pourquoi. Un repli silencieux sur le mauvais gabarit est pire qu'un refus.
  for (const inconnu of ['etiquetage', 'pght', 'cover', 'smpc', 'RCP']) {
    const d = lireDemandeDepot({ contentType: TYPE_SOURCE, size: 10, docType: inconnu })
    assertEquals('erreur' in d, true, `accepté à tort : ${inconnu}`)
  }
  // Le type LIVRABLE passe sous son propre nom ; les deux autres relèvent du test « vendable mais
  // non livrable » — refusés AVANT la dépense tant que leur assemblage n'existe pas.
  const rcp = lireDemandeDepot({ contentType: TYPE_SOURCE, size: 10, docType: 'rcp' })
  assertEquals((rcp as { docType: string }).docType, 'rcp')
  // Un type ABSENT, lui, retombe sur `rcp` : c'est un appelant qui ne se prononce pas, pas un
  // appelant qui se trompe.
  assertEquals(
    (lireDemandeDepot({ contentType: TYPE_SOURCE, size: 10 }) as { docType: string }).docType,
    'rcp',
  )
})

/* ──────────────────────────────────────── Le pont ──────────────────────────────────────────── */

Deno.test('pont : seule une référence UUID est recevable', () => {
  assertEquals(isValidRef(REF), true)
  assertEquals(isValidRef(REF.toUpperCase()), true)
  for (const mauvaise of ['', 'abc', REF + 'x', "' or '1'='1", null, 42, {}]) {
    assertEquals(isValidRef(mauvaise), false, `accepté à tort : ${String(mauvaise)}`)
  }
})

/* ───────────────────────── L’objet source, tel que Storage le rapporte ─────────────────────── */

Deno.test('objet source : le dossier se dérive de la clé, et une clé sans dossier ne liste RIEN', () => {
  assertEquals(sourceObjectFolder(sourceObjectKey(REF, REF)), `orders/${REF}/${REF}`)
  // ⚠️ Le défaut que ce test attrape : `slice(0, lastIndexOf('/'))` sur une clé sans séparateur rend
  // `slice(0, -1)`, donc `source.pd` — un préfixe qui liste un dossier VOISIN, dont un objet
  // homonyme validerait une source jamais déposée. Une chaîne vide, elle, ne liste rien.
  // ⚠️ Et le repli n'est PAS la chaîne vide : `list('')` liste la RACINE du bucket — le pire des
  // deux mondes. C'est un préfixe qui ne peut PAS exister (`orders/` ne contient que des UUID).
  for (const sansDossier of ['source.pdf', '/source.pdf', '']) {
    assertEquals(sourceObjectFolder(sansDossier), DOSSIER_IMPOSSIBLE, sansDossier)
  }
})

Deno.test('objet source : absent, c’est 409 — la demande est bonne, c’est l’état qui ne l’est pas', () => {
  for (const rien of [null, undefined]) {
    const v = jugerObjetSource(rien)
    assertEquals(v.ok, false)
    assertEquals((v as { refus: string }).refus, 'absent')
    assertEquals(statutHttpObjetSource(v), 409)
  }
})

Deno.test('objet source : le type RÉEL prime sur celui qui a été déclaré au dépôt', () => {
  // Une URL signée ne contraint ni le type ni la taille : le `contentType` de la demande est une
  // DÉCLARATION. Seule cette métadonnée-ci est mesurée par Storage à la réception.
  const v = jugerObjetSource({ metadata: { mimetype: 'application/zip', size: 10 } })
  assertEquals(v.ok, false)
  assertEquals((v as { refus: string }).refus, 'type')
  assertEquals(statutHttpObjetSource(v), 400)
  assertEquals(jugerObjetSource({ metadata: { mimetype: TYPE_SOURCE, size: 10 } }).ok, true)
})

Deno.test('objet source : un type ABSENT ne fait pas refuser', () => {
  // Un dépôt sans en-tête de type laisse `mimetype` vide. Refuser là-dessus rejetterait un PDF
  // valide sans recours, alors que le navigateur le rouvre juste après et échouerait franchement.
  const v = jugerObjetSource({ metadata: { size: 1024 } })
  assertEquals(v.ok, true)
  assertEquals((v as { taille: number | null }).taille, 1024)
  // Métadonnées entièrement absentes : présent vaut mieux que refusé, la taille reste inconnue.
  assertEquals(jugerObjetSource({}).ok, true)
  assertEquals((jugerObjetSource({}) as { taille: number | null }).taille, null)
})

Deno.test('objet source : au-delà du plafond, c’est 413 — jamais un 400 qui accuse la requête', () => {
  const v = jugerObjetSource({ metadata: { mimetype: TYPE_SOURCE, size: MAX_SOURCE_BYTES + 1 } })
  assertEquals(v.ok, false)
  assertEquals((v as { refus: string }).refus, 'taille')
  assertEquals(statutHttpObjetSource(v), 413)
  // La borne est inclusive : un fichier pile au plafond passe.
  assertEquals(jugerObjetSource({ metadata: { size: MAX_SOURCE_BYTES } }).ok, true)
})

Deno.test('dépôt : pays, activité et nom de fichier voyagent — validés, jamais devinés', () => {
  // ⚠️ Le trou que U5 a découvert : ces valeurs n'atteignaient JAMAIS le serveur, et la mention de
  // vigilance 4.8 — celle qui varie par pays, le cœur du « checking standard » — n'était donc
  // jamais injectée dans les prompts de production.
  const d = lireDemandeDepot({
    contentType: TYPE_SOURCE,
    size: 10,
    docType: 'rcp',
    sourceName: 'RCP Gynoril v2.pdf',
    country: 'BJ',
    activity: 'renouv',
  }) as { sourceName: string; country: string; activity: string }
  assertEquals(d.country, 'BJ')
  assertEquals(d.activity, 'renouv')
  // Les caractères de contrôle sont expurgés du nom — il part dans un en-tête de livrable.
  assertEquals(d.sourceName, 'RCP Gynoril v2.pdf')

  // Hors format ⇒ IGNORÉ, jamais corrigé : un pays inventé injecterait la mention d'un AUTRE pays
  // dans un dossier réel, une activité fausse ferait écrire « Sans objet » sur un renouvellement.
  const mauvais = lireDemandeDepot({
    contentType: TYPE_SOURCE,
    size: 10,
    country: 'benin',
    activity: 'renewal-2026',
  }) as { country: string | null; activity: string | null; sourceName: string | null }
  assertEquals(mauvais.country, null)
  assertEquals(mauvais.activity, null)
  assertEquals(mauvais.sourceName, null)
})

Deno.test('dépôt : `bj` en minuscules PASSE — c’est la valeur RÉELLE de l’appelant réel', () => {
  // ⚠️ Le manifeste de la landing porte `bj`, `ci`… en minuscules, et le motif strict `^[A-Z]{2}$`
  // les jetait en SILENCE : le trou « la 4.8 n'entre dans aucun prompt » restait ouvert sur le
  // seul chemin de production, le pont. Le test précédent vérifiait `benin` — jamais `bj`. Tester
  // la valeur que l'appelant envoie VRAIMENT, pas celle qu'on imagine.
  const d = lireDemandeDepot({ contentType: TYPE_SOURCE, size: 10, country: 'bj' }) as {
    country: string | null
  }
  assertEquals(d.country, 'BJ')
})

Deno.test('dépôt : un type VENDABLE mais non LIVRABLE refuse AVANT la dépense, en le disant', () => {
  // ⚠️ L'assemblage U5 est RCP seul (en-têtes en dur, titres EN du seul gabarit RCP) : une notice
  // déposée aurait traversé ~60 appels (~2 $) puis échoué À L'ASSEMBLAGE — `failed` après la
  // dépense, le pire ordre possible. Le refus vit à l'entrée, et son message dit la vérité.
  for (const pasEncore of ['notice', 'labeling']) {
    const d = lireDemandeDepot({ contentType: TYPE_SOURCE, size: 10, docType: pasEncore })
    assertEquals('erreur' in d, true, pasEncore)
    assertMatch((d as { erreur: string }).erreur, /ouvre bientôt/)
  }
  // Le backtick sort du nom : il part dans une portée de code markdown du livrable.
  const nom = lireDemandeDepot({
    contentType: TYPE_SOURCE,
    size: 10,
    sourceName: 'RCP `x` v2.pdf',
  }) as { sourceName: string | null }
  assertEquals(nom.sourceName, 'RCP x v2.pdf')
})

