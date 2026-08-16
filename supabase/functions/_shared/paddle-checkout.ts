// Ouverture d'un paiement PADDLE — module PUR, jumeau de `checkout-core` côté Chariow.
//
// Ce que le navigateur envoie ne change PAS d'un rail à l'autre : il nomme une OFFRE (`up1`/`up3`)
// et donne son identité. C'est le serveur qui traduit en produit, en prix et en processeur. Un
// identifiant de prix forgé reste donc inopérant par construction, comme chez Chariow.
//
// ⚠️ Écart de nature avec Chariow, à garder en tête en lisant ce fichier : Paddle n'héberge AUCUNE
// page de paiement. Le tunnel s'exécute chez nous (`/tunnel/paddle`, la seule page de pharnos.com
// qui charge un script tiers). L'« URL de paiement » rendue au navigateur est donc NOTRE page —
// ce qui rend sa vérification bien plus simple qu'un épinglage d'hôte : on sait exactement quelle
// URL on a demandée, il suffit d'exiger celle-là.
import type { CommandeValidee } from './checkout-core.ts'

/** L'API des transactions — le bac à sable est un HÔTE différent, jamais un drapeau dans le corps. */
export const paddleApi = (bacASable: boolean): string =>
  bacASable ? 'https://sandbox-api.paddle.com' : 'https://api.paddle.com'

/** Version d'API épinglée. Sans elle, Paddle sert le défaut du COMPTE — qui peut changer sous nos
 *  pieds depuis leur tableau de bord, sur la surface qui encaisse. */
export const PADDLE_VERSION = '1'

/** Chemin du tunnel. Constante partagée : il est aussi le chemin excepté dans `landing/_headers`,
 *  et les deux doivent bouger ensemble. */
export const CHEMIN_TUNNEL = '/tunnel/paddle'

/**
 * Correspondance offre → identifiant de prix Paddle, lue d'UNE variable d'environnement JSON
 * (`PADDLE_PRICES`).
 *
 * ⚠️ Pourquoi l'environnement et non le code : les identifiants de prix DIFFÈRENT entre le bac à
 * sable et la production. Les figer en dur imposerait deux listes dans le même fichier, et la
 * mauvaise finirait par partir en production — c'est la classe d'erreur que le catalogue Chariow
 * a évitée en n'ayant qu'un seul environnement. Une variable par environnement rend la confusion
 * impossible.
 *
 * Rendre une correspondance VIDE plutôt que de lever : l'appelant décide alors de refuser
 * proprement plutôt que de tomber en 500 sur une page de paiement.
 */
export function prixParOffre(brut: string | undefined): Record<string, string> {
  if (!brut) return {}
  try {
    const lu = JSON.parse(brut) as unknown
    if (!lu || typeof lu !== 'object' || Array.isArray(lu)) return {}
    const out: Record<string, string> = {}
    for (const [offre, prix] of Object.entries(lu as Record<string, unknown>)) {
      // Un identifiant de prix a une forme : `pri_` + 26 caractères base32. Épinglée ici parce que
      // cette valeur part dans un corps d'API — et qu'une variable d'environnement mal collée doit
      // se voir au démarrage, pas au premier acheteur.
      if (typeof prix === 'string' && /^pri_[a-z0-9]{26}$/.test(prix)) out[offre] = prix
    }
    return out
  } catch {
    return {}
  }
}

/**
 * Bac à sable ⇔ essai, dans les DEUX sens. La règle tient en une équivalence parce que les deux
 * moitiés sont aussi coûteuses l'une que l'autre :
 *
 *  • **essai en production** ferait encaisser le plein tarif à quelqu'un qui croyait tester — il
 *    n'existe pas de catalogue à 570 F chez Paddle, le régime d'essai de ce rail EST le bac à sable ;
 *  • **bac à sable sans jeton de recette** est le côté cher, et le moins visible : la carte de test
 *    de Paddle règle tout, donc un visiteur quelconque repartirait avec les cinq fichiers réels,
 *    moteur payé par NOUS. Rien d'autre ne le retient — `essai` ne bride ni la porte, ni le moteur,
 *    ni la livraison : il ne change que le sujet d'un e-mail.
 *
 * Écrire les deux moitiés séparément revenait à n'en écrire qu'une : c'est arrivé.
 */
export const regimeCoherent = (bacASable: boolean, essai: boolean): boolean => bacASable === essai

/**
 * URL de NOTRE tunnel, celle que Paddle rendra augmentée de `?_ptxn=…`.
 *
 * Elle est construite sur l'origine de l'ACHETEUR (déjà validée par l'allowlist CORS de l'appelant)
 * et non sur une constante : la page du tunnel n'accepte d'être cadrée que par sa propre origine
 * (`frame-ancestors 'self'`). Servir `https://pharnos.com/tunnel/…` à quelqu'un venu de
 * `https://www.pharnos.com` donnerait un cadre refusé — à l'acheteur qui vient de cliquer « Payer ».
 *
 * `e` porte l'environnement : les jetons client Paddle diffèrent entre bac à sable et production,
 * et une landing statique n'a pas de variables d'environnement. `lang` sert au retour de paiement.
 * Ni l'un ni l'autre ne touche au montant — mesuré : Paddle insère `_ptxn` en tête et CONSERVE nos
 * paramètres.
 */
export function urlTunnel(origine: string, langue: 'fr' | 'en', bacASable: boolean): string {
  return `${origine}${CHEMIN_TUNNEL}?e=${bacASable ? 's' : 'l'}&lang=${langue}`
}

/**
 * Corps de `POST /transactions`.
 *
 * `custom_data` porte NOTRE référence jusqu'au webhook — et contrairement à Chariow, l'API Paddle
 * la RESTITUE : la référence n'a donc pas besoin de survivre au corps du webhook, elle revient
 * d'elle-même à la re-vérification. C'est l'écart de contrat qui a coûté une vente sur l'autre rail.
 *
 * ⚠️ AUCUNE identité ici, volontairement. Une adresse saisie dans un formulaire anonyme n'est pas
 * prouvée : la rattacher à un client Paddle existant ferait émettre la facture — un document légal —
 * au nom d'un tiers, et lui enverrait le lien de livraison. Paddle collecte l'identité au tunnel,
 * c'est lui le vendeur légal ; le pré-remplissage, s'il revient un jour, se fera côté navigateur
 * (`Paddle.Checkout.open({ customer: { email } })`) : afficher sans lier.
 *
 * Pas de `currency_code` non plus : nos prix sont en EUR sans dérogation par pays, et le XOF n'est
 * même pas une devise supportée par Paddle. L'invariant « euro hors zone XOF » de l'autre rail est
 * donc tenu ici par le catalogue lui-même — la zone XOF, elle, reste servie par Chariow.
 */
export function corpsTransactionPaddle(
  cmd: CommandeValidee,
  priceId: string,
  urlRetour: string,
): Record<string, unknown> {
  return {
    items: [{ price_id: priceId, quantity: 1 }],
    collection_mode: 'automatic',
    custom_data: { ref: cmd.ref, offre: cmd.offre, lang: cmd.langue },
    checkout: { url: urlRetour },
  }
}

/**
 * Lit la réponse de création de transaction et la réduit aux deux cas que le navigateur sait
 * traiter. Tout ce qui n'est pas une URL de paiement exploitable est une erreur franche : promettre
 * un paiement sur une réponse ambiguë ferait perdre un client déjà décidé.
 *
 * ⚠️ La vérification n'est PAS un épinglage d'hôte mais une COMPARAISON à ce qu'on a demandé : même
 * origine, même chemin, et un `_ptxn` bien formé en plus. Une regex d'hôte laisserait passer
 * n'importe quelle page du domaine ; ici, la seule URL acceptable est celle que nous avons écrite,
 * ce qui la rend jumelle par construction de l'exception `/tunnel/*` de `landing/_headers`.
 *
 * Un refus de données n'existe pas sur ce rail : le corps envoyé ne contient RIEN que l'acheteur
 * ait saisi (un prix de catalogue, une référence, une URL à nous). Un 400 est donc toujours NOTRE
 * faute de configuration — le classer « données » ferait reprocher à l'acheteur un e-mail correct.
 */
export function lireTransactionCreee(
  status: number,
  corps: unknown,
  urlDemandee: string,
): { ok: true; url: string; transactionId: string } | { ok: false; erreur: 'paddle' } {
  const refus = { ok: false, erreur: 'paddle' } as const
  const data = (corps && typeof corps === 'object')
    ? (corps as { data?: Record<string, unknown> }).data
    : undefined
  if (status !== 200 && status !== 201) return refus
  if (!data) return refus

  const url = (data.checkout as { url?: unknown } | undefined)?.url
  const id = data.id
  if (typeof url !== 'string' || typeof id !== 'string') return refus
  if (!/^txn_[a-z0-9]{26}$/.test(id)) return refus

  let rendue: URL
  let attendue: URL
  try {
    rendue = new URL(url)
    attendue = new URL(urlDemandee)
  } catch {
    return refus
  }
  if (rendue.protocol !== 'https:') return refus
  if (rendue.origin !== attendue.origin || rendue.pathname !== attendue.pathname) return refus
  if (rendue.searchParams.get('_ptxn') !== id) return refus
  // ⚠️ `e` et `lang` AUSSI, et pas par symétrie : `e` CHOISIT le jeton client du tunnel, et son
  // absence retombe sur l'environnement de production dont le jeton peut ne pas être posé. Une URL
  // rendue sans lui passerait cette comparaison pour ouvrir une page incapable de s'initialiser —
  // le serveur journaliserait « ok » pendant que toutes les ventes meurent. « La seule URL
  // acceptable est celle qu'on a écrite » n'est vrai que si on compare TOUT ce qu'on a écrit.
  for (const p of ['e', 'lang']) {
    if (rendue.searchParams.get(p) !== attendue.searchParams.get(p)) return refus
  }

  return { ok: true, url, transactionId: id }
}
