// Noyau TESTABLE de l'Edge `chariow-pulse` — lecture d'un Pulse et d'une vente re-vérifiée.
//
// Même partage que `checkout-core` : tout ce qui décide (extraction de l'identifiant de vente,
// mapping produit → offre → crédits, validation de la vente confirmée par l'API) se teste en
// Deno sans réseau ; `index.ts` ne garde que le transport.
//
// Invariant de sécurité central (PLAN-CHARIOW §7-§8) : un Pulse n'a AUCUNE signature — c'est un
// signal, jamais une preuve. Rien de ce que le Pulse contient n'entre en base : on n'en extrait
// que l'identifiant de vente, et TOUTES les données enregistrées viennent de la réponse de
// `GET /v1/sales/{id}` obtenue avec NOTRE clé serveur.

import { OFFRES_CHARIOW, OFFRES_ESSAI } from './checkout-core.ts'

export const CHARIOW_SALES_ENDPOINT = 'https://api.chariow.com/v1/sales'

/** Crédits accordés par offre — le bundle vaut TROIS livrables sur la même commande, jamais
 *  trois commandes. C'est la seule table qui traduit un paiement en droit de production ;
 *  `order-run` (L5) la lira depuis `orders.credits_total`, jamais d'ici. */
export const CREDITS_PAR_OFFRE: Record<string, number> = {
  up1: 1,
  up3: 3,
}

export type OffreReconnue = { offre: string; essai: boolean; credits: number }

/** Produit encaissé → offre vendue. DÉRIVÉ des deux catalogues de `checkout-core`, jamais
 *  recopié : un produit ajouté au checkout est reconnu ici sans seconde liste à maintenir,
 *  et un produit inconnu — même réellement payé — n'est PAS enregistré en aveugle : il
 *  signale une divergence de catalogue à régler, pas une vente à honorer en silence. */
export function produitVersOffre(productId: unknown): OffreReconnue | null {
  if (typeof productId !== 'string') return null
  for (const [essai, catalogue] of [
    [false, OFFRES_CHARIOW],
    [true, OFFRES_ESSAI],
  ] as const) {
    for (const [offre, produit] of Object.entries(catalogue)) {
      if (produit.productId === productId) {
        return { offre, essai, credits: CREDITS_PAR_OFFRE[offre] ?? 1 }
      }
    }
  }
  return null
}

// L'identifiant de vente sert à construire une URL d'API : forme fermée, jamais interpolée
// telle quelle. Tout caractère hors alphanumérique/tiret/underscore est un forgeage.
const SALE_ID_RE = /^[A-Za-z0-9_-]{4,80}$/

/**
 * Extrait l'identifiant de vente d'un corps de Pulse — la SEULE donnée qu'on lit d'un Pulse.
 *
 * La forme exacte du payload n'est pas contractuelle (aucune doc publiée, aucune signature) :
 * on cherche l'identifiant aux emplacements plausibles, et une extraction fausse est sans
 * danger — elle échoue à la re-vérification, qui est la vraie porte.
 */
export function lireSaleId(body: unknown): string | null {
  if (typeof body !== 'object' || body === null) return null
  const b = body as Record<string, unknown>
  const conteneurs = [b, b.data, b.sale, (b.data as Record<string, unknown> | undefined)?.sale]
  for (const c of conteneurs) {
    if (typeof c !== 'object' || c === null) continue
    for (const cle of ['sale_id', 'id']) {
      const v = (c as Record<string, unknown>)[cle]
      if (typeof v === 'string' && SALE_ID_RE.test(v)) return v
    }
  }
  return null
}

export type VenteValidee = {
  saleId: string
  purchaseId: string | null
  offre: string
  essai: boolean
  credits: number
  montant: number
  devise: string
  email: string
  prenom: string | null
  nom: string | null
  telephone: string | null
  pays: string | null
  /** Référence de commande générée par NOTRE page (`custom_metadata.ref`) — null si absente
   *  ou malformée : elle relie la vente au dossier du navigateur, elle ne conditionne rien. */
  ref: string | null
  metadata: Record<string, string>
}

export type LectureVente =
  | { ok: true; vente: VenteValidee }
  | {
      ok: false
      /** `introuvable` = vente inexistante (Pulse forgé : rejet DÉFINITIF, aucun octroi) ;
       *  `statut_ferme` = vente réelle mais SANS droit (remboursée, échouée…) — définitif ;
       *  `statut_inconnu` = statut absent ou hors nomenclature — TRANSITOIRE : le rejeu
       *  Chariow (jusqu'à 24 h) laisse le temps d'ajouter un statut légitime à la
       *  nomenclature sans perdre la vente ;
       *  `produit_inconnu` = payée mais hors catalogue (divergence à régler à la main) ;
       *  `reponse` = réponse illisible ou champ requis absent (transitoire ou schéma à revoir). */
      raison: 'introuvable' | 'statut_ferme' | 'statut_inconnu' | 'produit_inconnu' | 'reponse'
      detail?: string
    }

const REF_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Statuts de vente ABOUTIE côté Chariow (console : « Terminé »). Fermé par défaut : un statut
// absent ou inconnu n'accorde RIEN — il se lit dans les logs et s'ajoute ici les yeux ouverts,
// jamais l'inverse. C'est le pendant serveur de « aucun octroi sur la seule foi d'un Pulse ».
const STATUTS_ABOUTIS = new Set(['completed', 'complete', 'paid', 'success', 'successful'])
// Statuts qui désignent une vente réelle mais SANS droit : rejet définitif, pas de rejeu utile.
const STATUTS_FERMES = new Set(['refunded', 'failed', 'cancelled', 'canceled', 'disputed', 'expired'])

const texte = (v: unknown, max: number): string | null => {
  if (typeof v !== 'string') return null
  const s = v.trim()
  return s.length >= 1 && s.length <= max ? s : null
}

/** Montant tel que confirmé par le processeur — entier, dans la devise de la vente. Chariow
 *  publie des montants en unités (le FCFA n'a pas de centime) ; un décimal EUR est arrondi. */
const montantDe = (data: Record<string, unknown>): number | null => {
  for (const cle of ['total', 'amount', 'total_amount', 'price']) {
    const v = data[cle]
    if (typeof v === 'number' && Number.isFinite(v) && v >= 0) return Math.round(v)
    if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) {
      const n = Number(v)
      if (n >= 0) return Math.round(n)
    }
  }
  return null
}

/**
 * Lit la réponse de `GET /v1/sales/{id}` et la réduit à une vente enregistrable, ou à un refus
 * nommé. FERMÉ par défaut : tout champ requis absent ou hors forme refuse la vente — on
 * n'enregistre pas un registre comptable « au mieux ». Les champs optionnels (nom, téléphone,
 * pays, ref) tombent à null sans faire échouer la lecture.
 */
export function lireVente(status: number, corps: unknown): LectureVente {
  if (status === 404) return { ok: false, raison: 'introuvable' }
  const data =
    typeof corps === 'object' && corps !== null
      ? ((corps as { data?: unknown }).data ?? corps)
      : null
  if (status !== 200 || typeof data !== 'object' || data === null) {
    return { ok: false, raison: 'reponse', detail: `http_${status}` }
  }
  const d = data as Record<string, unknown>

  const saleId = [d.id, d.sale_id].find((v) => typeof v === 'string' && SALE_ID_RE.test(v)) as
    | string
    | undefined
  if (!saleId) return { ok: false, raison: 'reponse', detail: 'sans_id' }

  const brutStatut = [d.status, d.payment_status, d.state].find((v) => typeof v === 'string')
  const statut = typeof brutStatut === 'string' ? brutStatut.trim().toLowerCase() : null
  if (statut === null || !STATUTS_ABOUTIS.has(statut)) {
    // Deux refus distincts parce qu'ils PILOTENT les rejeux différemment : une vente fermée
    // (remboursée, échouée) ne changera plus — rejet définitif ; un statut absent ou hors
    // nomenclature est peut-être un légitime qu'on ne connaît pas encore — laisser Chariow
    // rejouer donne 24 h pour l'ajouter à STATUTS_ABOUTIS sans perdre la vente.
    if (statut !== null && STATUTS_FERMES.has(statut)) {
      return { ok: false, raison: 'statut_ferme', detail: statut }
    }
    return { ok: false, raison: 'statut_inconnu', detail: statut ?? 'absent' }
  }

  const produit = d.product as Record<string, unknown> | undefined
  const productId = [d.product_id, produit?.id].find((v) => typeof v === 'string')
  const reconnu = produitVersOffre(productId)
  if (!reconnu) return { ok: false, raison: 'produit_inconnu' }

  const montant = montantDe(d)
  const devise = texte(d.currency, 3)?.toUpperCase() ?? 'XOF'
  if (montant === null) return { ok: false, raison: 'reponse', detail: 'sans_montant' }

  const client = (d.customer ?? d.buyer ?? {}) as Record<string, unknown>
  const email = [client.email, d.email].map((v) => texte(v, 254)).find((v) => v && EMAIL_RE.test(v))
  // L'e-mail est le SEUL canal de livraison d'un acheteur sans compte : sans lui la ligne
  // serait un paiement inhonorable — on refuse, le rejeu Chariow et les logs le feront voir.
  if (!email) return { ok: false, raison: 'reponse', detail: 'sans_email' }

  const tel = client.phone ?? d.phone
  const telephone =
    typeof tel === 'string'
      ? texte(tel, 32)
      : texte((tel as Record<string, unknown> | null)?.number, 32)

  // custom_metadata : NOS clés (`ref`, `offre`, `essai`), posées par le checkout — bornées et
  // rejouées telles quelles en base pour le rapprochement, jamais interprétées comme un droit.
  const brutMeta = (d.custom_metadata ?? d.metadata ?? {}) as Record<string, unknown>
  const metadata: Record<string, string> = {}
  for (const [k, v] of Object.entries(brutMeta).slice(0, 10)) {
    if (typeof v === 'string') metadata[k.slice(0, 40)] = v.slice(0, 255)
  }
  const ref = typeof metadata.ref === 'string' && REF_RE.test(metadata.ref) ? metadata.ref : null

  return {
    ok: true,
    vente: {
      saleId,
      purchaseId: texte(d.purchase_id ?? (d.purchase as Record<string, unknown>)?.id, 80),
      offre: reconnu.offre,
      essai: reconnu.essai,
      credits: reconnu.credits,
      montant,
      devise,
      email,
      prenom: texte(client.first_name, 100),
      nom: texte(client.last_name, 100),
      telephone,
      pays: texte(client.country ?? d.country, 8)?.toUpperCase() ?? null,
      ref,
      metadata,
    },
  }
}
