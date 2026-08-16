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
export const PRODUITS: Record<string, { offre: Offre; essai: boolean }> = {
  prd_hf86pys5: { offre: 'up1', essai: false },
  prd_1u8jrq16: { offre: 'up3', essai: false },
  prd_g3norblb: { offre: 'up1', essai: true },
  prd_abtk4i8b: { offre: 'up3', essai: true },
}

/** Les offres que la chaîne d'upgrade sait servir. */
export type Offre = 'up1' | 'up3'

/**
 * Les mêmes offres, en ensemble — DÉRIVÉES du catalogue, jamais recopiées.
 *
 * Le second rail (Paddle) valide contre cet ensemble plutôt que contre une liste à lui : deux
 * listes d'offres finiraient par diverger, et un processeur accepterait alors une offre que
 * l'autre refuse — sur la même chaîne d'après-paiement.
 */
export const OFFRES_SERVABLES: ReadonlySet<string> = new Set(
  Object.values(PRODUITS).map((p) => p.offre),
)

/* ─────────────────────────────────────── Le Pulse ─────────────────────────────────────────── */

/** Le seul événement qui crée une commande. Tout autre s'acquitte sans rien faire. */
export const PULSE_EVENT_VENTE = 'successful.sale'

export interface PulseLu {
  event: string
  saleId: string
  /**
   * Référence tirée par le navigateur avant paiement (`custom_metadata.ref`), ou `null`.
   *
   * C'est le SEUL chemin par lequel elle nous parvient : l'API des ventes ne rend pas
   * `custom_metadata`. Sans elle, la salle d'attente ne peut pas retrouver la commande.
   */
  ref: string | null
}

/**
 * Format observé en prod : `SALEX5MD9EZOYKITEPM`. Épinglé maintenant qu'on le CONNAÎT : le motif
 * interdit au passage `.` et `..`, que `fetch` normaliserait en segments de chemin dans l'URL de
 * re-vérification (`/v1/sales/..` → `/v1/`, mesuré) — `encodeURIComponent` borne la remontée mais
 * autant ne jamais partir. 120 : même plafond de longueur qu'avant.
 */
const SALE_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/

/**
 * Lit un Pulse. On n'en retient que TROIS choses : l'événement, l'identifiant de vente, et la
 * référence tirée par le navigateur avant paiement.
 *
 * Tout le reste du corps est ignoré — non par prudence de principe, mais parce qu'il ne décide de
 * rien : produit, montant, statut et acheteur viennent de `GET /v1/sales/{id}`, jamais d'ici.
 *
 * ⚠️ POURQUOI LA RÉFÉRENCE, ELLE, EST RETENUE. Elle voyage dans `custom_metadata.ref`, que le
 * checkout y pose — mais **la réponse de `GET /v1/sales/{id}` ne porte pas `custom_metadata`**
 * (absent de la documentation Get Sale, absent des réponses observées). La chercher là revenait
 * donc à ne jamais la trouver : `orders.ref` restait nulle sur CHAQUE vente, `order-claim` ne
 * retrouvait jamais la commande, et la salle d'attente tombait au bout de sept minutes en
 * annonçant une panne — alors que la commande existait et que l'e-mail était parti. Constaté sur
 * la vente réelle du 14/08/2026, dont le Pulse portait pourtant bien la référence.
 *
 * Ce que cela accorde à un forgeur : rien. Le corps est authentifié par la signature HMAC AVANT
 * d'arriver ici (`chariow-pulse` est fail-closed), la référence est un UUID que le navigateur a
 * lui-même tiré, et elle ne sert qu'à échanger une commande DÉJÀ NÉE contre un jeton de livraison.
 * Elle ne décide ni du produit, ni du prix, ni du régime d'essai.
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

  // L'identifiant se présente sous plusieurs formes selon les intégrations Chariow : à plat,
  // porté par l'objet `data`, ou porté par l'objet `sale` — la forme RÉELLE des Pulses
  // `successful.sale`, observée en prod au rejeu de la vente du 14/08/2026 (le corps signé est
  // `{ event, sale: { id, … }, store, product, customer }` ; les formes plates ne venaient que
  // de la documentation). `data.sale ?? b.sale` couvre la composition des deux sans rien élargir.
  const data = b.data && typeof b.data === 'object' ? b.data as Record<string, unknown> : b
  const conteneur = data.sale ?? b.sale
  const vente = conteneur && typeof conteneur === 'object'
    ? conteneur as Record<string, unknown>
    : null
  // Le premier candidat UTILISABLE, jamais le premier NON NUL : `??` s'arrêterait sur un
  // `id: 42` ou un `sale_id: ''` et perdrait le `sale.id` valide qui suit. Et `sale.id`
  // (explicite) prime sur l'`id` de RACINE, ambigu — quand il n'y a pas d'enveloppe `data`,
  // `data.id` EST l'id de racine, c'est-à-dire peut-être celui du Pulse, pas de la vente.
  const brut = [data.sale_id, data.saleId, vente?.id, data.id]
    .find((c): c is string => typeof c === 'string' && c.trim() !== '')
  const saleId = brut?.trim() ?? ''
  if (!SALE_ID_RE.test(saleId)) return { erreur: 'identifiant de vente absent ou hors bornes' }

  // La référence vit dans les métadonnées de la VENTE — le même conteneur que son identifiant.
  // ⚠️ Les mêmes alias que `lireVente` (`custom_metadata` OU `metadata`) : cet alias-là n'est pas
  // décoratif, il existe parce qu'on a vu la seconde forme. Être plus étroit ici rendrait la
  // référence nulle en silence sur une forme que l'autre lecteur accepte.
  const metaBrute = vente?.custom_metadata ?? vente?.metadata ??
    data.custom_metadata ?? data.metadata ?? b.custom_metadata
  // Certaines intégrations sérialisent les métadonnées en CHAÎNE. Une chaîne n'étant pas nullish,
  // le `??` ci-dessus ne retombe pas sur le conteneur suivant : il faut la décoder ici, ou la
  // référence se perd sans un mot.
  const meta = typeof metaBrute === 'string'
    ? (() => {
      try {
        return JSON.parse(metaBrute) as unknown
      } catch {
        return null
      }
    })()
    : metaBrute
  const refBrute = meta && typeof meta === 'object' && !Array.isArray(meta)
    ? (meta as Record<string, unknown>).ref
    : undefined
  const ref = typeof refBrute === 'string' && isValidRef(refBrute.trim())
    ? refBrute.trim().toLowerCase()
    : null

  return { event, saleId, ref }
}

/**
 * La référence à écrire sur la commande : celle de l'API d'abord, celle du Pulse en repli.
 *
 * L'ordre n'est pas indifférent. L'API est la source RE-VÉRIFIÉE — si elle finit par rendre
 * `custom_metadata` (rien ne l'interdit), c'est elle qui doit gouverner, et ce repli s'effacera de
 * lui-même sans qu'on ait à y revenir. Le Pulse ne sert que tant qu'elle se tait.
 *
 * ⚠️ `pulseAuthentifie` est OBLIGATOIRE, et c'est le cœur du contrat. La référence n'est pas une
 * donnée d'affichage : `order-claim` l'échange contre un jeton de livraison, et ce jeton EST
 * l'autorisation complète du parcours — déposer, lancer le moteur (~2 $), télécharger le livrable.
 * Un corps non authentifié qui la nomme laisse donc un tiers réclamer le dossier d'un acheteur.
 * Le mode observation (`CHARIOW_PULSE_OBSERVE=1`) ne vérifie AUCUNE signature : c'est un mode de
 * configuration, jamais un mode de confiance. En faire un paramètre explicite plutôt qu'un test
 * chez l'appelant, c'est rendre l'oubli impossible plutôt qu'improbable.
 *
 * Le repli ne s'applique QU'AU webhook : la réconciliation (C1) naît sans Pulse — la référence lui
 * revient alors par le back-fill de `faireNaitreCommande`, quand le Pulse arrive ensuite.
 */
export const refCommande = (
  refApi: string | null,
  refPulse: string | null | undefined,
  pulseAuthentifie: boolean,
): string | null => refApi ?? (pulseAuthentifie ? refPulse ?? null : null)

/* ─────────────────────────── La vente, telle que l'API la confirme ────────────────────────── */

/**
 * Statuts que Chariow donne à une vente RÉGLÉE. Tout autre statut ⇒ aucune commande.
 *
 * ⚠️ `settled` en fait partie : c'est une vente payée dont les fonds ont été REVERSÉS au vendeur
 * (le statut avance tout seul chez Chariow). La refuser affamait la réconciliation : une vente
 * passée `settled` avant d'être née restait à jamais non-naissable, re-vérifiée toutes les deux
 * minutes, et occupait un créneau du balayage pour rien — trouvé en revue de diff.
 * EXPORTÉE : `reconcile-core` trie sur la MÊME liste — deux listes divergeraient exactement là.
 */
export const STATUTS_PAYES = new Set([
  'paid',
  'completed',
  'complete',
  'settled',
  'success',
  'successful',
  'terminé',
  'termine',
])

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
  /** Méthode de paiement telle que la vente la rapporte (« Credit Card… », mobile money) — reçu. */
  paymentMethod: string | null
  /** Facture officielle du processeur (URL signée, expirante) — jointe au reçu, jamais exigée. */
  invoiceUrl: string | null
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

  // ⚠️ Le montant arrive en OBJET dans l'API réelle — `amount: { value, formatted, currency }` —
  // appris sur la PREMIÈRE vente réelle (2026-08-14) : `Number(objet)` rendait NaN et la commande
  // naissait sans montant. Les formes plates restent acceptées (alias d'intégrations).
  const amountObj = (v.amount && typeof v.amount === 'object')
    ? v.amount as Record<string, unknown>
    : null
  const montant = Number(v.amount_minor ?? amountObj?.value ?? v.amount ?? v.total ?? NaN)
  const currency = texte(v.currency, 8) ?? (amountObj ? texte(amountObj.currency, 8) : null)

  // Reçu de paiement (e-mail n°1) : la méthode et la facture officielle viennent de la vente
  // VÉRIFIÉE — jamais du Pulse. Optionnelles : leur absence ne bloque pas une commande.
  const paiement = (v.payment && typeof v.payment === 'object')
    ? v.payment as Record<string, unknown>
    : null
  const methode = (paiement?.method && typeof paiement.method === 'object')
    ? texte((paiement.method as Record<string, unknown>).name, 80)
    : null
  const invoiceUrl = (() => {
    const u = texte(v.invoice_download_url, 2048)
    return u && u.startsWith('https://') ? u : null
  })()

  return {
    saleId,
    offre: produit.offre,
    // ⚠️ Le régime vient du PRODUIT, jamais de `custom_metadata.essai` : une métadonnée absente
    // (vente hors parcours) ne doit pas faire passer une commande de recette pour une vente réelle,
    // ni l'inverse.
    essai: produit.essai,
    amountMinor: Number.isFinite(montant) && montant >= 0 ? Math.round(montant) : null,
    currency,
    email,
    firstName: texte(v.customer_first_name ?? v.first_name, 120),
    lastName: texte(v.customer_last_name ?? v.last_name, 120),
    ref,
    lang: meta.lang === 'en' ? 'en' : 'fr',
    paymentMethod: methode,
    invoiceUrl,
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
