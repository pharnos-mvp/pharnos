/**
 * Ce que l'acheteur VOIT, à partir de ce que le serveur DIT — module pur (aucun React, aucun réseau).
 *
 * POURQUOI IL EST SÉPARÉ DE L'ÉCRAN. Cette page est atteinte par un acheteur qui vient de payer
 * 19 000 F et qui n'a pas de compte : c'est le seul endroit du produit où une erreur d'affichage se
 * traduit directement en litige. Trois décisions y sont commercialement sensibles — dire qu'un
 * refus n'a rien coûté, ne jamais annoncer « prêt » avant que ce soit vrai, et ne jamais présenter
 * une panne comme une attente. Enfouies dans un composant, elles ne seraient testables qu'au
 * travers d'un rendu ; ici, elles se vérifient à la ligne.
 */

/** Le résumé rendu par l'Edge `order-status`. */
export interface ResumeCommande {
  statut: string
  phase: string
  faites: number
  total: number
  echecs: number
  pret: boolean
  depositsLeft: number
  expireLe: string
  erreur?: string | null
}

export type EtapeUpgrade =
  /** Aucun document déposé, ou refusé : on (re)demande le fichier. */
  | 'depot'
  /** Le navigateur lit le PDF (couche texte, sinon reconnaissance de caractères). */
  | 'preparation'
  /** Le moteur travaille. C'est ici que l'acheteur peut fermer l'onglet. */
  | 'traitement'
  /** Les cinq fichiers sont récupérables. */
  | 'livraison'
  /** Panne : le travail s'est arrêté et ne reprendra pas seul. */
  | 'panne'
  /** Le lien a expiré (30 jours) ou la commande est introuvable. */
  | 'expire'

export interface VueUpgrade {
  etape: EtapeUpgrade
  /** 0 → 1 sur la PHASE en cours, jamais sur le travail total (le compteur reculerait). */
  progression: number
  /** `true` quand l'acheteur peut fermer l'onglet sans rien perdre — la promesse de la maquette. */
  fermable: boolean
  /** Un nouveau dépôt est-il encore possible ? */
  peutRedeposer: boolean
}

/**
 * Traduit l'état serveur en étape d'écran.
 *
 * ⚠️ `pret` vient du STATUT de la commande, jamais d'un décompte : entre deux phases, les compteurs
 * sont légitimement à zéro sur la nouvelle, et « 0 sur 0 » vaut mathématiquement 100 %. Annoncer
 * « prêt » sur cette base ferait cliquer l'acheteur sur un téléchargement qui n'existe pas encore.
 */
export function vueDepuis(
  resume: ResumeCommande | null,
  options: { preparationEnCours?: boolean } = {},
): VueUpgrade {
  if (!resume) {
    return { etape: 'expire', progression: 0, fermable: false, peutRedeposer: false }
  }

  const peutRedeposer = resume.depositsLeft > 0

  if (resume.pret) {
    return { etape: 'livraison', progression: 1, fermable: true, peutRedeposer: false }
  }
  if (resume.statut === 'failed') {
    return { etape: 'panne', progression: 0, fermable: false, peutRedeposer }
  }
  if (resume.statut === 'running') {
    // Le total peut valoir 0 le temps que la phase suivante se remplisse : diviser par lui donnerait
    // `NaN`, qui traverse silencieusement une barre de progression et l'affiche vide ou pleine
    // selon le navigateur.
    const progression = resume.total > 0 ? Math.min(1, resume.faites / resume.total) : 0
    return { etape: 'traitement', progression, fermable: true, peutRedeposer: false }
  }
  // `source_uploaded` : le fichier est arrivé, le navigateur doit encore le lire avant la porte.
  if (options.preparationEnCours || resume.statut === 'source_uploaded') {
    // ⚠️ PAS fermable : la préparation (couche texte, puis reconnaissance de caractères) tourne
    // DANS l'onglet. Le promettre ici perdrait le travail et renverrait l'acheteur au dépôt.
    return { etape: 'preparation', progression: 0, fermable: false, peutRedeposer: false }
  }
  // `paid` (jamais déposé) et `gated_out` (refusé, sans crédit consommé).
  return { etape: 'depot', progression: 0, fermable: true, peutRedeposer }
}

/** Une commande refusée à la porte a-t-elle épuisé ses tentatives ? */
export const enImpasse = (resume: ResumeCommande | null): boolean =>
  resume?.statut === 'gated_out' && resume.depositsLeft <= 0

/**
 * Faut-il continuer à interroger le serveur ?
 *
 * ⚠️ Sonder sans fin une commande terminée, en panne ou en attente de dépôt, c'est ~150 requêtes
 * inutiles par onglet oublié — et cette surface est publique. On s'arrête dès qu'un état stable
 * est atteint.
 */
export function doitSonder(vue: VueUpgrade): boolean {
  return vue.etape === 'traitement'
}

/** Intervalle de sondage, en millisecondes (§2.3, étape 9 du plan). */
export const SONDAGE_MS = 2_000

/**
 * Temps restant estimé, en secondes — `null` tant qu'on ne sait rien de fiable.
 *
 * Fondé sur la durée MESURÉE d'une chaîne complète (319 s pour 60 appels), pas sur une moyenne
 * glissante des rubriques déjà faites : les trois passes n'ont pas le même coût unitaire, et une
 * extrapolation depuis la conformité annoncerait deux minutes là où il en reste cinq. Une estimation
 * qui s'allonge sous les yeux du client est pire que pas d'estimation.
 */
export const DUREE_TOTALE_S = 320

export function resteEstimeS(vue: VueUpgrade): number | null {
  if (vue.etape !== 'traitement') return null
  return Math.max(10, Math.round(DUREE_TOTALE_S * (1 - vue.progression)))
}
