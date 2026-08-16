/* Tunnel de paiement Paddle — script séparé : la CSP interdit l'inline, ici comme partout.
 *
 * Cette page ne DÉCIDE de rien. Le prix, l'offre et la référence de commande vivent dans la
 * transaction, créée par l'Edge `checkout` à partir du catalogue serveur. Tout ce qui arrive
 * par l'URL est donc soit vérifiable (la forme de l'identifiant), soit sans effet sur le
 * montant (la langue, l'environnement). Un paramètre forgé ne peut pas faire payer moins.
 */

const P = new URLSearchParams(window.location.search);

/* Forme d'un identifiant de transaction Paddle — le vérifier ici évite de passer une chaîne
   arbitraire à Paddle.js, et rend l'échec lisible tout de suite plutôt qu'en cadre muet. */
const TXN_RE = /^txn_[a-z0-9]{26}$/;
const txn = P.get("_ptxn") ?? "";

const lang = P.get("lang") === "en" ? "en" : "fr";

/* Jetons CLIENT Paddle — publics par conception : ils n'ouvrent qu'un tunnel et ne signent
   rien (« safe to publish and expose in your code », doc Paddle). Les garder hors du dépôt
   n'apporterait aucune sécurité et coûterait un mécanisme d'injection sur une landing statique.
   Ils DIFFÈRENT entre bac à sable (`test_`) et production (`live_`), d'où la table : c'est le
   serveur qui tranche, en posant `e=s` sur l'URL de retour de la transaction. */
const JETONS = {
  s: "test_54936b045de11860f922f8980d8",
  l: "",
};
const env = P.get("e") === "s" ? "s" : "l";
const jeton = JETONS[env];

const RETOUR = `${window.location.origin}/paiement/retour?paiement=ok&lang=${lang}`;

/** Rend l'échec VISIBLE. Un tunnel qui ne s'ouvre pas doit le dire : l'acheteur est décidé,
 *  c'est le pire moment pour lui montrer un cadre vide. */
function echec(raison) {
  console.error("tunnel paddle", raison);
  document.getElementById("souci").hidden = false;
}

/* Une seule navigation de sortie, quoi qu'il arrive : Paddle redirige de son côté (`successUrl`)
   et nous écoutons aussi l'événement — deux chemins vers la MÊME destination, dont un seul doit
   s'exécuter. Sans ce verrou, une redirection déjà en cours serait relancée. */
let sorti = false;
function sortir() {
  if (sorti) return;
  sorti = true;
  window.location.replace(RETOUR);
}

if (!TXN_RE.test(txn)) {
  echec("transaction absente ou mal formée");
} else if (!jeton) {
  // Fermé par défaut : sans jeton pour cet environnement, on ne tente pas d'ouvrir un tunnel
  // qui échouerait chez Paddle avec un message que l'acheteur ne comprendrait pas.
  echec(`aucun jeton client pour l'environnement « ${env} »`);
} else if (typeof window.Paddle === "undefined") {
  echec("Paddle.js non chargé");
} else {
  const Paddle = window.Paddle;
  // L'environnement se pose AVANT l'initialisation : un jeton `test_` sur l'environnement de
  // production est refusé, et inversement.
  if (env === "s") Paddle.Environment.set("sandbox");
  Paddle.Initialize({
    token: jeton,
    eventCallback: (ev) => {
      if (ev?.name === "checkout.completed") sortir();
    },
  });
  Paddle.Checkout.open({
    transactionId: txn,
    settings: {
      // `inline` et non `overlay` : la page est DÉJÀ dans une modale de pharnos.com. Un
      // recouvrement par-dessus un recouvrement donnerait deux fermetures concurrentes.
      displayMode: "inline",
      frameTarget: "paddle-checkout",
      frameInitialHeight: 480,
      frameStyle: "width:100%;min-width:312px;background-color:transparent;border:none",
      locale: lang,
      successUrl: RETOUR,
    },
  });
}
