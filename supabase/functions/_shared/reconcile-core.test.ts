// deno test — réconciliation active (C1). Module pur : aucun réseau.
import { assertEquals } from 'jsr:@std/assert@1'

import { lireListeVentes, ventesAReconcilier } from './reconcile-core.ts'

Deno.test('lireListeVentes : la forme réelle de l’API — et les lignes illisibles ignorées', () => {
  const brut = {
    message: 'success',
    data: [
      { id: 'SALE1', status: 'completed', product: { id: 'prd_hf86pys5', name: 'Upgrade' } },
      { id: 'SALE2', status: 'abandoned', product: { id: 'prd_hf86pys5' } },
      { id: 'SALE3', status: 'completed', product: { id: 'prd_autre' } },
      { status: 'completed' }, // sans id : ignorée
      'pas un objet',
      { id: 'SALE4', status: 'completed' }, // sans produit : gardée, triée plus loin
    ],
  }
  const liste = lireListeVentes(brut)
  assertEquals(liste.map((v) => v.id), ['SALE1', 'SALE2', 'SALE3', 'SALE4'])
  assertEquals(liste[0]?.productId, 'prd_hf86pys5')
  assertEquals(liste[3]?.productId, null)
  // Une réponse méconnaissable rend une liste vide, jamais une exception.
  assertEquals(lireListeVentes(null), [])
  assertEquals(lireListeVentes({ data: 'x' }), [])
})

Deno.test('ventesAReconcilier : réglées + produit UPGRADE + inconnues — et rien d’autre', () => {
  const liste = [
    { id: 'SALE1', status: 'completed', productId: 'prd_hf86pys5' }, // à réconcilier
    { id: 'SALE2', status: 'completed', productId: 'prd_ctd_builder' }, // hors périmètre : JAMAIS re-téléchargée
    { id: 'SALE3', status: 'abandoned', productId: 'prd_hf86pys5' }, // non réglée
    { id: 'SALE4', status: 'completed', productId: 'prd_g3norblb' }, // recette : à réconcilier aussi
    { id: 'SALE5', status: 'settled', productId: 'prd_1u8jrq16' }, // reversée = toujours une vente
    { id: 'SALE6', status: 'completed', productId: null }, // sans produit
    { id: 'SALE7', status: 'completed', productId: 'prd_hf86pys5' }, // déjà née
  ]
  const connues = new Set(['SALE7'])
  assertEquals(ventesAReconcilier(liste, connues, 10), ['SALE1', 'SALE4', 'SALE5'])
})

Deno.test('ventesAReconcilier : le cap borne le TOUR, jamais le rattrapage', () => {
  const liste = Array.from({ length: 12 }, (_, i) => ({
    id: `SALE${i}`,
    status: 'completed',
    productId: 'prd_hf86pys5',
  }))
  const tour1 = ventesAReconcilier(liste, new Set(), 5)
  assertEquals(tour1.length, 5)
  // Le tour suivant reprend là où l'idempotence a laissé : les 5 nées sont désormais connues.
  const tour2 = ventesAReconcilier(liste, new Set(tour1), 5)
  assertEquals(tour2.length, 5)
  assertEquals(new Set([...tour1, ...tour2]).size, 10)
})
