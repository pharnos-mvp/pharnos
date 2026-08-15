// Réconciliation ACTIVE des ventes (C1) — module PUR : le tri se teste sans réseau.
//
// Le 2026-08-14, la première vente réelle a payé pour l'apprendre : le Pulse Chariow n'est JAMAIS
// arrivé, et la commande n'est née que d'un geste manuel (webhook déclenché à la main). La chaîne
// d'encaissement ne doit plus JAMAIS être suspendue au webhook d'un tiers : un cron balaie les
// ventes réglées et fait naître ce que le webhook a manqué — par le MÊME chemin re-vérifié
// (`GET /v1/sales/{id}` → `lireVente` → `faireNaitreCommande`).
import { PRODUITS, STATUTS_PAYES } from './orders-core.ts'

/** Une ligne de `GET /v1/sales` — on n'en lit que le strict nécessaire au TRI. */
export interface VenteListee {
  id: string
  status: string
  productId: string | null
}

/** Extrait d'une réponse de liste ce que le tri consomme. Une ligne illisible est ignorée. */
export function lireListeVentes(brut: unknown): VenteListee[] {
  if (!brut || typeof brut !== 'object') return []
  const data = (brut as { data?: unknown }).data
  if (!Array.isArray(data)) return []
  const out: VenteListee[] = []
  for (const v of data) {
    if (!v || typeof v !== 'object') continue
    const o = v as Record<string, unknown>
    const id = typeof o.id === 'string' && o.id ? o.id : null
    if (!id) continue
    const produit = o.product && typeof o.product === 'object'
      ? (o.product as Record<string, unknown>).id
      : null
    out.push({
      id,
      status: typeof o.status === 'string' ? o.status : '',
      productId: typeof produit === 'string' && produit ? produit : null,
    })
  }
  return out
}

/**
 * Les ventes qui MÉRITENT une re-vérification individuelle : réglées, d'un produit UPGRADE, et
 * inconnues de `orders`.
 *
 * ⚠️ Le filtre produit tombe ICI, sur la liste, jamais après le `GET` individuel : le même magasin
 * vend les packs CTD Builder, et sans ce tri le balayage re-téléchargerait à CHAQUE tour les mêmes
 * ventes hors périmètre — du bruit au journal et des appels payés à l'API pour un verdict connu.
 *
 * `cap` borne le travail d'UN tour : un retard de plusieurs ventes se résorbe en quelques tours,
 * et un tour ne peut jamais s'emballer.
 */
export function ventesAReconcilier(
  liste: readonly VenteListee[],
  connues: ReadonlySet<string>,
  cap: number,
): string[] {
  const out: string[] = []
  for (const v of liste) {
    if (out.length >= cap) break
    // La MÊME liste de statuts que `lireVente` (`STATUTS_PAYES`) — jamais une copie locale :
    // admettre ici un statut que la naissance refuse fabriquerait une vente à jamais
    // non-naissable, re-vérifiée à chaque tour et occupant un créneau du cap pour rien.
    if (!STATUTS_PAYES.has(v.status.toLowerCase())) continue
    if (!v.productId || !PRODUITS[v.productId]) continue
    if (connues.has(v.id)) continue
    out.push(v.id)
  }
  return out
}
