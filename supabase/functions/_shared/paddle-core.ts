// Noyau du rail PADDLE — module PUR, testable sans réseau.
//
// POURQUOI UN SECOND RAIL. Aucun processeur ne couvre les deux besoins : Chariow est le seul à
// encaisser le mobile money UEMOA, Paddle est merchant of record — il devient le vendeur légal,
// s'immatricule et reverse la TVA dans plus de 100 juridictions à notre place. Le catalogue, la
// naissance de commande et TOUT l'après-paiement restent communs : seul le canal change.
//
// ⚠️ Les invariants de sécurité du rail Chariow s'appliquent ici À L'IDENTIQUE, et pour les mêmes
// raisons :
//   • le webhook n'est cru que sur un IDENTIFIANT de transaction, jamais sur son contenu ;
//   • l'OFFRE vient du catalogue re-vérifié (`price.custom_data.offre` de la réponse API), jamais
//     des métadonnées de la transaction — celles-ci transitent par le navigateur au checkout ;
//   • le RÉGIME d'essai vient de l'ENVIRONNEMENT (sandbox), jamais d'une donnée : un acheteur ne
//     doit pas pouvoir se déclarer en recette.
import { OFFRES_SERVABLES, type Offre, type VenteVerifiee } from './orders-core.ts'

/** Le seul événement qui crée une commande. Tout autre s'acquitte sans rien faire. */
export const PADDLE_EVENT_VENTE = 'transaction.completed'

/** Statuts d'une transaction Paddle qui vaut paiement encaissé. */
const STATUTS_PAYES_PADDLE = new Set(['completed', 'paid'])

/**
 * Identifiant de transaction Paddle : `txn_` + 26 caractères base32 minuscules.
 * Épinglé pour la même raison que `SALE_ID_RE` : il part dans une URL d'API.
 */
const TXN_ID_RE = /^txn_[a-z0-9]{26}$/

export interface EvenementPaddle {
  eventType: string
  transactionId: string
}

/**
 * Lit un webhook Paddle. On n'en retient QUE deux choses : le type d'événement et l'identifiant de
 * transaction — exactement comme pour un Pulse Chariow, et pour la même raison : tout le reste du
 * corps est re-demandé à l'API, qui, elle, ne ment pas.
 */
export function lireEvenementPaddle(body: unknown): EvenementPaddle | { erreur: string } {
  if (!body || typeof body !== 'object') return { erreur: 'corps non structuré' }
  const b = body as Record<string, unknown>
  const eventType = typeof b.event_type === 'string' ? b.event_type : ''
  if (!eventType) return { erreur: 'événement absent' }

  const data = b.data && typeof b.data === 'object' ? b.data as Record<string, unknown> : null
  const brut = typeof data?.id === 'string' ? data.id.trim() : ''
  if (!TXN_ID_RE.test(brut)) return { erreur: 'identifiant de transaction absent ou hors format' }

  return { eventType, transactionId: brut }
}

/** Somme en plus petite unité, telle que Paddle la rend : une CHAÎNE d'entier. */
function montantMineur(v: unknown): number | null {
  if (typeof v !== 'string' || !/^-?\d+$/.test(v)) return null
  const n = Number(v)
  return Number.isSafeInteger(n) ? n : null
}

/**
 * Traduit une transaction Paddle RE-VÉRIFIÉE en vente exploitable par `faireNaitreCommande`.
 *
 * `essai` n'est PAS lu de la transaction : il est imposé par l'appelant depuis l'environnement
 * (bac à sable ou production). Une donnée ne doit jamais pouvoir déclarer un régime de recette.
 */
export function lireTransactionPaddle(
  raw: unknown,
  essai: boolean,
): VenteVerifiee | { erreur: string } {
  if (!raw || typeof raw !== 'object') return { erreur: 'réponse non structurée' }
  const r = raw as Record<string, unknown>
  // L'API enveloppe la ressource dans `data`.
  const t = (r.data && typeof r.data === 'object' && !Array.isArray(r.data))
    ? r.data as Record<string, unknown>
    : r

  const saleId = typeof t.id === 'string' ? t.id.trim() : ''
  if (!TXN_ID_RE.test(saleId)) return { erreur: 'transaction sans identifiant' }

  const statut = typeof t.status === 'string' ? t.status.toLowerCase() : ''
  if (!STATUTS_PAYES_PADDLE.has(statut)) return { erreur: `transaction non réglée (${statut || '?'})` }

  // ── L'offre vient du CATALOGUE, jamais des métadonnées de la transaction ──────────────────────
  // `custom_data` de la transaction transite par le navigateur au moment du checkout ; celui du
  // PRIX est posé par nous au catalogue et rendu par l'API re-vérifiée. C'est le jumeau exact de
  // « le régime vient du produit » côté Chariow.
  const items = Array.isArray(t.items) ? t.items : []
  let offre: Offre | null = null
  for (const item of items) {
    const prix = (item as Record<string, unknown>)?.price
    const meta = prix && typeof prix === 'object'
      ? (prix as Record<string, unknown>).custom_data
      : null
    const candidate = meta && typeof meta === 'object'
      ? (meta as Record<string, unknown>).offre
      : null
    if (typeof candidate === 'string' && OFFRES_SERVABLES.has(candidate)) {
      offre = candidate as Offre
      break
    }
  }
  // Le catalogue Paddle porte AUSSI les audits et le CTD Builder : une transaction hors périmètre
  // de cette chaîne s'acquitte sans rien créer, exactement comme les packs CTD chez Chariow.
  if (!offre) return { erreur: 'produit hors périmètre' }

  const totaux = (t.details && typeof t.details === 'object')
    ? (t.details as Record<string, unknown>).totals as Record<string, unknown> | undefined
    : undefined
  const amountMinor = montantMineur(totaux?.grand_total) ?? montantMineur(totaux?.total)
  const currency = typeof totaux?.currency_code === 'string'
    ? totaux.currency_code
    : typeof t.currency_code === 'string'
    ? t.currency_code
    : null

  const client = (t.customer && typeof t.customer === 'object')
    ? t.customer as Record<string, unknown>
    : null
  const email = typeof client?.email === 'string' ? client.email.trim() : ''
  // Sans adresse, la commande serait orpheline : l'e-mail n°1 est le seul chemin d'accès de
  // l'acheteur à son livrable. On refuse plutôt que d'en créer une injoignable.
  if (!email) return { erreur: 'acheteur sans adresse' }

  // Paddle rend un nom complet, là où notre modèle porte prénom et nom.
  const nomComplet = typeof client?.name === 'string' ? client.name.trim() : ''
  const espace = nomComplet.indexOf(' ')
  const firstName = espace > 0 ? nomComplet.slice(0, espace) : nomComplet || null
  const lastName = espace > 0 ? nomComplet.slice(espace + 1).trim() : null

  // ⚠️ `custom_data` de la TRANSACTION est légitime pour la référence et la langue : contrairement
  // à Chariow, l'API Paddle le rend, et ni l'une ni l'autre n'accorde de droit — la référence sert
  // à retrouver une commande déjà née, la langue à choisir celle d'un e-mail.
  const meta = (t.custom_data && typeof t.custom_data === 'object')
    ? t.custom_data as Record<string, unknown>
    : null
  const refBrute = typeof meta?.ref === 'string' ? meta.ref.trim().toLowerCase() : ''
  const ref = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(refBrute)
    ? refBrute
    : null
  const lang = meta?.lang === 'en' ? 'en' : 'fr'
  // ⚠️ `meta.offre` n'est JAMAIS lue, et ce n'est pas un oubli : comparer les deux pour refuser en
  // cas d'écart a été essayé, puis retiré. `custom_data` de la transaction passe par le navigateur
  // — avec notre jeton client, public par conception, n'importe qui ouvre un tunnel sur le prix à
  // 29 € en s'y déclarant `up3`. Sous la règle du catalogue il reçoit ce qu'il a PAYÉ ; sous une
  // règle de refus, une transaction RÉGLÉE ne donnerait plus de commande du tout. Et le désaccord
  // de configuration que le refus prétendait attraper est bénin : le montant prélevé suit toujours
  // le prix, donc l'acheteur paie et reçoit la même offre — celle que le tunnel lui a nommée.

  // Moyen de paiement — pour le reçu, jamais pour une décision.
  const paiements = Array.isArray(t.payments) ? t.payments : []
  const dernier = paiements[paiements.length - 1] as Record<string, unknown> | undefined
  const methode = dernier?.method_details && typeof dernier.method_details === 'object'
    ? (dernier.method_details as Record<string, unknown>).type
    : null
  const paymentMethod = typeof methode === 'string' && methode ? methode : null

  return {
    saleId,
    offre,
    essai,
    amountMinor,
    currency,
    email,
    firstName,
    lastName,
    ref,
    lang,
    paymentMethod,
    // La facture Paddle se re-signe à la demande (`transactions.invoice.get`) : jamais d'URL figée
    // ici, elle expirerait en une heure — même leçon que les factures Chariow.
    invoiceUrl: null,
  }
}
