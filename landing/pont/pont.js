/**
 * Le PONT — ce qui se décide entre « le client vient de payer » et « le client est sur sa page de
 * livraison ». Module PUR : aucun DOM, aucun `fetch`, aucune horloge. Il se teste à la ligne.
 *
 * POURQUOI IL EST SÉPARÉ DE `modele.js`. C'est le seul endroit du produit où une erreur de code
 * fait perdre à quelqu'un un document qu'il vient de payer 19 000 F. Trois décisions y sont
 * irrattrapables une fois prises :
 *
 *   1. **Confondre « pas encore » et « refusé ».** Le webhook Chariow peut arriver APRÈS le client.
 *      Traiter la première réponse comme un échec renverrait l'acheteur sur « commande introuvable »
 *      une seconde avant que sa commande n'existe.
 *   2. **Ne pas s'arrêter.** Un onglet oublié sur la page de retour interrogerait le serveur
 *      indéfiniment ; la boucle doit avoir une fin, et cette fin doit dire quoi faire ensuite.
 *   3. **Se tromper de destination.** Le jeton ouvre `app.pharnos.com`, pas `pharnos.com` : une URL
 *      construite de travers laisse l'acheteur devant une page qui ne le connaît pas.
 *
 * ⚠️ `?paiement=ok` N'ACCORDE RIEN. Rien ici ne crée de commande ni n'ouvre de droit : le paramètre
 * d'URL ne fait que déclencher l'interrogation d'un état que le webhook, lui, a établi.
 */

/** Origine de l'application, où vit `/u/{token}`. */
const APP_PROD = "https://app.pharnos.com";
/** Port du serveur de développement de `web/` (cf. `npm run dev`). */
const APP_DEV = "http://localhost:4319";

const EST_LOCAL = (hote) =>
  hote === "localhost" || hote === "127.0.0.1" || hote === "[::1]";

/**
 * Où envoyer l'acheteur une fois son jeton obtenu.
 *
 * ⚠️ Le jeton part dans le CHEMIN, jamais dans une chaîne de requête : les paramètres d'URL
 * fuient dans les `Referer`, les journaux de proxy et les barres d'adresse partagées, et ce
 * jeton-là EST l'authentification de la commande pendant trente jours.
 */
export function urlLivraison(token, hote) {
  const base = EST_LOCAL(hote) ? APP_DEV : APP_PROD;
  return `${base}/u/${encodeURIComponent(token)}`;
}

/**
 * Correspondance entre les clés de documents de la landing et la liste blanche du SERVEUR.
 *
 * ⚠️ **Les deux vocabulaires diffèrent, et le repli muet coûtait une commande entière.** La landing
 * nomme l'étiquetage `etiquetage` ; `DOC_TYPES_VENDABLES` le nomme `labeling`. Envoyé tel quel, il
 * était inconnu du serveur, qui retombait en silence sur `rcp` : l'acheteur d'un étiquetage voyait
 * son document enregistré comme un RCP, jugé par la porte contre le gabarit du RCP, et refusé —
 * trois fois, jusqu'à épuisement des dépôts d'une commande payée, sans qu'aucun écran ne puisse
 * expliquer pourquoi.
 *
 * ⚠️ Une `Map`, jamais un objet littéral : `objet['constructor']` rend une fonction — donc vraie —
 * et un `?? null` ne rattraperait rien. Une `Map` n'a pas de prototype à confondre avec ses données.
 */
const DOC_TYPE_SERVEUR = new Map([
  ["rcp", "rcp"],
  ["notice", "notice"],
  ["etiquetage", "labeling"],
]);

/** Le nom que le serveur attend, ou `null` si nous ne savons pas traduire — et alors on n'envoie pas. */
export const docTypeServeur = (doc) => DOC_TYPE_SERVEUR.get(doc) ?? null;

/**
 * Ce que la chaîne sait LIVRER aujourd'hui — jumeau de `DOC_TYPES_LIVRABLES` côté serveur.
 *
 * ⚠️ Vendable n'est pas livrable : l'assemblage U5 porte les en-têtes du RCP en dur et sa table de
 * titres EN ne couvre que lui. Une notice vendue aurait traversé les ~60 appels du moteur (~2 $)
 * puis échoué à l'assemblage — commande morte APRÈS la dépense. Le refus tombe AVANT le paiement,
 * où il ne coûte rien et se dit ; le serveur refuse de toute façon au dépôt (double ceinture).
 * Ouvrir la notice et l'étiquetage = construire leur gabarit d'assemblage, puis élargir les DEUX
 * jumeaux — le processus suit le patron du RCP (décision CEO : finaliser le RCP, s'en inspirer).
 */
export const DOC_LIVRABLES = new Set(["rcp"]);
export const docTypeLivrable = (doc) => DOC_LIVRABLES.has(doc);

/**
 * Ce que la MISE À NIVEAU accepte — et ce n'est pas ce que la bibliothèque accepte.
 *
 * ⚠️ La page de la bibliothèque prend `.pdf`, `.doc` et `.docx` jusqu'à 40 Mo, ce qui est juste pour
 * un outil gratuit. Le chemin payant, lui, est contraint par le moteur : `prepareUpgradeSource` lit
 * du PDF (pdf.js), et `lireDemandeDepot` refuse tout autre type. Le pont déclarait pourtant
 * `application/pdf` **en dur**, quel que soit le fichier — et comme le mimetype enregistré dans
 * Storage est celui que le client déclare, ce mensonge neutralisait les DEUX gardes du serveur :
 * celle de la demande d'URL, et celle de la porte qui reconstate le type réel de l'objet.
 *
 * Un consultant qui dépose son `RCP.docx` — le format NATIF de ces documents — payait 19 000 F,
 * brûlait un dépôt sur trois, et voyait son document refusé sans qu'aucun écran ne sache dire
 * pourquoi. Le refus doit tomber AVANT le paiement, où il ne coûte rien et s'explique.
 */
export const EXTENSIONS_UPGRADE = [".pdf"];

/**
 * Plafond du chemin payant — **jumeau de `MAX_SOURCE_BYTES`** (`_shared/orders-core.ts`).
 *
 * ⚠️ Ce n'est pas le plafond de la bibliothèque (40 Mo). Le moteur joint la PIÈCE à chaque appel de
 * conformité et de revue, encodée en base64 : au-delà de ~12 Mo binaires on approche la limite de
 * corps de requête du fournisseur, et l'échec tombe alors APRÈS le paiement, rubrique par rubrique.
 * Refuser ici coûte un message ; refuser là-bas coûte une commande.
 */
export const MAX_UPGRADE_OCTETS = 12 * 1024 * 1024;

/** `null` si le fichier peut partir, sinon la raison — à dire avant tout paiement. */
export function refusFichierUpgrade(fichier) {
  const nom = String(fichier?.name ?? "").toLowerCase();
  if (!EXTENSIONS_UPGRADE.some((e) => nom.endsWith(e))) return "type";
  if (!fichier?.size) return "vide";
  if (fichier.size > MAX_UPGRADE_OCTETS) return "taille";
  return null;
}

/**
 * Traduit une réponse de `order-claim` en décision.
 *
 * Les quatre réponses du serveur ne sont PAS interchangeables, et deux d'entre elles arrivent avec
 * un code d'erreur alors que rien n'est cassé :
 *
 * | Réponse | Code | Ce que c'est |
 * |---|---|---|
 * | `pending`   | 200 | le cas NOMINAL des premières secondes — le webhook n'est pas encore passé |
 * | `ready`     | 200 | la commande existe, le jeton est là |
 * | `expired`   | 410 | 30 jours ont passé : plus rien à faire ici |
 * | `use_email` | 429 | trop de jetons pour cette commande — l'e-mail n°1 reste valable |
 */
export function lireClaim(status, corps) {
  const c = corps && typeof corps === "object" ? corps : {};
  if (
    status === 200 &&
    c.status === "ready" &&
    typeof c.token === "string" &&
    c.token
  ) {
    return { etat: "pret", token: c.token };
  }
  if (status === 200 && c.status === "pending") return { etat: "attente" };
  if (status === 410 || c.status === "expired") return { etat: "expire" };
  // 429 couvre DEUX choses : le plafond de jetons de cette commande (`use_email`) et la limitation
  // de débit générale. La première est définitive, la seconde passe — on réessaie dans le doute,
  // sauf quand le serveur nomme explicitement le premier cas.
  if (c.status === "use_email") return { etat: "voir_email" };
  if (status === 429) return { etat: "attente" };
  // 400 (référence malformée) et 5xx sont réessayables du point de vue de l'acheteur : ils ne
  // disent rien de sa commande, seulement de cet appel-ci.
  return { etat: "attente" };
}

/**
 * Cadence d'interrogation, en millisecondes, du plus court au plus long.
 *
 * Serré au début parce que le webhook arrive presque toujours dans les premières secondes, puis
 * relâché parce qu'un retard de webhook se compte en dizaines de secondes, pas en millisecondes.
 * La somme borne l'attente à ~90 s : au-delà, l'acheteur mérite une consigne, pas un sablier.
 */
export const CADENCE_MS = [
  1000, 1000, 1500, 1500, 2000, 2000, 3000, 3000, 4000, 5000, 5000, 6000, 6000,
  8000, 8000, 10000, 12000, 12000,
];

/** Attente totale des PAUSES, en millisecondes. */
export const ATTENTE_MAX_MS = CADENCE_MS.reduce((t, d) => t + d, 0);

/**
 * Délai maximal d'un appel à `order-claim` — une simple lecture indexée.
 *
 * ⚠️ Sans lui, la borne de la boucle ne bornait que les PAUSES. Chaque tentative pouvait prendre
 * 20 s de plus (le délai générique des appels), soit dix-huit tentatives à ~7 minutes réelles sous
 * un écran qui promet « quelques secondes ». Une boucle bornée dont la borne ne compte pas le temps
 * passé n'est pas une boucle bornée.
 */
export const CLAIM_TIMEOUT_MS = 8_000;

/**
 * Pire cas RÉEL de la boucle — et c'est ce chiffre-là que la promesse d'écran doit tenir.
 *
 * `reclamerJeton` teste l'échéance EN TÊTE de chaque tour : une fois `ATTENTE_MAX_MS` écoulé, la
 * boucle s'arrête. Le dépassement est donc borné par le dernier tour engagé — sa pause, puis son
 * appel — et non par la somme des dix-huit délais réseau possibles.
 */
export const ATTENTE_PIRE_CAS_MS =
  ATTENTE_MAX_MS + Math.max(...CADENCE_MS) + CLAIM_TIMEOUT_MS;

/**
 * Délai avant la tentative `essai` (0 = la première, qui part tout de suite), ou `null` quand il
 * n'y a plus lieu d'attendre.
 */
export const delaiClaim = (essai) =>
  essai <= 0 ? 0 : essai <= CADENCE_MS.length ? CADENCE_MS[essai - 1] : null;

/**
 * Le téléversement a-t-il de quoi être retenté ?
 *
 * ⚠️ Retenter le PUT sur la MÊME URL signée ne consomme PAS un second dépôt — la clé est dérivée
 * du job et `x-upsert` autorise la réécriture. C'est la demande d'URL, elle, qui décompte. Un
 * micro-trou réseau ne doit donc jamais coûter un dépôt sur trois à quelqu'un qui a payé.
 */
export const PUT_ESSAIS = 3;
export const PUT_ATTENTE_MS = 800;

/**
 * Un échec réseau se retente ; un refus du serveur, non.
 *
 * 401/403 signent une URL expirée ou déjà consommée : réessayer à l'identique la fera refuser
 * pareil, trois fois plus lentement. `null` = la requête n'a jamais abouti (coupure) : là, oui.
 */
export const putRetentable = (status) =>
  status === null || status === 408 || status === 429 || status >= 500;
