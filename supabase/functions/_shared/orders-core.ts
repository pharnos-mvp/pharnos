// Noyau TESTABLE de la chaîne « paiement → commande » (U1) — aucun réseau, aucune API Deno hors
// WebCrypto. `chariow-pulse/index.ts` et `order-claim/index.ts` ne gardent que le transport.
//
// ─────────────────────────────────────────────────────────────────────────────────────────────
// LE PRINCIPE, ET IL N'EST PAS NÉGOCIABLE : rien de ce que le NAVIGATEUR affirme ne crée un droit.
//
// Aujourd'hui `landing/modele.js` traite `?paiement=ok` comme une preuve de règlement. Sans effet
// tant que la confirmation n'ouvre qu'un `mailto:` — mais le jour où elle déclenche le moteur,
// c'est le moteur offert au prix d'un paramètre d'URL. La commande naît donc du Pulse, lui-même
// re-vérifié auprès de Chariow, et le retour d'URL ne fait plus qu'AFFICHER un état déjà établi.
//
// Et le Pulse lui-même n'est pas cru : les Pulses Chariow ne portent AUCUN secret de signature
// (vérifié en console le 2026-07-28). Tout ce qu'on lui accorde, c'est de nous donner un
// IDENTIFIANT de vente à aller vérifier. Le reste — produit, montant, acheteur — vient de la
// réponse de l'API, jamais du corps reçu.
import { sha256Hex } from './share-auth.ts'

/* ───────────────────────────────── Le jeton de livraison ──────────────────────────────────── */

/** 256 bits en base64url — même contrat que le lien de partage (`share-auth.ts`). */
const TOKEN_BYTES = 32
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/

export const isValidDeliveryToken = (t: unknown): t is string =>
  typeof t === 'string' && TOKEN_RE.test(t)

/** Tire un jeton de livraison. `crypto.getRandomValues` — jamais `Math.random`. */
export function newDeliveryToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(TOKEN_BYTES))
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/**
 * Empreinte STOCKÉE du jeton — SHA-256 hexadécimal, et non un PBKDF2.
 *
 * ⚠️ Le plan écrivait « PBKDF2 » ; c'était une imprécision à ne pas recopier. Un PBKDF2 porte un
 * sel PAR LIGNE : retrouver la commande depuis son jeton exigerait de re-dériver le hash pour
 * chaque ligne de la table — un balayage complet à chaque appel de `order-status`, lequel est
 * interrogé toutes les 2 s pendant toute la génération. Le PBKDF2 protège les secrets à FAIBLE
 * entropie ; ce jeton en porte 256 bits tirés par le générateur du système, et l'on ne devine pas
 * la pré-image d'un SHA-256. Même choix, pour la même raison, que `share-auth.ts`.
 */
export const deliveryTokenHash = (token: string): Promise<string> => sha256Hex(token)

/** Durée de validité du lien de livraison (§2.3, étape 10). */
export const DELIVERY_TTL_DAYS = 30

export const deliveryExpiryFrom = (now: Date): Date =>
  new Date(now.getTime() + DELIVERY_TTL_DAYS * 24 * 60 * 60 * 1000)

/* ──────────────────────────── Le produit vendu, source de vérité ──────────────────────────── */

/**
 * `product_id` → l'offre et son régime. **C'est la SEULE autorité sur ce qui a été acheté.**
 *
 * Ni `custom_metadata.offre` ni le corps du Pulse ne servent ici, et c'est délibéré : les
 * métadonnées d'une vente sont posées à la création de la session, donc par notre `checkout` —
 * mais une vente conclue par un AUTRE chemin (lien de produit ouvert directement, réimport,
 * commande créée à la main dans la console) n'en porterait aucune. Le produit, lui, est toujours
 * là et vient de la réponse vérifiée de l'API.
 *
 * ⚠️ Le même magasin Chariow vend aussi les packs CTD Builder : le webhook recevra leurs ventes.
 * Un produit inconnu n'est PAS une erreur — c'est une vente qui ne nous concerne pas, et elle
 * s'acquitte en 200 sans rien créer. Répondre en erreur ferait rejouer Chariow cinq fois pour rien.
 */
export const PRODUITS: Record<string, { offre: 'up1' | 'up3'; essai: boolean }> = {
  prd_hf86pys5: { offre: 'up1', essai: false },
  prd_1u8jrq16: { offre: 'up3', essai: false },
  prd_g3norblb: { offre: 'up1', essai: true },
  prd_abtk4i8b: { offre: 'up3', essai: true },
}

/* ─────────────────────────────────────── Le Pulse ─────────────────────────────────────────── */

/** Le seul événement qui crée une commande. Tout autre s'acquitte sans rien faire. */
export const PULSE_EVENT_VENTE = 'successful.sale'

export interface PulseLu {
  event: string
  saleId: string
}

/**
 * Lit un Pulse. On n'en retient QUE deux choses : l'événement et l'identifiant de vente.
 *
 * Tout le reste du corps est ignoré — non par prudence de principe, mais parce qu'il n'est
 * authentifié par rien. Le lire donnerait à un tiers capable d'appeler notre URL le pouvoir de
 * décrire une vente ; le jeter lui laisse seulement celui de nous faire interroger l'API Chariow
 * sur un identifiant qui n'existe pas.
 */
export function lirePulse(body: unknown): PulseLu | { erreur: string } {
  if (!body || typeof body !== 'object') return { erreur: 'corps non structuré' }
  const b = body as Record<string, unknown>
  const event = typeof b.event === 'string'
    ? b.event
    : typeof b.type === 'string'
    ? b.type
    : ''
  if (!event) return { erreur: 'événement absent' }

  // L'identifiant se présente sous plusieurs formes selon les intégrations Chariow : à plat, ou
  // porté par l'objet `data`. On accepte les deux, on n'invente pas la troisième.
  const data = b.data && typeof b.data === 'object' ? b.data as Record<string, unknown> : b
  const brut = data.sale_id ?? data.saleId ?? data.id
  const saleId = typeof brut === 'string' ? brut.trim() : ''
  if (!saleId || saleId.length > 120) return { erreur: 'identifiant de vente absent ou hors bornes' }

  return { event, saleId }
}

/* ─────────────────────────── La vente, telle que l'API la confirme ────────────────────────── */

/** Statuts que Chariow donne à une vente réglée. Tout autre statut ⇒ aucune commande. */
const STATUTS_PAYES = new Set(['paid', 'completed', 'complete', 'success', 'successful', 'terminé', 'termine'])

export interface VenteVerifiee {
  saleId: string
  offre: 'up1' | 'up3'
  essai: boolean
  amountMinor: number | null
  currency: string | null
  email: string
  firstName: string | null
  lastName: string | null
  /** Référence tirée par le navigateur avant paiement. Absente = vente conclue hors de notre
   *  parcours : la commande se crée quand même (l'acheteur a payé), seul le PONT est indisponible
   *  et l'e-mail n°1 devient son unique chemin d'accès. */
  ref: string | null
  /**
   * Langue de l'acheteur, posée par `checkout` dans les métadonnées.
   *
   * Contrairement à `offre` et `essai`, elle est LÉGITIMEMENT lue des métadonnées : elle n'accorde
   * aucun droit et ne se déduit d'aucun produit. Le pire qu'un forgeur en tire, c'est de recevoir
   * son propre e-mail dans l'autre langue. Défaut `fr` — le marché principal.
   */
  lang: 'fr' | 'en'
}

const texte = (v: unknown, max: number): string | null => {
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t && t.length <= max ? t : null
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Lit la réponse de `GET /v1/sales/{id}` et n'en retient que ce qui est VÉRIFIÉ.
 *
 * Tolérante sur les alias de champs (les intégrations Chariow n'ont pas toutes la même forme),
 * mais STRICTE sur ce qui décide : sans statut payé et sans produit connu, il n'y a pas de
 * commande. **Refuser plutôt que corriger poliment** — une vente qu'on n'a pas su lire ne doit
 * jamais devenir une commande servie gratuitement.
 */
export function lireVente(raw: unknown): VenteVerifiee | { erreur: string } {
  if (!raw || typeof raw !== 'object') return { erreur: 'réponse non structurée' }
  const r = raw as Record<string, unknown>
  // L'API enveloppe parfois la ressource dans `data`.
  const v = (r.data && typeof r.data === 'object' && !Array.isArray(r.data))
    ? r.data as Record<string, unknown>
    : r

  const saleId = texte(v.id ?? v.sale_id, 120)
  if (!saleId) return { erreur: 'vente sans identifiant' }

  const statut = (texte(v.status ?? v.state ?? v.payment_status, 40) ?? '').toLowerCase()
  if (!STATUTS_PAYES.has(statut)) {
    return { erreur: `vente non réglée (statut « ${statut || 'absent'} »)` }
  }

  const productId = texte(v.product_id ?? v.productId, 60) ??
    (v.product && typeof v.product === 'object'
      ? texte((v.product as Record<string, unknown>).id, 60)
      : null)
  if (!productId) return { erreur: 'vente sans produit' }
  const produit = PRODUITS[productId]
  // Vente d'un AUTRE produit du magasin (packs CTD Builder) : ce n'est pas une erreur.
  if (!produit) return { erreur: `produit hors périmètre (${productId})` }

  const email = texte(v.customer_email ?? v.email, 254) ??
    (v.customer && typeof v.customer === 'object'
      ? texte((v.customer as Record<string, unknown>).email, 254)
      : null)
  // Sans adresse, aucun e-mail n°1 : l'acheteur n'aurait AUCUN moyen d'atteindre son livrable si
  // l'onglet se ferme. On refuse plutôt que de créer une commande orpheline.
  if (!email) return { erreur: 'vente sans adresse de contact' }

  const meta = (v.custom_metadata && typeof v.custom_metadata === 'object')
    ? v.custom_metadata as Record<string, unknown>
    : (v.metadata && typeof v.metadata === 'object')
    ? v.metadata as Record<string, unknown>
    : {}
  const refBrut = texte(meta.ref, 60)
  const ref = refBrut && UUID_RE.test(refBrut) ? refBrut.toLowerCase() : null

  const montant = Number(v.amount_minor ?? v.amount ?? v.total ?? NaN)

  return {
    saleId,
    offre: produit.offre,
    // ⚠️ Le régime vient du PRODUIT, jamais de `custom_metadata.essai` : une métadonnée absente
    // (vente hors parcours) ne doit pas faire passer une commande de recette pour une vente réelle,
    // ni l'inverse.
    essai: produit.essai,
    amountMinor: Number.isFinite(montant) && montant >= 0 ? Math.round(montant) : null,
    currency: texte(v.currency, 8),
    email,
    firstName: texte(v.customer_first_name ?? v.first_name, 120),
    lastName: texte(v.customer_last_name ?? v.last_name, 120),
    ref,
    lang: meta.lang === 'en' ? 'en' : 'fr',
  }
}

/* ──────────────────────────────────── Le pont (`order-claim`) ─────────────────────────────── */

/**
 * Nombre de rubriques attendues par phase, pour un job. Sert à `sections_total` et à l'affichage
 * « rubrique N sur M » — calculé à partir du gabarit, jamais écrit en dur dans un écran.
 */
export const REVUE_SECTIONS = ['terminology', 'relocations', 'findings', 'recommendations'] as const

/**
 * Une référence est-elle recevable au pont ? UUID strict — le pont interroge en boucle courte et
 * sans authentification (la commande n'existe pas encore), donc son entrée doit être la plus
 * étroite possible : une chaîne libre ouvrirait un balayage de table par tâtonnement.
 */
export const isValidRef = (v: unknown): v is string =>
  typeof v === 'string' && UUID_RE.test(v)
