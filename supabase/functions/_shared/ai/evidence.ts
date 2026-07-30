// Contrôle `source_evidence` (lot M2) — module PUR (ni SDK, ni réseau, ni API Deno).
//
// PLAN-MOTEUR-IA §3.2 : le modèle cite le passage source qui justifie ce qu'il écrit, et on vérifie
// EN CODE que cette citation figure réellement dans le document déposé. C'est ce qui fait passer la
// garantie zéro-hallucination d'une promesse de prompt à un contrôle exécutable.
//
// ⚠️ Ce contrôle appartient à la fonction qui ÉCRIT la rubrique (§8.2), jamais à l'affichage :
// une garantie posée au rendu se contourne en changeant d'appelant.
//
// Quatre façons de le rendre inutile, toutes fermées ici :
//  - citer trois caractères (« na », « X ») → `too_short` ;
//  - citer trois mots vides (« de la vue ») → `too_short` (cf. `substantial`) ;
//  - recopier tout le document source → `too_long` (plafond aussi RELATIF à la taille de la source) ;
//  - citer le TITRE de la rubrique — présent dans tout document du même type, donc « vrai » partout :
//    le titre est retranché avant jugement, et ce qui reste doit encore désigner un passage.
//
// ⚠️ **Ce que ce contrôle ne prouve PAS.** Il établit que la citation existe dans le document, pas
// que `content` en découle. Pour une rubrique en prose, un contenu inventé accompagné d'une citation
// réelle mais hors sujet passe — l'implication sémantique n'est pas décidable en code. D'où le
// second contrôle `ungroundedFigures`, qui ancre ce qui ne se paraphrase pas (dosages, dates,
// numéros), et d'où le juge IA du §3.3 : sur échantillon, en recette, jamais dans la boucle.
// Le dire est le contraire d'un aveu de faiblesse : une garantie dont on ignore la portée exacte
// n'est pas une garantie.
//
// Les seuils sont exportés : le banc d'essai M3 les règle sur des chiffres, pas sur une intuition.

import type { SectionStatus } from './section-schema.ts'

/**
 * Longueur minimale d'une citation (après normalisation). En dessous, la citation se retrouve par
 * hasard dans n'importe quel document et la vérification ne prouve plus rien.
 */
export const MIN_EVIDENCE_CHARS = 16

/**
 * ...sauf si la citation compte assez de MOTS, dont un vraiment porteur. « GYNORIL 500 mg » fait
 * 14 caractères et justifie parfaitement la rubrique 1 : la refuser rejouerait puis rétrograderait
 * une rubrique correcte, et gonflerait la métrique du §7 avec un défaut de seuil, pas une invention.
 */
export const MIN_EVIDENCE_WORDS = 3

/**
 * Longueur maximale d'une citation. Recopier la source entière rendrait le contrôle vrai par
 * construction — et fausserait le taux de rejet, qui est LA métrique qualité du lot M3 (§7).
 */
export const MAX_EVIDENCE_CHARS = 2_000

/**
 * Plafond RELATIF : sur une source courte (lettre de PGHT…), 2 000 caractères absolus laisseraient
 * passer une recopie intégrale. En deçà de `RELATIVE_CAP_FLOOR` la source est trop petite pour que
 * la proportion veuille dire quelque chose.
 */
const MAX_EVIDENCE_RATIO = 0.6
const RELATIVE_CAP_FLOOR = 400

export type EvidenceVerdict =
  /** La citation figure mot pour mot dans la source : la rubrique est justifiée. */
  | 'verified'
  /**
   * Citation retrouvée dans un texte issu d'une RECONNAISSANCE DE CARACTÈRES, à la tolérance près.
   * Garantie RÉELLE mais moindre que `verified` : le corpus de contrôle est une reconstruction, pas
   * l'original. Ne se produit que sur une source scannée, et le dire est le contraire d'un aveu —
   * une garantie dont on ignore la portée n'est pas une garantie.
   */
  | 'verified_ocr'
  /** Citation absente de la source — la rubrique est à rejouer. */
  | 'not_found'
  /** Citation trop courte, ou réduite au titre de la rubrique : elle ne désigne aucun passage. */
  | 'too_short'
  /** Citation démesurée (recopie de la source). */
  | 'too_long'
  /** Rubrique déclarée absente : il n'y a rien à justifier. */
  | 'not_required'
  /** Aucun texte source exploitable (PDF non extrait) : le contrôle n'a PAS pu s'exercer. */
  | 'unverifiable'
  /** Aucune tentative de génération n'a eu lieu : il n'y a rien à juger. */
  | 'not_attempted'

/**
 * Source normalisée UNE fois, puis partagée par toutes les vérifications d'une même exécution.
 * ⚠️ Aujourd'hui une rubrique = une invocation Edge : le partage ne joue qu'à l'intérieur d'un
 * appel. Il prendra tout son sens dans le worker asynchrone (M4), qui enchaîne les 28 rubriques.
 */
export interface PreparedSource {
  readonly normalized: string
  /** Même texte sans aucun trait d'union — repli pour les mots composés (voir `verifyEvidence`). */
  readonly deHyphenated: string
  /** Valeurs chiffrées du document, en JETONS canoniques — voir `ungroundedFigures`. */
  readonly figures: ReadonlySet<string>
  /** `false` quand aucun texte source n'est disponible — le contrôle est alors impossible, pas réussi. */
  readonly available: boolean
  /**
   * Provenance du corpus de contrôle. `'text'` = couche texte du document, fidèle au caractère près.
   * `'ocr'` = reconstruction par reconnaissance de caractères : les mots survivent, **les chiffres
   * pas nécessairement** (`0/O`, `1/l`, `5/S`, `8/B` se confondent). La rigueur des contrôles s'y
   * adapte — exiger l'exactitude sur un texte reconstruit ferait rétrograder des rubriques justes.
   */
  readonly kind: SourceKind
  /**
   * Positions intouchables du corpus (chiffres, séparateurs, unités) — voir `protectedMask`.
   * Calculé UNE fois, et seulement pour un corpus océrisé : sa place est ici, à côté de
   * `deHyphenated` et `figures`, parce qu'il décrit le CORPUS et non un rapprochement.
   *
   * ⚠️ Ne pas y voir l'explication du coût par appel : mesuré, ce masque ne pèse qu'une fraction du
   * milliseconde sur 60 000 caractères. Le terme qui domine est le balayage du corpus par la
   * programmation dynamique, O(citation × corpus), incompressible même pour une citation d'un
   * caractère. Ce déplacement retire une passe, il ne retire pas la part fixe.
   */
  readonly protectedRegions: Uint8Array
}

/** D'où vient le corpus de contrôle. Décide de la rigueur applicable, pas de la qualité du livrable. */
export type SourceKind = 'text' | 'ocr'

/**
 * Part de la citation qu'une reconnaissance de caractères peut avoir altérée.
 *
 * Généreux face à la réalité mesurée — une OCR correcte se trompe sur 1 à 2 % des caractères — et
 * six fois plus strict qu'une tolérance « au quart ». Le budget est PROPORTIONNEL à la longueur :
 * une citation longue subit plus d'erreurs de lecture qu'une courte, mais dans la même proportion.
 */
export const OCR_MAX_EDIT_RATIO = 0.08

/**
 * En deçà, AUCUNE tolérance : sur une chaîne courte, deux éditions ne corrigent plus une lecture,
 * elles changent le mot. C'est là que le contrôle doit être le plus strict, pas le plus souple.
 */
const OCR_MIN_MATCH_CHARS = 12

/**
 * Longueur d'ancrage maximale du rapprochement approché — le seul rôle de cette borne est le CPU
 * (2 s par requête Edge, §8.6). Une citation plus longue est jugée sur ses 600 premiers caractères :
 * 600 caractères contigus retrouvés à 8 % près sont déjà une preuve d'existence très forte.
 */
export const OCR_MAX_ANCHOR_CHARS = 600

/** Comment un passage a été retrouvé dans le corpus de contrôle — ou pas du tout. */
export type SourceMatch = 'exact' | 'ocr' | 'absent'

function ocrEditBudget(length: number): number {
  if (length < OCR_MIN_MATCH_CHARS) return 0
  return Math.max(1, Math.floor(length * OCR_MAX_EDIT_RATIO))
}

/** Coût interdit — assez grand pour dépasser tout budget, assez petit pour ne pas déborder d'`Int32`. */
const IMPOSSIBLE = 1 << 20

const isDigit = (code: number) => code >= 48 && code <= 57

/** Espace — la seule qui subsiste après normalisation, qui compacte tout le blanc. */
const SPACE = 32

/**
 * Substitutions LETTRE ↔ LETTRE tolérées à l'intérieur d'un nombre ou de son unité — et elles seules.
 *
 * ⚠️ Une substitution libre y coûterait tout : `µg` et `mg` ont la MÊME longueur, donc `5 µg/kg/min`
 * s'alignait sur `5 mg/kg/min` pour une seule édition. Facteur mille sur une posologie pédiatrique,
 * la population la plus exposée. Ne sont donc admises que les confusions réellement graphiques et
 * SANS effet sur la magnitude : `i`/`l`/`|` entre eux, et `μ`/`u` (« ug » pour « μg »). `m` ↔ `μ`,
 * `m` ↔ `n`, `c` ↔ `g` sont exclus — chacun déplace la virgule de trois rangs ou plus.
 *
 * Le prix assumé : une lecture fautive DANS une unité (« rnl » pour « ml ») rend la citation
 * invérifiable et fait rejouer la rubrique. Refuser vaut mieux qu'un dosage divisé par mille.
 */
// ⚠️ `MU` est le mu GREC (U+03BC), et non le signe micro (U+00B5) : NFKC replie le second sur le
// premier, et les deux côtés de la comparaison sont normalisés. Utiliser le signe micro rendrait la
// règle inopérante — et MUETTE, puisqu'elle échouerait en refusant, ce qui ressemble à un contrôle
// qui fonctionne. Un test le verrouille.
const MU = 0x03bc
const CODE_I = 105
const CODE_L = 108
const CODE_BAR = 124
const CODE_U = 117

const isIlBar = (c: number) => c === CODE_I || c === CODE_L || c === CODE_BAR

/**
 * ⚠️ Prédicat NUMÉRIQUE, sans allocation. Une table de chaînes interrogée par
 * `String.fromCharCode(x)` + `includes` dans la boucle interne coûtait **le triple** du calcul
 * complet (1 141 ms au lieu de 303 pour une citation de 590 caractères, mesuré) et rapprochait
 * dangereusement le mur des 2 s de CPU. Le contrôle et sa tenue en production sont le même sujet.
 */
function letterConfusable(a: number, b: number): boolean {
  if (isIlBar(a) && isIlBar(b)) return true
  return (a === MU && b === CODE_U) || (a === CODE_U && b === MU)
}

/**
 * Unités pharmaceutiques — vocabulaire FERMÉ, et c'est ce qui le rend juste.
 *
 * ⚠️ Un simple critère de longueur ne peut pas distinguer une unité d'un mot : « 5.3 Sécurité » et
 * « 4.2 Posologie » sont le motif le plus courant d'un RCP, et geler le titre qui suit un numéro de
 * rubrique ferait refuser presque toutes les citations. Un domaine réglementaire a l'avantage d'avoir
 * une nomenclature d'unités close : on l'énumère.
 *
 * Une unité absente de cette liste n'est pas protégée — le CHIFFRE l'est toujours, donc le risque
 * résiduel se limite à l'échange d'une unité exotique. À compléter quand un dossier en révèle une.
 */
/**
 * Bases d'unités PRÉFIXABLES. Le vocabulaire est ENGENDRÉ, pas énuméré : « 500 kui/dose » (titre
 * vaccinal) et « 5 μmol/l » sont des notations réelles, et lister les formes une à une laissait
 * toujours un préfixe dehors — donc un numérateur libre, donc « ui » pour « kui », facteur mille sans
 * aucun signal. Fermer la famille vaut mieux que courir après les instances.
 */
const UNIT_BASES = ['g', 'l', 'm', 'mol', 'ui', 'iu', 'bq', 's', 'j', 'w', 'eq', 'osm', 'val', 'kat']

/**
 * Préfixes SI utiles en pharmacie. ⚠️ La casse est perdue : les deux côtés sont mis en bas de casse,
 * donc `M` (méga) et `m` (milli) se confondent. Sans conséquence ici — le rôle de cette table est de
 * décider ce qui est GELÉ, et les deux formes doivent l'être.
 */
const UNIT_PREFIXES = ['', 'p', 'n', 'μ', 'u', 'm', 'c', 'd', 'da', 'h', 'k', 'g', 't']

/**
 * Unités pharmaceutiques — vocabulaire FERMÉ, et c'est ce qui le rend juste.
 *
 * ⚠️ Un simple critère de longueur ne peut pas distinguer une unité d'un mot : « 5.3 Sécurité » et
 * « 4.2 Posologie » sont le motif le plus courant d'un RCP, et geler le titre qui suit un numéro de
 * rubrique ferait refuser presque toutes les citations. Un domaine réglementaire a l'avantage d'avoir
 * une nomenclature d'unités close : on l'énumère, et on l'engendre là où elle se décline.
 */
const UNIT_TOKENS = new Set<string>([
  // formes non préfixables
  'm2', 'm3', 'cm2', 'mm2', 'mmhg', 'mosm', 'ppm', 'pfu', 'cfu', 'ufc', '°c', '°', '%',
  // ⚠️ Notation « mc » du micro, courante dans les dossiers anglo-saxons et NON dérivable d'un
  // préfixe SI : l'engendrement seul l'aurait perdue, et « 250 mcg » se serait aligné sur
  // « 250 mg » — le « c » de la citation redevenant supprimable faute d'unité reconnue.
  'mcg', 'mcl', 'mcmol',
  // temps — abréviations ET formes pleines. « 24 heures » et « 24 jours » se confondent aussi
  // sûrement que « 24 h » et « 24 j » : n'en protéger qu'une forme laissait la seconde nue.
  'h', 'j', 'min', 'sem',
  'seconde', 'secondes', 'minute', 'minutes', 'heure', 'heures', 'jour', 'jours',
  'semaine', 'semaines', 'mois', 'an', 'ans', 'annee', 'annees', 'année', 'années',
  // DÉNOMINATEURS d'une dose unitaire — patches, inhalateurs, sprays, vaccins. Leur absence laissait
  // « 0,5 g/dose » s'aligner sur « 0,5 mg/dose » : le dénominateur n'étant pas reconnu, le
  // NUMÉRATEUR redevenait libre. Notations standard, pas cas de laboratoire.
  'dose', 'doses', 'pulverisation', 'pulverisations', 'pulvérisation', 'pulvérisations',
  'bouffee', 'bouffees', 'bouffée', 'bouffées', 'inhalation', 'inhalations',
  'application', 'applications', 'goutte', 'gouttes',
  'unite', 'unites', 'unité', 'unités',
  // ⚠️ Unités en TOUTES LETTRES — et c'est la forme la plus dangereuse à laisser nue, parce que la
  // réglementation demande de l'écrire pour ÉVITER la confusion μg/mg : elle apparaît donc là où
  // cette confusion coûte le plus cher. « 250 microgrammes » contre « 250 milligrammes » = trois
  // substitutions, sous le budget dès qu'une citation dépasse ~80 caractères, c'est-à-dire toujours.
  // La protection n'était qu'un accident d'arithmétique sur les citations courtes.
  'picogramme', 'picogrammes', 'nanogramme', 'nanogrammes',
  'microgramme', 'microgrammes', 'milligramme', 'milligrammes',
  'gramme', 'grammes', 'kilogramme', 'kilogrammes',
  'microlitre', 'microlitres', 'millilitre', 'millilitres',
  'centilitre', 'centilitres', 'decilitre', 'decilitres', 'décilitre', 'décilitres',
  'litre', 'litres',
  'micromole', 'micromoles', 'millimole', 'millimoles', 'mole', 'moles',
  'cal', 'kcal', 'calorie', 'calories', 'kilocalorie', 'kilocalories',
  // ...et leurs formes ANGLAISES : les sources anglophones sont la moitié du flux (KV-Kacin, Bénin).
  'picogram', 'picograms', 'nanogram', 'nanograms',
  'microgram', 'micrograms', 'milligram', 'milligrams',
  'gram', 'grams', 'kilogram', 'kilograms',
  'microlitre', 'microlitres', 'microliter', 'microliters',
  'millilitre', 'millilitres', 'milliliter', 'milliliters',
  'liter', 'liters',
  'micromole', 'micromoles', 'millimole', 'millimoles',
  // dilutions homéopathiques — « 5 ch » et « 5 dh » ne diffèrent que d'une lettre
  'ch', 'dh',
  // ...et toutes les formes préfixées des bases ci-dessus.
  ...UNIT_PREFIXES.flatMap((p) => UNIT_BASES.map((b) => p + b)),
])

/**
 * Le jeton qui suit un nombre est-il une unité ? Composition par `/` admise (`mg/kg/j`, `ui/ml`,
 * `μg/kg/min`) : chaque part doit être une unité connue. La ponctuation finale est retirée —
 * « 500 mg. » se termine par un point de phrase, pas par une unité inconnue.
 */
function isUnitToken(token: string): boolean {
  const t = token.replace(/[.,;:)\]]+$/, '')
  if (t.length === 0) return false
  if (UNIT_TOKENS.has(t)) return true
  const parts = t.split('/')
  // ⚠️ Une partie VIDE est admise : le balayage du jeton s'arrête sur un chiffre, donc « 5 mg/24 h »
  // ne livre que « mg/ ». Refuser cette forme laissait le numérateur libre, et « 5 g/24 h »
  // s'alignait sur « 5 mg/24 h » — facteur mille sur un patch transdermique, sans aucun signal
  // d'ancrage puisque le chiffre est intact. Le dénominateur chiffré, lui, est déjà protégé.
  return parts.length > 1 && parts.every((p) => p === '' || UNIT_TOKENS.has(p))
}

/**
 * Coût de substitution dès qu'un CHIFFRE est en jeu — le point qui décide de la valeur réelle du
 * contrôle sur un document scanné.
 *
 * ⚠️ **Deux chiffres différents ne se rapprochent JAMAIS.** Une OCR qui lit `5OO` pour `500` confond
 * un chiffre et une LETTRE ; elle ne lit pas `250` pour `500`. Accorder aux chiffres la tolérance
 * générale de 8 % laisserait passer une posologie doublée sous un verdict « citation vérifiée » —
 * défaut trouvé en revue, et d'autant plus grave que les valeurs sont par ailleurs consultatives sur
 * un scan : les deux contrôles tomberaient ensemble, sur le même chemin.
 */
function digitCost(digit: number, other: number): number {
  if (isDigit(other)) return IMPOSSIBLE
  // Comparaisons numériques, pas de chaîne : cette fonction est appelée dans la boucle interne.
  switch (digit) {
    case 48:
      return other === 111 ? 1 : IMPOSSIBLE // 0 / o
    case 49:
      return isIlBar(other) ? 1 : IMPOSSIBLE // 1 / i / l / |
    case 50:
      return other === 122 ? 1 : IMPOSSIBLE // 2 / z
    case 52:
      return other === 97 ? 1 : IMPOSSIBLE // 4 / a
    case 53:
      return other === 115 ? 1 : IMPOSSIBLE // 5 / s
    case 54:
    case 57:
      return other === 103 ? 1 : IMPOSSIBLE // 6 / g · 9 / g
    case 55:
      return other === 116 ? 1 : IMPOSSIBLE // 7 / t
    case 56:
      return other === 98 ? 1 : IMPOSSIBLE // 8 / b
    default:
      return IMPOSSIBLE // 3 : aucune confusion crédible
  }
}

/**
 * Longueur maximale d'un jeton candidat au statut d'unité. Ce n'est plus qu'une borne de BALAYAGE :
 * depuis que `isUnitToken` décide sur un vocabulaire fermé, c'est lui qui protège — un plafond serré
 * n'ajoutait aucune sûreté et retirait des unités réelles. `mg/pulverisations` fait 17 caractères,
 * `mg/application` 14 : à 10, un spray nasal restait alignable sur sa version mille fois plus dosée.
 */
const MAX_UNIT_CHARS = 24

/**
 * Positions INTOUCHABLES d'un texte : ni suppression, ni saut. Substitution toujours permise —
 * c'est elle qui porte la tolérance de lecture.
 *
 * ⚠️ **La magnitude d'une posologie vit pour MOITIÉ dans des lettres.** Protéger les chiffres seuls
 * laissait `250 g` s'aligner sur `250 mg` et `10 ml` sur `10 l` : facteur mille sur un dosage, livré
 * en `verified_ocr` — et cette fois **sans aucun signal**, puisque le jeton chiffré est intact et que
 * `ungroundedFigures` ne voit donc rien à lister. Sont donc gelés :
 *
 *  1. les chiffres eux-mêmes ;
 *  2. le séparateur encadré de chiffres — sinon `1,25` s'aligne sur `12,5`, chiffres identiques et
 *     dans l'ordre, pour le seul déplacement d'une virgule ;
 *  3. le jeton court qui SUIT immédiatement un nombre, c'est-à-dire son unité.
 */
function protectedMask(s: string): Uint8Array {
  const mask = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i)
    if (isDigit(c)) {
      mask[i] = 1
      continue
    }
    // Séparateur (point, virgule, espace) entre deux chiffres : il porte la valeur, pas la forme.
    if ((c === 46 || c === 44 || c === SPACE) && i > 0 && isDigit(s.charCodeAt(i - 1))) {
      if (i + 1 < s.length && isDigit(s.charCodeAt(i + 1))) {
        mask[i] = 1
        continue
      }
    }
  }
  // Unité : après la fin d'un nombre, une espace facultative puis un jeton court sans chiffre.
  for (let i = 0; i < s.length; i++) {
    if (mask[i] !== 1 || !isDigit(s.charCodeAt(i))) continue
    if (i + 1 < s.length && isDigit(s.charCodeAt(i + 1))) continue // pas encore la fin du nombre
    let j = i + 1
    if (j < s.length && s.charCodeAt(j) === SPACE) j++
    const start = j
    while (j < s.length && s.charCodeAt(j) !== SPACE && !isDigit(s.charCodeAt(j))) j++
    const len = j - start
    if (len === 0 || len > MAX_UNIT_CHARS) continue
    // Vocabulaire fermé, et non simple critère de longueur : « 5.3 Sécurité préclinique » gèlerait
    // sinon le titre de la rubrique, motif le plus fréquent d'un RCP, et refuserait la citation.
    if (!isUnitToken(s.slice(start, j))) continue
    // ⚠️ Gel à partir de `start`, PAS de `i + 1` : l'espace entre le nombre et son unité reste libre.
    // La coller ou la séparer est l'artefact OCR le plus courant après la confusion de lettres
    // (« 500mg » pour « 500 mg »), et la geler faisait refuser une citation JUSTE — donc rejeu, donc
    // « Non fourni ». Les attaques par décalage sont tuées par la règle de substitution contre une
    // espace, qui dépend du masque de l'AUTRE côté, pas du gel de cette espace-ci.
    for (let k = start; k < j; k++) mask[k] = 1
  }
  return mask
}

// ⚠️ Conséquence à connaître de l'interdiction d'enjamber un chiffre du corpus : un chiffre PARASITE
// au milieu du texte océrisé — typiquement un numéro de page conservé entre deux pages — rend
// introuvable la citation d'un passage à cheval sur la coupure. La rubrique serait rétrogradée alors
// qu'elle est juste. La parade appartient à l'OCR, qui doit retirer numéros de page et en-têtes
// répétés (PLAN-UPGRADE-FRONTEND §C bis) ; l'assouplir ici rouvrirait le contournement du dosage.

/**
 * `haystack` contient-il une SOUS-CHAÎNE à distance d'édition ≤ `maxEdits` de `needle` ?
 *
 * ⚠️ **La contiguïté est tout le sujet.** Un score de recouvrement par MOTS — même tolérant aux
 * lettres mal lues — ne prouve que l'existence du vocabulaire, pas celle du passage : une phrase
 * recombinée à partir de mots pris à trois rubriques différentes obtiendrait un score parfait. Sur
 * un RCP, cela suffirait à faire livrer « chez l'enfant, 250 mg » à partir d'une source qui ne
 * posologie que l'adulte, sous la mention « citation vérifiée ». Le contrôle doit donc porter sur
 * un passage CONTIGU, dans l'ORDRE — c'est-à-dire sur une distance d'édition, pas sur un score.
 *
 * Algorithme de Sellers : distance d'édition entre la citation et la MEILLEURE sous-chaîne du
 * corpus. `dp[0] = 0` à chaque colonne rend le départ libre ; le coût est O(citation × corpus),
 * borné par `OCR_MAX_ANCHOR_CHARS` et par `MAX_TEXT_CHARS`, et n'est atteint que sur une source
 * océrisée dont la citation n'a PAS été retrouvée littéralement.
 *
 * ⚠️ **Portée résiduelle, assumée.** Sur une citation longue, une substitution locale de quelques
 * mots reste sous le budget : ce contrôle établit la PROVENANCE du passage, pas l'exactitude de
 * chaque mot. Sur une source scannée, la contrepartie est explicite — les valeurs chiffrées sont
 * listées à relire dans la revue, et l'encart le dit au client.
 */
function approxContains(
  needle: string,
  haystack: string,
  haystackMask: Uint8Array,
  maxEdits: number,
): boolean {
  if (maxEdits <= 0) return haystack.includes(needle)
  const n = needle.length
  if (n === 0) return true
  // Codes et coûts de suppression de la citation, calculés UNE fois : la boucle interne tourne
  // n × m fois, tout ce qu'on peut en sortir compte. `Int32Array` plutôt que `charCodeAt` à chaque
  // cellule, et le coût d'un chiffre (voir `digitCost`) plutôt qu'un test répété.
  const codes = new Int32Array(n)
  const delCost = new Int32Array(n)
  // Supprimer une position PROTÉGÉE de la citation est interdit : « 2500 » ne se ramène pas à
  // « 250 », ni « mcg » à « g ».
  const needleMask = protectedMask(needle)
  for (let i = 0; i < n; i++) {
    codes[i] = needle.charCodeAt(i)
    delCost[i] = needleMask[i] === 1 ? IMPOSSIBLE : 1
  }
  // dp[i] = coût d'alignement des i premiers caractères de la citation sur un suffixe du préfixe
  // de corpus déjà parcouru. Colonne initiale (corpus vide) : les i premiers caractères sont
  // supprimés — au TARIF de `delCost`, et non à 1 par caractère.
  //
  // ⚠️ Un `dp[i] = i` naïf ferait exception à la règle qu'il est censé appliquer : les chiffres de
  // TÊTE de la citation redeviendraient supprimables à l'unité, et « 250 comprimés par jour »
  // s'alignerait sur « comprimés par jour ». Atteignable précisément là où c'est le plus grave — la
  // rubrique 1, dont la citation est la première ligne du document et porte le dosage.
  const dp = new Int32Array(n + 1)
  dp[0] = 0
  for (let i = 1; i <= n; i++) dp[i] = Math.min(dp[i - 1] + delCost[i - 1], IMPOSSIBLE)
  const m = haystack.length
  for (let j = 0; j < m; j++) {
    const ch = haystack.charCodeAt(j)
    const chDigit = isDigit(ch)
    const chSpace = ch === SPACE
    const hProtected = haystackMask[j] === 1
    const skipCost = hProtected ? IMPOSSIBLE : 1
    let diag = dp[0]
    let leftVal = 0
    dp[0] = 0
    for (let i = 1; i <= n; i++) {
      const up = dp[i]
      const nc = codes[i - 1]
      let sub: number
      if (nc === ch) {
        sub = 0
      } else if ((chSpace || nc === SPACE) && (needleMask[i - 1] === 1 || hProtected)) {
        // ⚠️ La FRONTIÈRE d'un nombre protégé compte autant que son contenu. Échanger un caractère
        // protégé contre une espace décale l'alignement d'un cran, et « 250 mcg » retrouvait
        // « 250 mg » en substituant le « g » à l'espace suivante, puis en supprimant une espace
        // ailleurs. Une unité ne devient jamais une espace sous l'œil d'une reconnaissance.
        sub = IMPOSSIBLE
      } else if (!chDigit && !isDigit(nc)) {
        // Dans un nombre ou son unité, seules les confusions graphiques sans effet sur la magnitude.
        sub = (needleMask[i - 1] === 1 || hProtected)
          ? (letterConfusable(nc, ch) ? 1 : IMPOSSIBLE)
          : 1
      } else {
        sub = digitCost(isDigit(nc) ? nc : ch, isDigit(nc) ? ch : nc)
      }
      let best = diag + sub
      const viaLeft = leftVal + delCost[i - 1]
      if (viaLeft < best) best = viaLeft
      const viaUp = up + skipCost
      if (viaUp < best) best = viaUp
      if (best > IMPOSSIBLE) best = IMPOSSIBLE
      dp[i] = best
      leftVal = best
      diag = up
    }
    if (dp[n] <= maxEdits) return true
  }
  return false
}

// Classes écrites en échappements \uXXXX et non en caractères littéraux : ces signes sont
// invisibles ou homographes dans un éditeur. Une espace fine insécable collée par erreur casserait
// la comparaison sans qu'aucune relecture du fichier ne puisse le voir.
/** Apostrophes typographiques et primes → apostrophe droite. */
const APOSTROPHES = /[\u2018\u2019\u201B\u2032\u0060\u00B4]/g
/** Guillemets (courbes, allemands, français, seconde) → guillemet droit. */
const QUOTES = /[\u201C\u201D\u201E\u00AB\u00BB\u2033]/g
/** Tirets (quart/demi/cadratin, moins) → trait d'union ASCII. */
const DASHES = /[\u2010\u2011\u2012\u2013\u2014\u2015\u2212]/g
/** Espaces insécables, fines, typographiques et marques de largeur nulle (extractions PDF). */
const SPACES = /[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000\u200B\uFEFF]/g
/** Césure de fin de ligne (« compri- \n mé ») : artefact d'extraction PDF, jamais du contenu. */
const HYPHENATION = /[-\u2010\u2011][ \t]*\r?\n\s*/g
/** Points de suspension typographiques. */
const ELLIPSIS = /\u2026/g

/**
 * Normalisation appliquée À L'IDENTIQUE aux deux côtés de la comparaison. Elle absorbe ce qui
 * diffère sans porter de sens (typographie, retours à la ligne d'un PDF, casse) et RIEN d'autre :
 * les accents sont conservés — les effacer rendrait la comparaison plus permissive, donc le
 * contrôle plus faible. Sur un livrable réglementaire, on se trompe dans le sens du refus.
 */
export function normalizeForEvidence(input: string): string {
  return input
    .normalize('NFKC')
    .replace(HYPHENATION, '')
    .replace(SPACES, ' ')
    .replace(APOSTROPHES, "'")
    .replace(QUOTES, '"')
    .replace(DASHES, '-')
    .replace(ELLIPSIS, '...')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

/** Retire les traits d'union : « anti-inflammatoire » et « antiinflammatoire » deviennent égaux. */
const deHyphen = (s: string) => s.replace(/-/g, '')

/**
 * Forme canonique d'une valeur chiffrée, INDÉPENDANTE de la convention de langue.
 *
 * ⚠️ C'est le point où un dossier anglais rencontre un gabarit français. L'anglais sépare les
 * milliers par une VIRGULE (« 35,000 IU »), le français par une ESPACE (« 35 000 UI ») — et le
 * français utilise la virgule comme séparateur DÉCIMAL (« 12,5 mg »). Un traitement naïf
 * (« virgule → point ») transformerait « 35,000 » en « 35.000 » et « 35 000 » en « 35000 » : deux
 * jetons différents pour la même valeur. La rubrique 2 d'un RCP traduit serait alors rétrogradée
 * en « non fourni » à chaque fois, alors que le dosage est correct.
 *
 * Règle : un séparateur suivi d'EXACTEMENT trois chiffres, puis la fin du nombre ou un autre
 * séparateur, est un séparateur de MILLIERS et disparaît. Tout autre séparateur est DÉCIMAL et
 * devient un point.
 *
 *   « 35,000 » · « 35 000 » · « 35000 »   → 35000
 *   « 1,234,567 » · « 1 234 567 »         → 1234567
 *   « 12,5 » · « 12.5 »                   → 12.5
 */
const THOUSANDS = /[.,](\d{3})(?=$|[.,])/
const canonFigure = (s: string) => {
  let t = s.replace(/\s/g, '')
  let prev: string
  do {
    prev = t
    t = t.replace(THOUSANDS, '$1')
  } while (t !== prev)
  return t.replace(/,/g, '.')
}

/** Valeur chiffrée ENTIÈRE (« 325 », « 1 500 », « 35,000 », « 12,5 ») — jamais un fragment. */
const FIGURE_TOKEN = /\d+(?:[ ,.]\d{3})*(?:[.,]\d+)?/g

/** Références croisées au gabarit (« voir rubrique 4.2 ») : structure du document, pas donnée produit. */
const CROSS_REFERENCE = /(?:rubriques?|sections?|points?|voir|cf\.?)\s*n?°?\s*[\d]+(?:\.\d+)*/g

function figureSet(normalized: string): Set<string> {
  const out = new Set<string>()
  for (const raw of normalized.match(FIGURE_TOKEN) ?? []) out.add(canonFigure(raw))
  return out
}

/**
 * Prépare le corpus de contrôle. Absent ou vide → `available: false` (aucun contrôle possible).
 *
 * `kind: 'ocr'` déclare que le texte vient d'une reconnaissance de caractères. Cette déclaration est
 * **explicite et jamais devinée** : traiter un texte océrisé comme fidèle rejetterait des citations
 * justes, et traiter un texte fidèle comme océrisé accepterait des citations approximatives. Les deux
 * erreurs coûtent, dans des sens opposés.
 */
export function prepareSource(
  text: string | null | undefined,
  kind: SourceKind = 'text',
): PreparedSource {
  const normalized = typeof text === 'string' ? normalizeForEvidence(text) : ''
  return {
    normalized,
    deHyphenated: deHyphen(normalized),
    figures: figureSet(normalized),
    available: normalized.length > 0,
    kind,
    protectedRegions: kind === 'ocr' ? protectedMask(normalized) : EMPTY_MASK,
  }
}

/** Corpus fidèle : aucun rapprochement approché n'y a lieu, donc aucun masque à porter. */
const EMPTY_MASK = new Uint8Array(0)

/**
 * Cherche un passage dans le corpus de contrôle, et DIT comment il a été retrouvé.
 *
 * C'est la seule fonction de recherche du module : la citation d'une rubrique (`verifyEvidence`) et
 * les affirmations factuelles d'une revue (`pruneUnverifiable`) passent par elle. Une seule
 * implémentation, donc une seule tolérance — deux recherches divergentes finiraient par accepter
 * ici ce qu'elles refusent là.
 *
 * Trois replis, du plus strict au plus tolérant :
 *  1. littéral, après normalisation identique des deux côtés ;
 *  2. sans traits d'union — une extraction PDF coupe « anti-\ninflammatoire » en fin de ligne alors
 *     que le modèle recopie ce qu'un humain lit ;
 *  3. sur un passage CONTIGU à quelques caractères près, et **uniquement si la source est
 *     océrisée** : une seule lettre mal reconnue fait échouer toute comparaison littérale. Ce repli
 *     est signalé (`'ocr'`) et jamais confondu avec une correspondance exacte.
 */
export function findInSource(text: string, source: PreparedSource): SourceMatch {
  if (findInSourceExact(text, source)) return 'exact'
  if (source.kind !== 'ocr') return 'absent'
  const needle = normalizeForEvidence(text)
  // Au-delà de l'ancrage, on REFUSE plutôt que de juger un préfixe : juger 600 caractères sur 900
  // laisserait la queue de la citation vérifiée par rien du tout, et c'est justement là qu'une
  // invention se cache le mieux. `verifyEvidence` plafonne la citation en amont (`too_long`, donc
  // rejouable) ; ici, la borne protège aussi les affirmations d'une revue.
  if (needle.length > OCR_MAX_ANCHOR_CHARS) return 'absent'
  return approxContains(needle, source.normalized, source.protectedRegions, ocrEditBudget(needle.length))
    ? 'ocr'
    : 'absent'
}

/**
 * Les deux replis LITTÉRAUX seuls, sans le rapprochement approché — coût nul.
 *
 * Séparés parce qu'un appelant qui BORNE le rapprochement approché doit pouvoir tenter le littéral
 * gratuitement d'abord : facturer les correspondances exactes épuiserait le budget sur ce qui ne
 * coûte rien, et la seule ligne qui avait besoin de la tolérance serait écartée.
 */
export function findInSourceExact(text: string, source: PreparedSource): boolean {
  const needle = normalizeForEvidence(text)
  return source.normalized.includes(needle) || source.deHyphenated.includes(deHyphen(needle))
}

/**
 * Une citation « substantielle » : assez longue, ou assez riche en mots pour désigner un passage
 * précis. Trois mots vides (« de la vue ») ne valent pas citation ; « GYNORIL 500 mg » si.
 */
function substantial(s: string): boolean {
  if (s.length >= MIN_EVIDENCE_CHARS) return true
  const words = s.split(' ').filter(Boolean)
  return words.length >= MIN_EVIDENCE_WORDS && words.some((w) => w.length > 5)
}

/** Retranche le titre officiel de la rubrique d'une citation — voir `verifyEvidence`. */
function withoutHeading(needle: string, heading?: string): string {
  const h = heading ? normalizeForEvidence(heading) : ''
  if (!h) return needle
  return needle.split(h).join(' ').replace(/\s+/g, ' ').trim()
}

/**
 * Vérifie qu'une citation justifie bien la rubrique écrite.
 *
 * `heading` (titre officiel de la rubrique) ferme le contournement le plus simple : le titre d'une
 * rubrique figure dans TOUT document du même type, donc le citer « prouve » n'importe quoi. On le
 * retranche avant de juger — ce qui reste doit encore désigner un passage.
 */
export function verifyEvidence(
  evidence: string,
  source: PreparedSource,
  status: SectionStatus,
  heading?: string,
): EvidenceVerdict {
  // Une rubrique déclarée absente n'écrit rien : il n'y a aucune affirmation à justifier.
  if (status === 'missing') return 'not_required'
  // Pas de texte source : le contrôle n'a pas pu s'exercer. On le DIT — le rejouer n'y changerait
  // rien, et le compter comme vérifié transformerait une garantie en décoration.
  if (!source.available) return 'unverifiable'

  const needle = normalizeForEvidence(evidence)
  if (!substantial(withoutHeading(needle, heading))) return 'too_short'
  const baseCap = source.normalized.length > RELATIVE_CAP_FLOOR
    ? Math.min(MAX_EVIDENCE_CHARS, source.normalized.length * MAX_EVIDENCE_RATIO)
    : MAX_EVIDENCE_CHARS
  if (needle.length > baseCap) return 'too_long'
  // LE LITTÉRAL D'ABORD, avant le plafond propre aux scans. Une OCR qui a bien reconstruit un long
  // passage produit une citation vérifiable caractère par caractère : la refuser pour dépassement
  // rétrograderait une rubrique CORRECTE, et le rejeu n'y changerait rien.
  if (findInSourceExact(needle, source)) return 'verified'
  // Sur une source océrisée, le RAPPROCHEMENT APPROCHÉ ne juge qu'un passage d'un seul tenant : une
  // citation plus longue verrait sa queue vérifiée par RIEN. `too_long` est rejouable (cf.
  // `isEvidenceRejected`) et le rejeu demande explicitement une citation plus COURTE.
  if (source.kind === 'ocr' && needle.length > OCR_MAX_ANCHOR_CHARS) return 'too_long'
  // Le verdict distingue les deux façons de retrouver la citation : sur une source océrisée, la
  // garantie est réelle mais moindre, et aucun rapport ne doit pouvoir présenter l'une pour l'autre.
  return findInSource(needle, source) === 'ocr' ? 'verified_ocr' : 'not_found'
}

/**
 * Valeurs chiffrées de `content` introuvables dans la source.
 *
 * **Pourquoi ce contrôle existe** : `verifyEvidence` prouve que la CITATION existe dans le document,
 * jamais que `content` en découle. Ce second contrôle ancre ce qui ne se devine pas et ne se
 * paraphrase pas : dosages, quantités, dates, numéros. Ce sont exactement les informations que la
 * consigne système impose de recopier VERBATIM, donc celles dont l'absence de la source signe
 * l'invention.
 *
 * ⚠️ La comparaison porte sur des JETONS ENTIERS, jamais sur des sous-chaînes : « 32 mg » inventé
 * face à une source qui dit « 325 mg » DOIT être signalé. Une comparaison par `includes` laisserait
 * passer précisément la classe d'hallucination la plus dangereuse — le dosage voisin du vrai.
 *
 * `ignore` reçoit l'identifiant de la rubrique demandée ; les renvois explicites au gabarit
 * (« voir rubrique 4.2 ») sont retirés du contenu avant l'extraction.
 *
 * ⚠️ **Aucune tolérance OCR ici, volontairement.** Une reconnaissance de caractères confond
 * précisément les chiffres (`0/O`, `1/l`, `5/S`, `8/B`) : les rapprocher « à peu près » ferait
 * accepter 8 mg pour 3 mg. Sur une source océrisée, ce contrôle reste donc EXACT et c'est
 * l'appelant qui en change la portée — les valeurs signalées deviennent des valeurs À VÉRIFIER
 * (`SectionOutcome.figuresAdvisory`) au lieu de rétrograder la rubrique. Rendre la comparaison
 * approximative aurait affaibli la garantie ; la rendre consultative la déplace vers l'humain.
 */
export function ungroundedFigures(
  content: string,
  source: PreparedSource,
  ignore: ReadonlySet<string> = new Set(),
): string[] {
  if (!source.available) return []
  const text = normalizeForEvidence(content).replace(CROSS_REFERENCE, ' ')
  const out: string[] = []
  for (const token of new Set(text.match(FIGURE_TOKEN) ?? [])) {
    // Un chiffre isolé (« 3 comprimés ») se retrouve partout : il ne prouve ni ne réfute rien.
    if (token.replace(/\D/g, '').length < 2) continue
    if (ignore.has(token)) continue
    if (source.figures.has(canonFigure(token))) continue
    out.push(token)
  }
  return out
}

/**
 * Un verdict qui justifie de REJOUER la rubrique. `unverifiable` n'en fait pas partie : rejouer
 * ne fournirait pas le texte source manquant, ce serait un appel payé pour rien.
 */
export function isEvidenceRejected(verdict: EvidenceVerdict): boolean {
  return verdict === 'not_found' || verdict === 'too_short' || verdict === 'too_long'
}
