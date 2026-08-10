// Contrat du cœur de `chariow-pulse`. Surface PUBLIQUE sans signature : chaque test décrit soit
// un Pulse hostile qui ne doit RIEN accorder, soit ce qui doit rester vrai d'une vente
// re-vérifiée avant qu'elle n'entre dans le registre des commandes.
import { assert, assertEquals } from 'jsr:@std/assert@1'

import {
  CHARIOW_SALES_ENDPOINT,
  CREDITS_PAR_OFFRE,
  lireSaleId,
  lireVente,
  produitVersOffre,
} from './chariow-pulse-core.ts'
import { OFFRES_CHARIOW, OFFRES_ESSAI } from './checkout-core.ts'

/* ── produitVersOffre ──────────────────────────────────────────────────────────────────────── */

Deno.test('produitVersOffre — reconnaît TOUT le catalogue public, dérivé de checkout-core', () => {
  for (const [offre, { productId }] of Object.entries(OFFRES_CHARIOW)) {
    const r = produitVersOffre(productId)
    assert(r, offre)
    assertEquals(r.offre, offre)
    assertEquals(r.essai, false)
  }
})

Deno.test('produitVersOffre — les produits de RECETTE sont reconnus ET marqués essai', () => {
  for (const [offre, { productId }] of Object.entries(OFFRES_ESSAI)) {
    const r = produitVersOffre(productId)
    assert(r, offre)
    assertEquals(r.offre, offre)
    assertEquals(r.essai, true)
  }
})

Deno.test('produitVersOffre — le bundle vaut 3 crédits, le document seul 1', () => {
  assertEquals(produitVersOffre(OFFRES_CHARIOW.up3.productId)?.credits, 3)
  assertEquals(produitVersOffre(OFFRES_CHARIOW.up1.productId)?.credits, 1)
  // La table des crédits couvre chaque offre du catalogue — un ajout au checkout sans crédit
  // défini tomberait au défaut 1 et vendrait un bundle pour un seul livrable.
  for (const offre of Object.keys(OFFRES_CHARIOW)) {
    assert(offre in CREDITS_PAR_OFFRE, `crédits non définis pour « ${offre} »`)
  }
})

Deno.test('produitVersOffre — un produit hors catalogue ne devient JAMAIS une offre', () => {
  for (const v of ['prd_inconnu9', '', 42, null, undefined, {}]) {
    assertEquals(produitVersOffre(v), null, String(v))
  }
})

/* ── lireSaleId ────────────────────────────────────────────────────────────────────────────── */

Deno.test('lireSaleId — trouve l’identifiant aux emplacements plausibles d’un Pulse', () => {
  for (const body of [
    { sale_id: 'sal_abc123' },
    { id: 'sal_abc123' },
    { data: { id: 'sal_abc123' } },
    { data: { sale: { id: 'sal_abc123' } } },
    { sale: { id: 'sal_abc123' } },
  ]) {
    assertEquals(lireSaleId(body), 'sal_abc123', JSON.stringify(body))
  }
})

Deno.test('lireSaleId — refuse tout ce qui ne peut pas entrer dans une URL d’API', () => {
  for (const id of ['../autre', 'sal abc', 'a'.repeat(81), 'ab', '', 42, null]) {
    assertEquals(lireSaleId({ sale_id: id }), null, String(id))
  }
  assertEquals(lireSaleId(null), null)
  assertEquals(lireSaleId('sal_abc123'), null)
})

Deno.test('lireSaleId — l’identifiant se concatène sans surprise à l’endpoint', () => {
  const id = lireSaleId({ data: { id: 'sal_x1-Y2_z3' } })
  assert(id)
  const url = new URL(`${CHARIOW_SALES_ENDPOINT}/${id}`)
  assertEquals(url.hostname, 'api.chariow.com')
  assertEquals(url.pathname, '/v1/sales/sal_x1-Y2_z3')
})

/* ── lireVente ─────────────────────────────────────────────────────────────────────────────── */

const vente = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: 'sal_abc123',
  status: 'completed',
  total: 45000,
  currency: 'XOF',
  product: { id: OFFRES_CHARIOW.up3.productId },
  customer: {
    email: 'awa@laboratoire.com',
    first_name: 'Awa',
    last_name: 'Diallo',
    phone: { number: '0196441776', country_code: 'BJ' },
    country: 'bj',
  },
  custom_metadata: { ref: '11de0d87-9e03-4d8a-9bb4-fbd971522423', offre: 'up3' },
  ...over,
})

Deno.test('lireVente — une vente aboutie du bundle donne up3, 3 crédits, la ref rattachée', () => {
  const r = lireVente(200, { data: vente() })
  assert(r.ok)
  assertEquals(r.vente.saleId, 'sal_abc123')
  assertEquals(r.vente.offre, 'up3')
  assertEquals(r.vente.essai, false)
  assertEquals(r.vente.credits, 3)
  assertEquals(r.vente.montant, 45000)
  assertEquals(r.vente.devise, 'XOF')
  assertEquals(r.vente.email, 'awa@laboratoire.com')
  assertEquals(r.vente.telephone, '0196441776')
  assertEquals(r.vente.pays, 'BJ')
  assertEquals(r.vente.ref, '11de0d87-9e03-4d8a-9bb4-fbd971522423')
})

Deno.test('lireVente — tolère un corps sans enveloppe `data` et les champs à plat', () => {
  const r = lireVente(200, vente({ product: undefined, product_id: OFFRES_CHARIOW.up1.productId }))
  assert(r.ok)
  assertEquals(r.vente.offre, 'up1')
  assertEquals(r.vente.credits, 1)
})

Deno.test('lireVente — une vente de RECETTE est enregistrable et marquée essai', () => {
  const r = lireVente(200, {
    data: vente({ product: { id: OFFRES_ESSAI.up3.productId }, total: 575 }),
  })
  assert(r.ok)
  assertEquals(r.vente.essai, true)
  assertEquals(r.vente.montant, 575)
})

Deno.test('lireVente — 404 = Pulse forgé : rejet définitif, aucun octroi', () => {
  const r = lireVente(404, { message: 'Not found' })
  assert(!r.ok)
  assertEquals(r.raison, 'introuvable')
})

Deno.test('lireVente — un statut non abouti refuse, et son détail nomme le cas', () => {
  for (const [statut, detail] of [
    ['refunded', 'refunded'],
    ['pending', 'inconnu_pending'],
    [undefined, 'absent'],
  ] as const) {
    const r = lireVente(200, { data: vente({ status: statut }) })
    assert(!r.ok, String(statut))
    assertEquals(r.raison, 'statut')
    assertEquals(r.detail, detail)
  }
})

Deno.test('lireVente — le statut se lit aussi dans payment_status, casse ignorée', () => {
  const r = lireVente(200, { data: vente({ status: undefined, payment_status: 'Completed' }) })
  assert(r.ok)
})

Deno.test('lireVente — produit réel mais hors catalogue : divergence signalée, pas d’octroi', () => {
  const r = lireVente(200, { data: vente({ product: { id: 'prd_autrechose' } }) })
  assert(!r.ok)
  assertEquals(r.raison, 'produit_inconnu')
})

Deno.test('lireVente — FERMÉ par défaut : montant ou e-mail absents refusent la vente', () => {
  const sansMontant = lireVente(200, { data: vente({ total: undefined }) })
  assert(!sansMontant.ok)
  assertEquals(sansMontant.raison, 'reponse')
  const sansEmail = lireVente(200, { data: vente({ customer: { first_name: 'Awa' } }) })
  assert(!sansEmail.ok)
  assertEquals(sansEmail.raison, 'reponse')
})

Deno.test('lireVente — montant en chaîne décimale arrondi, devise normalisée en majuscules', () => {
  const r = lireVente(200, { data: vente({ total: '69.00', currency: 'eur' }) })
  assert(r.ok)
  assertEquals(r.vente.montant, 69)
  assertEquals(r.vente.devise, 'EUR')
})

Deno.test('lireVente — une ref malformée tombe à null sans refuser la vente', () => {
  const r = lireVente(200, { data: vente({ custom_metadata: { ref: 'pas-un-uuid' } }) })
  assert(r.ok)
  assertEquals(r.vente.ref, null)
  // ... mais la métadonnée brute reste rejouée, bornée, pour le rapprochement au support.
  assertEquals(r.vente.metadata.ref, 'pas-un-uuid')
})

Deno.test('lireVente — les métadonnées sont bornées : 10 paires, clés 40, valeurs 255', () => {
  const meta: Record<string, string> = {}
  for (let i = 0; i < 20; i++) meta[`k${i}`.padEnd(60, 'x')] = 'v'.repeat(400)
  const r = lireVente(200, { data: vente({ custom_metadata: meta }) })
  assert(r.ok)
  const entrees = Object.entries(r.vente.metadata)
  assert(entrees.length <= 10)
  for (const [k, v] of entrees) {
    assert(k.length <= 40)
    assert(v.length <= 255)
  }
})

Deno.test('lireVente — réponse illisible ou 5xx : erreur transitoire, jamais un octroi', () => {
  for (const [status, corps] of [
    [500, null],
    [200, null],
    [200, 'pas du json objet'],
    [200, { data: { status: 'completed' } }],
  ] as const) {
    const r = lireVente(status as number, corps)
    assert(!r.ok, JSON.stringify(corps))
    assertEquals(r.raison, 'reponse')
  }
})
