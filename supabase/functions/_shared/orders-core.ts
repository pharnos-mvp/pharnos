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

/* ─────────────────────────────────── Le dépôt de la source ────────────────────────────────── */

/**
 * Le SEUL type accepté au dépôt : PDF.
 *
 * Ce n'est pas une frilosité, c'est le contrat réel de la chaîne : `prepareUpgradeSource` entre par
 * `readPdfPages` (pdf.js), et l'OCR n'intervient que sur les pages SANS couche texte d'un PDF. Une
 * image ou un DOCX déposés ici n'échoueraient pas au dépôt mais bien plus loin, après paiement,
 * sur une pile d'appels — c'est-à-dire au pire endroit. Refuser tôt et le DIRE vaut mieux.
 */
export const TYPE_SOURCE = 'application/pdf'
/**
 * Plafond du document source — **12 Mo, aligné sur `upgrade` et `translate`**.
 *
 * ⚠️ Il valait 25 Mo, et c'était intenable de deux façons. D'abord la pièce repart au modèle à
 * CHAQUE appel de conformité et de revue (38 fois), encodée en base64 : 25 Mo binaires font 33,3 Mo
 * de base64, au-dessus de la limite de corps de requête du fournisseur. Ensuite les deux autres
 * surfaces du moteur plafonnent depuis toujours à 12 Mo — trois valeurs pour une même contrainte,
 * dont la plus permissive gardait la porte d'entrée.
 *
 * Un acheteur déposant un scan de 20 Mo passait donc le dépôt, passait la porte, et échouait sur
 * les 34 rubriques : après paiement, une rubrique à la fois. Le refus tombe maintenant à la demande
 * d'URL, avant tout débit de dépôt, et la landing le dit avant même le paiement.
 */
export const MAX_SOURCE_BYTES = 12 * 1024 * 1024
/** Dépôts autorisés par commande (§2.3, étape 6) — la borne vit AUSSI dans la contrainte SQL. */
export const MAX_DEPOTS = 3

/**
 * Clé Storage du document source.
 *
 * ⚠️ **Aucune chaîne venue du client n'y entre**, et c'est délibéré : ni le nom de fichier, ni le
 * type de document. Le piège « Invalid key » de Supabase sur les clés accentuées disparaît alors
 * par construction, plutôt que d'être rattrapé par une fonction d'assainissement qu'on peut
 * oublier d'appeler. Le nom d'origine, lui, n'est pas perdu pour autant — il vit en base, où il
 * n'a aucune contrainte de jeu de caractères.
 */
export const SOURCE_OBJECT_NAME = 'source.pdf'

export const sourceObjectKey = (orderId: string, jobId: string): string =>
  `orders/${orderId}/${jobId}/${SOURCE_OBJECT_NAME}`

/**
 * Dossier parent d'une clé source — `list()` de Storage prend un préfixe, jamais un chemin de
 * fichier.
 *
 * ⚠️ `lastIndexOf('/')` rend `-1` sur une clé sans séparateur, et `slice(0, -1)` amputerait alors
 * le dernier caractère au lieu de refuser : on listerait un dossier voisin, dont l'objet homonyme
 * validerait une source qui n'a jamais été déposée.
 *
 * ⚠️ Et le repli n'est PAS la chaîne vide : `list('')` liste la RACINE du bucket, donc le pire des
 * deux mondes — un préfixe qui rend des objets sans aucun rapport avec cette commande. Le repli est
 * un préfixe qui n'existe pas et ne peut pas exister (`orders/` ne contient que des UUID).
 */
export const DOSSIER_IMPOSSIBLE = 'orders/__aucun__'

export function sourceObjectFolder(path: string): string {
  const coupe = path.lastIndexOf('/')
  return coupe > 0 ? path.slice(0, coupe) : DOSSIER_IMPOSSIBLE
}

/**
 * Ce que Storage RAPPORTE d'un objet déposé. `size` et `mimetype` sont mesurés par Storage à la
 * réception — contrairement au `contentType` et au `size` de la demande d'URL, qui sont DÉCLARÉS
 * par le client et qu'une URL signée ne contraint pas.
 */
export interface MetaObjetStockage {
  size?: number
  mimetype?: string
}

export type VerdictObjetSource =
  | { ok: true; taille: number | null }
  | { ok: false; refus: 'absent' }
  | { ok: false; refus: 'type'; message: string; type: string }
  | { ok: false; refus: 'taille'; message: string }

/**
 * Le fichier réellement présent dans Storage est-il exploitable ?
 *
 * ⚠️ Ce jugement est partagé par `order-gate` et `order-source` À DESSEIN. Recopié, il divergerait :
 * la porte refuserait un fichier que la page vient d'accepter de télécharger, ou l'inverse — et le
 * désaccord ne se verrait sur aucun écran, seulement sur une commande payée qui n'avance plus.
 *
 * ⚠️ `mimetype` peut manquer (dépôt sans en-tête) : on ne refuse alors PAS. Le type réel est
 * reconstaté par `prepareUpgradeSource` côté navigateur, qui ouvre le PDF ou échoue franchement ;
 * refuser ici sur une métadonnée absente rejetterait des dépôts valides sans recours.
 */
export function jugerObjetSource(
  objet: { metadata?: unknown } | null | undefined,
): VerdictObjetSource {
  if (!objet) return { ok: false, refus: 'absent' }
  const meta = (objet.metadata ?? {}) as MetaObjetStockage
  if (meta.mimetype && meta.mimetype !== TYPE_SOURCE) {
    return {
      ok: false,
      refus: 'type',
      message: 'seuls les PDF sont acceptés',
      type: String(meta.mimetype),
    }
  }
  if (typeof meta.size === 'number' && meta.size > MAX_SOURCE_BYTES) {
    return { ok: false, refus: 'taille', message: 'fichier trop volumineux' }
  }
  return { ok: true, taille: typeof meta.size === 'number' ? meta.size : null }
}

/** Code HTTP d'un refus d'objet source. `absent` est un 409 : l'état, pas la demande, est en cause. */
export const statutHttpObjetSource = (refus: VerdictObjetSource): number =>
  refus.ok ? 200 : refus.refus === 'absent' ? 409 : refus.refus === 'taille' ? 413 : 400

/**
 * Types de document vendables. **Liste blanche FERMÉE**, et jamais un `in` sur un objet.
 *
 * ⚠️ `'constructor' in CONFORMITY_SPECS` vaut `true` — comme `toString`, `valueOf`,
 * `hasOwnProperty` : ce sont les clés du prototype. Un `docType: 'constructor'` faisait donc passer
 * le test d'appartenance, `spec` devenait `Object`, et `flattenRubrics` levait une `TypeError` non
 * capturée : 500 SANS en-tête CORS (le navigateur ne voit qu'une panne réseau) et un job
 * définitivement inutilisable. Un `Set` n'a pas de prototype à confondre avec ses données.
 */
export const DOC_TYPES_VENDABLES: ReadonlySet<string> = new Set(['rcp', 'notice', 'labeling'])

/**
 * Ce que la chaîne sait LIVRER aujourd'hui — et c'est plus étroit que le catalogue.
 *
 * ⚠️ La revue U5 l'a prouvé en exécutant : l'assemblage porte les en-têtes du RCP en dur et la
 * table de titres EN ne couvre que ses rubriques. Une notice déposée aurait donc traversé les
 * ~60 appels du moteur (~2 $) puis échoué À L'ASSEMBLAGE — commande `failed` après la dépense,
 * le pire ordre possible. Le refus vit ici, AVANT le décompte du dépôt, avec un message qui dit
 * la vérité : le processus notice/étiquetage suit le patron du RCP, il n'est pas encore construit
 * (décision CEO : finaliser le RCP de bout en bout, puis s'en inspirer pour les deux autres).
 *
 * Ouvrir un type = l'ajouter ICI une fois son gabarit, ses titres EN et son en-tête d'assemblage
 * en place — le test `deliverable-titles.test.ts` et l'assembleur refuseront tout raccourci.
 */
export const DOC_TYPES_LIVRABLES: ReadonlySet<string> = new Set(['rcp'])

export interface DemandeDepot {
  docType: string
  size: number
  /** Nom du fichier tel que l'acheteur le connaît — AFFICHAGE seul, jamais une clé Storage. */
  sourceName: string | null
  /** Code pays de dépôt (`BJ`…), ou `null` — il commande la mention de vigilance 4.8. */
  country: string | null
  /** `amm` | `renouv`, ou `null` — il commande les rubriques 8, 9 et 10. */
  activity: string | null
}

/** Valide une demande d'URL de dépôt. Le jeton est vérifié à part, contre la base. */
export function lireDemandeDepot(body: unknown): DemandeDepot | { erreur: string } {
  if (!body || typeof body !== 'object') return { erreur: 'corps non structuré' }
  const b = body as Record<string, unknown>

  const type = texte(b.contentType, 120)
  if (type !== TYPE_SOURCE) {
    return { erreur: 'seuls les PDF sont acceptés' }
  }
  const size = Number(b.size)
  if (!Number.isFinite(size) || size <= 0) return { erreur: 'taille absente' }
  if (size > MAX_SOURCE_BYTES) return { erreur: 'fichier trop volumineux' }

  // ⚠️ UN TYPE PRÉSENT MAIS INCONNU FAIT REFUSER — il ne retombe PAS sur `rcp`.
  //
  // Le repli silencieux a coûté un incident entier : la landing nomme l'étiquetage `etiquetage`,
  // cette liste le nomme `labeling`. L'acheteur d'un étiquetage voyait donc son document enregistré
  // comme un RCP, jugé par la porte contre le gabarit du RCP, et refusé — trois fois, jusqu'à
  // épuisement des dépôts d'une commande payée, sans qu'aucun écran ne puisse expliquer pourquoi.
  //
  // Un type ABSENT, lui, retombe légitimement sur `rcp` : c'est un appelant qui ne se prononce pas,
  // pas un appelant qui se trompe. Refuser, c'est refuser TÔT et le DIRE — la règle du chantier.
  const brut = texte(b.docType, 40)
  if (brut && !DOC_TYPES_VENDABLES.has(brut)) {
    return { erreur: 'type de document inconnu' }
  }
  if (brut && !DOC_TYPES_LIVRABLES.has(brut)) {
    // Connu du catalogue mais pas encore livrable : refuser AVANT la dépense, en le disant.
    return {
      erreur:
        'la mise à niveau de ce type de document ouvre bientôt — seul le RCP est traité pour l’instant',
    }
  }

  // ── Pays, activité, nom du fichier — le trou que U5 a découvert ───────────────────────────────
  //
  // ⚠️ Ces trois valeurs n'atteignaient JAMAIS le serveur. Les colonnes existaient (`0083`), la
  // landing les connaissait, elles mouraient dans IndexedDB — et `job-tick` ne passait donc AUCUN
  // `countryCode` au moteur : la mention de vigilance 4.8, celle qui varie par pays et fonde le
  // « checking standard », n'était jamais injectée en production. Le dépôt est leur transport
  // naturel : c'est le premier appel qui porte le document, et le seul que les deux fronts font.
  //
  // Elles sont OPTIONNELLES — un appelant ancien ne casse pas — mais jamais devinées :
  //  • un pays hors format est IGNORÉ (le repli neutre de la 4.8 est le cas courant, pas une
  //    lacune) ; un pays inventé injecterait la mention d'un autre pays dans un dossier réel ;
  //  • une activité hors vocabulaire est IGNORÉE : le silence laisse le gabarit décider, une
  //    consigne fausse ferait écrire « Sans objet » sur un renouvellement.
  // ⚠️ `toUpperCase()` d'abord : la landing envoie `bj`, `ci`… (les clés de son manifeste), et le
  // motif strict les jetait en silence — le trou « la 4.8 n'entre dans aucun prompt » restait
  // ouvert sur le SEUL chemin de production, le pont. Majusculer un code ISO-2 n'est pas deviner,
  // c'est normaliser ; un code hors format, lui, reste ignoré.
  const paysBrut = texte(b.country, 8)?.toUpperCase() ?? null
  const country = paysBrut && /^[A-Z]{2}$/.test(paysBrut) ? paysBrut : null
  const activiteBrut = texte(b.activity, 40)
  const activity = activiteBrut === 'amm' || activiteBrut === 'renouv' ? activiteBrut : null
  // Le nom sert l'AFFICHAGE (en-tête du livrable, rapport) : borné, expurgé des caractères de
  // contrôle, jamais utilisé comme clé — `sourceObjectKey` reste sans chaîne client.
  const nomBrut = texte(b.sourceName, 200)
  const sourceName = nomBrut
    ? nomBrut.split('')
      .filter((c) => c.charCodeAt(0) >= 0x20 && c.charCodeAt(0) !== 0x7f && c !== '`')
      .join('')
      .trim() || null
    : null

  return { docType: brut || 'rcp', size: Math.round(size), sourceName, country, activity }
}

/* ────────────────────────────── Les gardes d'état, en CODE PUR ─────────────────────────────── */
//
// ⚠️ Elles vivent ICI, et pas dans les `index.ts`, pour une raison apprise à la revue : tant que
// l'enchaînement des gardes n'était lisible que dans le transport, il n'était couvert par AUCUN
// test — et un défaut d'ordre y était invisible. La branche de refus de `order-gate` réécrivait
// l'état AVANT la garde « déjà lancé », ce qui permettait de relancer autant de traitements qu'on
// voulait sur une seule commande payée, à ~2 $ pièce. Trois lignes de test l'auraient montré.

/** États depuis lesquels un nouveau dépôt est permis. */
export const peutDeposer = (status: string): boolean =>
  status === 'paid' || status === 'source_uploaded' || status === 'gated_out'

/**
 * Un traitement est-il déjà engagé ? `running` et `done` sont des points de non-retour : relancer
 * doublerait les 60 appels du moteur, soit près de 2 $ jetés sans que rien ne le signale.
 */
export const dejaLance = (status: string): boolean => status === 'running' || status === 'done'

/**
 * États depuis lesquels une transition est acceptable — la liste passée en `.in(...)` du
 * compare-and-swap. C'est LUI qui fait autorité, pas la lecture qui précède : entre le `select` et
 * l'`update`, une autre requête a pu passer.
 */
export const ETATS_DEPOSABLES = ['paid', 'source_uploaded', 'gated_out'] as const

/* ──────────────────────────────────── Le pont (`order-claim`) ─────────────────────────────── */

/**
 * Nombre de rubriques attendues par phase, pour un job. Sert à `sections_total` et à l'affichage
 * « rubrique N sur M » — calculé à partir du gabarit, jamais écrit en dur dans un écran.
 */
export const REVUE_SECTIONS = ['terminology', 'relocations', 'findings', 'recommendations'] as const

/** Nombre de tableaux qu'une revue complète doit porter — le livrable en dépend, pas l'affichage. */
export const REPORT_SECTIONS_ATTENDUES = REVUE_SECTIONS.length


/**
 * Une référence est-elle recevable au pont ? UUID strict — le pont interroge en boucle courte et
 * sans authentification (la commande n'existe pas encore), donc son entrée doit être la plus
 * étroite possible : une chaîne libre ouvrirait un balayage de table par tâtonnement.
 */
export const isValidRef = (v: unknown): v is string =>
  typeof v === 'string' && UUID_RE.test(v)
