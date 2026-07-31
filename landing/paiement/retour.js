/* Retour de paiement — script séparé : la CSP `script-src 'self'` interdit l'inline.
   Sans parent (« Ouvrir dans un onglet »), on rend la main à /modele, qui sait reprendre la
   commande par sa référence. Avec parent, on ne fait RIEN : la page mère lit notre URL. */
if (window.top === window) {
  window.location.replace("/modele" + window.location.search);
}
