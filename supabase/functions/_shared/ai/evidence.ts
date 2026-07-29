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

/** Prépare le texte source. Absent ou vide → `available: false` (PDF non extrait, mode fichier). */
export function prepareSource(text: string | null | undefined): PreparedSource {
  const normalized = typeof text === 'string' ? normalizeForEvidence(text) : ''
  return {
    normalized,
    deHyphenated: deHyphen(normalized),
    figures: figureSet(normalized),
    available: normalized.length > 0,
  }
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
  const cap = source.normalized.length > RELATIVE_CAP_FLOOR
    ? Math.min(MAX_EVIDENCE_CHARS, source.normalized.length * MAX_EVIDENCE_RATIO)
    : MAX_EVIDENCE_CHARS
  if (needle.length > cap) return 'too_long'
  if (source.normalized.includes(needle)) return 'verified'
  // Repli sur les mots composés : une extraction PDF coupe « anti-\ninflammatoire » en fin de ligne,
  // le modèle recopie « anti-inflammatoire » comme un humain le lit. Rejeter cela rétrograderait
  // une rubrique CORRECTE en « non fourni » — un livrable faux, et une métrique §7 faussée.
  return source.deHyphenated.includes(deHyphen(needle)) ? 'verified' : 'not_found'
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
