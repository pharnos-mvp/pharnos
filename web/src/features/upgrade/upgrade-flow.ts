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
  /** `null` tant qu'aucun dépôt n'a eu lieu : la commande naît du webhook, qui l'ignore. */
  docType?: string | null
  erreur?: string | null
}

/**
 * Documents vendus à l'unité. **Liste FERMÉE**, jumelle de `DOC_TYPES_VENDABLES` côté Edge : le type
 * choisi ici commande le gabarit contre lequel la porte juge la recevabilité, et une notice jugée
 * contre le gabarit du RCP serait refusée pour une raison qui n'existe pas.
 */
export const DOC_TYPES = ['rcp', 'notice', 'labeling'] as const
export type DocType = (typeof DOC_TYPES)[number]

export const estDocType = (v: unknown): v is DocType =>
  typeof v === 'string' && (DOC_TYPES as readonly string[]).includes(v)

/** Plafond du document source — jumeau de `MAX_SOURCE_BYTES` côté Edge. */
export const MAX_SOURCE_OCTETS = 25 * 1024 * 1024

export type RefusFichier = 'vide' | 'type' | 'taille'

/**
 * Le fichier choisi peut-il partir ?
 *
 * ⚠️ Ce contrôle N'EST PAS la garantie — le serveur reconstate le type et la taille RÉELS sur
 * l'objet déposé, parce qu'une URL signée ne contraint ni l'un ni l'autre. Il est là pour une autre
 * raison, tout aussi concrète : refuser ici ne coûte rien, alors que laisser partir un `.docx`
 * consomme un dépôt sur les trois d'une commande payée.
 *
 * Le type MIME ne suffit pas à lui seul : certains systèmes rendent une chaîne vide sur un PDF
 * légitime. On accepte alors sur l'extension plutôt que de refuser un fichier valide.
 */
export function validerFichierSource(fichier: {
  name: string
  size: number
  type: string
}): RefusFichier | null {
  if (!fichier.size) return 'vide'
  const estPdf =
    fichier.type === 'application/pdf' ||
    (!fichier.type && fichier.name.toLowerCase().endsWith('.pdf'))
  if (!estPdf) return 'type'
  if (fichier.size > MAX_SOURCE_OCTETS) return 'taille'
  return null
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
  options: { preparationEnCours?: boolean; echecLecture?: boolean } = {},
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
  // ⚠️ UN ÉCHEC DE LECTURE ROUVRE LE DÉPÔT — et cette sortie doit venir AVANT la préparation.
  //
  // `source_uploaded` est écrit par le serveur dès qu'il CONSTATE le fichier, donc bien avant que
  // le navigateur ait réussi à le lire. Sans cette sortie, un PDF protégé par mot de passe — cas
  // courant en affaires réglementaires — laissait l'acheteur sur un sablier définitif : étape
  // « préparation », aucun sondage, aucun bouton, et un rechargement qui relit le même fichier
  // illisible. Ses deux dépôts restants étaient inatteignables sur une commande déjà payée.
  //
  // Elle passe APRÈS `running` : une fois le travail lancé, l'échec de lecture appartient au passé.
  if (options.echecLecture && !options.preparationEnCours) {
    return { etape: 'depot', progression: 0, fermable: true, peutRedeposer }
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

/**
 * Faut-il demander au serveur s'il détient déjà un document, avant d'en réclamer un à l'acheteur ?
 *
 * ⚠️ **`gated_out` en est EXCLU, et c'est l'essentiel de cette fonction.** Après un refus, le
 * document le plus récemment déposé est précisément celui que la porte vient d'écarter : le
 * redemander au serveur, ce serait le re-préparer, le re-soumettre, se le voir refuser à
 * nouveau — et consommer les trois dépôts d'une commande payée en boucle, sans que l'acheteur
 * n'ait jamais eu l'occasion de fournir le bon fichier.
 *
 * Les deux états retenus sont ceux où un document présent NE PEUT PAS être un document refusé :
 * `paid` (le pont vient peut-être de téléverser) et `source_uploaded` (constaté, en cours de
 * préparation — la page a pu être rechargée).
 */
export const doitChercherSource = (resume: ResumeCommande | null): boolean =>
  resume?.statut === 'paid' || resume?.statut === 'source_uploaded'

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
