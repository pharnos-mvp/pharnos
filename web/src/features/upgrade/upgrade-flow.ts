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
import { flattenRubrics, specForDocType } from '@specs'
import { DELIVERABLE_TITLES_EN } from '@titles'

/** Une rubrique de la liste « à statuts vivants » — le contrat compact d'`order-status`. */
export interface SectionVivante {
  id: string
  /** `queued` | `running` | `done` | `failed`. */
  st: string
  /** `filled` | `partial` | `missing` — seulement quand `st` vaut `done`. */
  o?: string
}

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
  /** Pays et activité — `null` tant que rien ne les a transportés ; l'écran les redemande alors. */
  country?: string | null
  activity?: string | null
  /** Provenance du corpus (`text`/`ocr`) — la notice « nous lisons page par page » en dépend. */
  sourceKind?: string | null
  /** Langue du document SOURCE, détectée par la porte (LOT B3). */
  sourceLang?: string | null
  /** Nom du produit (rubrique 1) — `null` tant qu'elle n'a pas abouti. */
  produit?: string | null
  /** Rubriques de la passe de conformité, à statuts vivants — l'ordre est celui du gabarit, trié ICI. */
  sections?: SectionVivante[]
  erreur?: string | null
}

/**
 * Documents vendus à l'unité. **Liste FERMÉE**, jumelle de `DOC_TYPES_VENDABLES` côté Edge : le type
 * choisi ici commande le gabarit contre lequel la porte juge la recevabilité, et une notice jugée
 * contre le gabarit du RCP serait refusée pour une raison qui n'existe pas.
 */
export const DOC_TYPES = ['rcp', 'notice', 'labeling'] as const
export type DocType = (typeof DOC_TYPES)[number]

/**
 * Ce que la chaîne sait LIVRER — jumeau de `DOC_TYPES_LIVRABLES` côté serveur. Le sélecteur de
 * l'écran de dépôt n'offre QUE cela : proposer une notice que l'assemblage ne sait pas produire
 * ferait mourir la commande après la dépense moteur. `DOC_TYPES` reste large pour LIRE ce que le
 * serveur rend (`estDocType`) — une commande historique peut porter un autre type.
 */
export const DOC_TYPES_LIVRABLES: readonly DocType[] = ['rcp']

export const estDocType = (v: unknown): v is DocType =>
  typeof v === 'string' && (DOC_TYPES as readonly string[]).includes(v)

/**
 * Plafond du document source — **jumeau de `MAX_SOURCE_BYTES` côté Edge (12 Mo)**.
 *
 * ⚠️ 12 et non 25 : la pièce repart au modèle à chaque appel de conformité et de revue, encodée en
 * base64, et 25 Mo dépassaient la limite de corps de requête du fournisseur — l'échec tombait alors
 * APRÈS le paiement, rubrique par rubrique. Ce jumeau a déjà dérivé une fois (25 ici, 12 là-bas) :
 * si les deux valeurs divergent encore, le refus le plus permissif garde la porte d'entrée.
 */
export const MAX_SOURCE_OCTETS = 12 * 1024 * 1024

/**
 * Les huit pays servis — jumeaux des codes que `lireDemandeDepot` accepte (`^[A-Z]{2}$`) et que
 * `conformity-specs` connaît (`mentions[].requiredFor`). L'écran de dépôt les propose quand la
 * commande n'en porte pas encore : le PONT les transporte dans le cas nominal, mais un acheteur
 * revenu par l'e-mail sans être passé par le pont doit pouvoir les redonner — il les avait choisis
 * avant de payer, et la mention de vigilance 4.8 en dépend.
 */
export const PAYS_UEMOA: readonly { code: string; fr: string; en: string }[] = [
  { code: 'BJ', fr: 'Bénin', en: 'Benin' },
  { code: 'BF', fr: 'Burkina Faso', en: 'Burkina Faso' },
  { code: 'CI', fr: "Côte d'Ivoire", en: "Côte d'Ivoire" },
  { code: 'GW', fr: 'Guinée-Bissau', en: 'Guinea-Bissau' },
  { code: 'ML', fr: 'Mali', en: 'Mali' },
  { code: 'NE', fr: 'Niger', en: 'Niger' },
  { code: 'SN', fr: 'Sénégal', en: 'Senegal' },
  { code: 'TG', fr: 'Togo', en: 'Togo' },
]

export const ACTIVITES: readonly { code: 'amm' | 'renouv'; fr: string; en: string }[] = [
  { code: 'amm', fr: 'Nouvelle AMM', en: 'New MA' },
  { code: 'renouv', fr: 'Renouvellement', en: 'Renewal' },
]

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
  /**
   * Le document est chez nous, mais la tentative automatique s'est arrêtée : il faut la relancer.
   *
   * ⚠️ Cette étape N'EST PAS un `depot`. Le fichier est déjà déposé et le dépôt est déjà décompté :
   * proposer d'en redéposer un en coûterait un second pour un incident réseau qui n'est pas celui
   * de l'acheteur. Ce qu'il lui faut, c'est un bouton — pas un sélecteur de fichier.
   */
  | 'reprise'
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
  options: {
    preparationEnCours?: boolean
    echecLecture?: boolean
    /** Le document est déposé et la porte reste à franchir : une reprise GRATUITE est en main. */
    porteAReprendre?: boolean
  } = {},
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
  // Quelque chose tourne DANS l'onglet : cela prime sur tout le reste.
  // ⚠️ PAS fermable — la préparation (couche texte, puis reconnaissance de caractères) vit ici. Le
  // promettre perdrait le travail et renverrait l'acheteur au dépôt.
  if (options.preparationEnCours) {
    return { etape: 'preparation', progression: 0, fermable: false, peutRedeposer: false }
  }

  // ⚠️ UN ÉCHEC DE LECTURE ROUVRE LE DÉPÔT. `source_uploaded` est écrit par le serveur dès qu'il
  // CONSTATE le fichier, donc bien avant que le navigateur ait su le lire : sans cette sortie, un
  // PDF protégé par mot de passe — cas courant en affaires réglementaires — laissait l'acheteur sur
  // un sablier définitif. Ici, redéposer est bien la bonne réponse : c'est le FICHIER qui est en
  // cause, et son remplaçant vaut son dépôt.
  if (options.echecLecture) {
    return { etape: 'depot', progression: 0, fermable: true, peutRedeposer }
  }

  // ⚠️ `source_uploaded` SANS RIEN EN VOL NE PEUT SIGNIFIER QU'UNE CHOSE : la tentative automatique
  // s'est arrêtée. La page démarre TOUJOURS la préparation sur cet état ; s'y retrouver au repos,
  // c'est que le téléchargement ou la porte a échoué. C'était le dernier sablier définitif de cet
  // écran — un « ne fermez pas cet onglet » sous lequel plus rien ne tournait, sans un bouton.
  //
  // Et ce n'est PAS un `depot` : le fichier est déjà là, son dépôt est déjà décompté. En proposer
  // un second ferait payer à l'acheteur un incident réseau qui n'est pas le sien.
  //
  // ⚠️ `porteAReprendre` ouvre la MÊME sortie par la porte d'à côté, et il le faut. Un téléversement
  // qui RÉUSSIT suivi d'une porte en panne (503 sur une invocation neuve, après avoir porté 25 Mo)
  // laisse le statut serveur à `paid` — `order-gate` n'écrit rien avant d'avoir jugé. L'écran
  // retombait donc sur `depot`, et **son seul bouton facturait le deuxième dépôt sur trois** pour un
  // incident réseau qui n'est pas celui de l'acheteur, alors qu'une reprise gratuite était en main.
  if (resume.statut === 'source_uploaded' || options.porteAReprendre) {
    return { etape: 'reprise', progression: 0, fermable: true, peutRedeposer }
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

/** Une rubrique prête à l'affichage — la liste « à statuts vivants » du mockup, ordonnée gabarit. */
export interface RubriqueVivante {
  id: string
  /** Le numéro AFFICHÉ : `4.2-posologie` se montre « 4.2 », jamais un identifiant interne. */
  num: string
  titre: string
  /** `queued` | `running` | `done` | `failed`. */
  st: string
  /** `filled` | `partial` | `missing` — seulement quand `st` vaut `done`. */
  o?: string
}

/**
 * Ordonne et TITRE la liste vivante sur le gabarit — la même source que le moteur (`@specs`) et
 * que l'assemblage (`@titles`), jamais une liste parallèle. Le serveur n'envoie que des
 * identifiants et des états : transporter les titres à chaque sondage de deux secondes les
 * ferait payer ~150 fois par commande.
 *
 * Une rubrique HORS gabarit (commande historique, gabarit qui a évolué) ferme la marche avec son
 * identifiant pour titre : disparaître serait mentir sur le travail en cours.
 */
export function rubriquesVivantes(
  sections: readonly SectionVivante[] | undefined,
  docType: string | null | undefined,
  lang: 'fr' | 'en',
): RubriqueVivante[] {
  if (!sections?.length) return []
  const spec = specForDocType(docType ?? 'rcp') ?? specForDocType('rcp')
  if (!spec)
    return sections.map((s) => ({
      id: s.id,
      num: s.id,
      titre: s.id,
      st: s.st,
      ...(s.o ? { o: s.o } : {}),
    }))
  const parId = new Map(sections.map((s) => [s.id, s]))
  const out: RubriqueVivante[] = []
  for (const r of flattenRubrics(spec)) {
    const s = parId.get(r.id)
    if (!s) continue
    const titre = (lang === 'en' ? DELIVERABLE_TITLES_EN.get(r.id) : undefined) ?? r.title
    out.push({
      id: r.id,
      num: r.id.split('-')[0] ?? r.id,
      titre,
      st: s.st,
      ...(s.o ? { o: s.o } : {}),
    })
    parId.delete(r.id)
  }
  for (const s of parId.values()) {
    out.push({ id: s.id, num: s.id, titre: s.id, st: s.st, ...(s.o ? { o: s.o } : {}) })
  }
  return out
}

/** La rubrique EN COURS — celle du titre « Rubrique 4.8 sur 29 » et du défilement automatique. */
export const rubriqueEnCours = (rubriques: readonly RubriqueVivante[]): RubriqueVivante | null =>
  rubriques.find((r) => r.st === 'running') ?? null

/** « 4 min 12 » — la durée RÉELLE du mockup, jamais une estimation reformatée. */
export function dureeLisible(secondes: number, lang: 'fr' | 'en'): string {
  const s = Math.max(0, Math.round(secondes))
  if (s < 60) return `${s} s`
  const m = Math.floor(s / 60)
  const r = s % 60
  if (!r) return `${m} min`
  return lang === 'fr'
    ? `${m} min ${String(r).padStart(2, '0')}`
    : `${m} min ${String(r).padStart(2, '0')} s`
}

/**
 * Le bandeau contexte du mockup : « KV-KACIN 500 · Burkina Faso · Nouvelle AMM ·
 * anglais → français ». Chaque segment n'apparaît que s'il est SU — un bandeau qui devine
 * afficherait le mauvais pays sous un document payé. `null` quand rien n'est su.
 */
export function bandeauContexte(
  r: Pick<ResumeCommande, 'produit' | 'country' | 'activity' | 'sourceLang'> | null,
  lang: 'fr' | 'en',
): string | null {
  if (!r) return null
  const fr = lang === 'fr'
  const parts: string[] = []
  if (r.produit) parts.push(r.produit)
  const pays = PAYS_UEMOA.find((p) => p.code === r.country)
  if (pays) parts.push(fr ? pays.fr : pays.en)
  const act = ACTIVITES.find((a) => a.code === r.activity)
  if (act) parts.push(fr ? act.fr : act.en)
  if (r.sourceLang === 'en') parts.push(fr ? 'anglais → français' : 'English → French')
  else if (r.sourceLang === 'fr') parts.push(fr ? 'français → anglais' : 'French → English')
  return parts.length ? parts.join(' · ') : null
}

/**
 * Le libellé d'une passe suit la LANGUE SOURCE (LOT B3) — jamais un mensonge de vocabulaire.
 *
 * ⚠️ Pour une source ANGLAISE, « Traduction anglaise » est absurde : le document de l'acheteur
 * EST anglais. Ce qu'il reçoit de la passe 1, c'est la VERSION FRANÇAISE du gabarit ; de la
 * passe 2, sa version anglaise remise au standard. Une source française garde les libellés
 * historiques. Une phase inconnue retombe sur la première, jamais sur un libellé vide — le
 * serveur peut nommer une passe que cette version de la page ne connaît pas encore.
 */
export function libellePhase(
  phase: string,
  sourceLang: string | null | undefined,
): { fr: string; en: string } {
  const sourceEn = sourceLang === 'en'
  const conformity = sourceEn
    ? { fr: 'Version française', en: 'French version' }
    : { fr: 'Mise en conformité', en: 'Compliance pass' }
  const libelles: Record<string, { fr: string; en: string }> = {
    conformity,
    translation: sourceEn
      ? { fr: 'Version anglaise au standard', en: 'English version to the standard' }
      : { fr: 'Traduction anglaise', en: 'English translation' },
    report: { fr: 'Revue réglementaire', en: 'Regulatory review' },
  }
  return libelles[phase] ?? conformity
}

/**
 * Temps restant estimé, en secondes — `null` tant qu'on ne sait rien de fiable.
 *
 * ⚠️ C'est une PROMESSE au client, pas une mesure : elle doit couvrir le cas DÉFAVORABLE, pas le
 * nominal. La chaîne mesurée tient en ~320 s (319 s pour 60 appels au banc U0, ~7 min dépôt→e-mail
 * à la recette) — mais un tableau de revue peut consommer son plafond entier, les bascules de
 * phase attendent le tick suivant (30 s chacune), et depuis la relance automatique un run qui
 * trébuche repart sans rien demander à personne : chaque relance ajoute plusieurs minutes. Le
 * décompte part donc de 15 min et FINIT EN AVANCE dans le cas courant — décision CEO 2026-08-11 :
 * une barre qui finit tôt rassure, une barre qui dépasse son annonce inquiète, et l'acheteur ne
 * doit jamais voir l'estimation s'allonger sous ses yeux.
 */
export const DUREE_TOTALE_S = 900

/**
 * Parts de chaque passe dans la durée totale — les MESURES de U0.3, pas des tiers égaux.
 *
 * | Passe | Mesuré | Part |
 * |---|---|---|
 * | conformité | 148,7 s | 0,47 |
 * | traduction | 56,4 s | 0,17 |
 * | revue | 114,1 s | 0,36 |
 *
 * ⚠️ Découpée depuis, la revue reste la même somme de travail : le découpage change le nombre
 * d'appels, pas ce qu'ils produisent.
 */
const PART_PASSE: Record<string, { avant: number; poids: number }> = {
  conformity: { avant: 0, poids: 0.47 },
  translation: { avant: 0.47, poids: 0.17 },
  report: { avant: 0.64, poids: 0.36 },
}

/**
 * ⚠️ L'estimation replie la PHASE dans la progression, et c'était le défaut : `vue.progression`
 * est l'avancement de la phase COURANTE (décision de `resumer()` — un compteur global reculerait),
 * or on la multipliait par la durée des TROIS passes. À 34/34 de conformité l'écran annonçait
 * « 10 s », puis la traduction démarrait à 0/34 et il annonçait « 6 min » : l'estimation
 * REMONTAIT sous les yeux de l'acheteur — mot pour mot ce que le commentaire de `DUREE_TOTALE_S`
 * interdit, et le test d'alors verrouillait le défaut au lieu de le voir.
 *
 * Une phase inconnue ne prétend rien : `null` vaut mieux qu'un chiffre faux.
 */
export function resteEstimeS(vue: VueUpgrade, phase: string): number | null {
  if (vue.etape !== 'traitement') return null
  const part = PART_PASSE[phase]
  if (!part) return null
  const global = part.avant + part.poids * vue.progression
  return Math.max(10, Math.round(DUREE_TOTALE_S * (1 - global)))
}
