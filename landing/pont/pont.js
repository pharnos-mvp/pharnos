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

// ⚠️ B2 (config APRÈS paiement) : le panneau d'achat ne collecte plus NI fichier NI configuration —
// tout se choisit sur `/u/{token}`, après le règlement. Les gardes de fichier du chemin payant
// (`EXTENSIONS_UPGRADE`, `MAX_UPGRADE_OCTETS`, `refusFichierUpgrade`) et la mécanique de
// téléversement du pont (`PUT_ESSAIS`, `putRetentable`, `docTypeServeur`) sont PARTIES avec lui :
// c'est `/u/` qui refuse gratuitement (lecture AVANT dépôt) et `order-upload-url` qui décompte.
// Un module sans appelant n'est pas un module fini — il est supprimé, pas archivé.

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
 * relâché parce qu'un retard se compte en dizaines de secondes, pas en millisecondes.
 *
 * ⚠️ La somme borne l'attente à ~5 min 30, et ce chiffre n'est pas un confort : c'est la SALLE
 * D'ATTENTE (C2), calibrée pour SURVIVRE À DEUX PÉRIODES PLEINES du cron de réconciliation
 * (`chariow-reconcile`, toutes les 2 minutes). La première vente réelle l'a prouvé : le Pulse
 * Chariow peut ne JAMAIS arriver — la commande naît alors du balayage, et l'acheteur qui attend
 * ici doit encore être là quand elle naît. Une attente de 90 s l'aurait renvoyé vers ses e-mails
 * une minute avant la naissance de sa commande.
 */
export const CADENCE_MS = [
  1000, 1000, 1500, 1500, 2000, 2000, 3000, 3000, 4000, 5000, 5000, 6000, 6000,
  8000, 8000, 10000, 12000, 12000,
  // La queue de la salle d'attente : 20 × 12 s = 4 minutes de plus, à cadence constante.
  12000, 12000, 12000, 12000, 12000, 12000, 12000, 12000, 12000, 12000,
  12000, 12000, 12000, 12000, 12000, 12000, 12000, 12000, 12000, 12000,
];

/**
 * Ce que la salle d'attente DIT, par palier de temps écoulé — elle ne se tait jamais (C2).
 * Chaque entrée : `apresMs` (le palier s'applique à partir de là) et le texte [FR, EN].
 * L'ordre est croissant ; `palierAttente` rend la DERNIÈRE entrée atteinte.
 */
export const PALIERS_ATTENTE = [
  {
    apresMs: 0,
    texte: [
      "Nous confirmons votre règlement auprès de la banque…",
      "Confirming your payment with the bank…",
    ],
    note: [
      "Cela prend généralement moins d'une minute.",
      "This usually takes under a minute.",
    ],
  },
  {
    apresMs: 45_000,
    texte: [
      "La confirmation bancaire prend parfois quelques minutes — nous restons dessus.",
      "Bank confirmation sometimes takes a few minutes — we are on it.",
    ],
    note: [
      "Votre règlement est enregistré. Cette page se met à jour toute seule.",
      "Your payment is recorded. This page updates on its own.",
    ],
  },
  {
    apresMs: 150_000,
    texte: [
      "Toujours en cours. Notre système vérifie aussi les ventes toutes les deux minutes : votre commande sera retrouvée.",
      "Still in progress. Our system also sweeps sales every two minutes: your order will be picked up.",
    ],
    note: [
      "Rien à faire de votre côté — ne fermez pas cette page.",
      "Nothing to do on your side — keep this page open.",
    ],
  },
];

/** Le palier applicable à un instant donné — la dernière entrée dont l'échéance est passée. */
export function palierAttente(ecouleMs) {
  let retenu = PALIERS_ATTENTE[0];
  for (const p of PALIERS_ATTENTE) {
    if (ecouleMs >= p.apresMs) retenu = p;
  }
  return retenu;
}

/**
 * La RELANCE avant repli (C4) : après l'échéance de la salle d'attente, UNE rafale courte de plus
 * — le cron de réconciliation a pu faire naître la commande à la dernière seconde — puis le repli.
 * Jamais une deuxième salle d'attente : l'acheteur a déjà attendu, la rafale est silencieuse.
 */
export const CADENCE_RELANCE_MS = [2000, 3000, 5000, 8000, 12000];

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

