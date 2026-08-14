// Passe de RAPPORT d'upgrade (étape 3 du processus) — module PUR : le générateur est injecté.
//
// Cette passe n'est pas de la même nature que les deux autres, et sa conception en découle.
// La conformité et la traduction sont des passes à INVENTION NULLE : tout y est vérifié contre une
// source. Le rapport est le SEUL endroit où la connaissance générale est permise — c'est même sa
// raison d'être. On ne peut donc pas le contrôler comme les autres. On l'ENCADRE :
//
//   ┌─ squelette DÉTERMINISTE, écrit en code ────────────────────────────────────────────┐
//   │  avertissement au mot près · liste des lacunes calculée depuis les statuts réels   │
//   │  décomptes · question « sans objet » · ordre des sections                          │
//   ├─ analyse contrainte par SCHÉMA, écrite par le modèle ──────────────────────────────┤
//   │  déplacements · terminologie · constats · recommandations, criticité en enum       │
//   └───────────────────────────────────────────────────────────────────────────────────┘
//
// Trois conséquences directes :
//  1. **L'avertissement ne peut pas être altéré ni omis** : il n'est jamais demandé au modèle.
//  2. **La liste des lacunes ne peut pas contredire le livrable** : elle est dérivée des statuts,
//     pas racontée. Un rapport qui annonce 9 rubriques à compléter là où le document en marque 11
//     détruirait la confiance plus sûrement qu'une analyse médiocre.
//  3. **Le rapport est trié par criticité PAR CONSTRUCTION** (§6 du plan) : `criticality` est un
//     `enum`, le tri est mécanique.
//
// 4. **La portée réelle des garanties sur CE document est dite en code** : quand la source est un
//    scan, l'encart « votre document est un scan » et la liste des valeurs à relire sont assemblés
//    ici. Confiés au modèle, ils seraient adoucis ou omis exactement quand ils comptent.
//
// Et un contrôle qui reste applicable malgré la liberté d'analyse : **toute affirmation FACTUELLE
// sur le document du client est vérifiable**. « Votre rubrique 7 s'intitule Fabricant » se contrôle
// — la chaîne doit figurer dans la source. Ce qui ne se retrouve pas est écarté.
import {
  findInSource,
  findInSourceExact,
  OCR_MAX_ANCHOR_CHARS,
  normalizeForEvidence,
  prepareSource,
  type PreparedSource,
  type SourceKind,
} from './ai/evidence.ts'
import { reviewSystem } from './ai/personas.ts'
import { boundedMap, type PoolReport } from './ai/pool.ts'
import { SectionOutputError } from './ai/section-schema.ts'
import type { AiOptions, Part, Provider } from './ai/types.ts'
import { DOC_SHORT, type ConformityDocType, type ConformitySpec } from './conformity-specs.ts'
import type { OutputLang, SectionOutcome } from './upgrade-section-core.ts'

/**
 * Budget total de la PASSE — quatre appels, plus le préchauffage (§ « Le découpage », plus bas).
 *
 * ⚠️ MESURÉ, pas choisi. En UN seul appel, la revue d'un RCP de 28 000 caractères sur 34 rubriques
 * a tenu en **114,1 s pour un plafond de 115** (banc U0.3, 03/08/2026), après avoir dépassé 90 s
 * DEUX FOIS de suite : un constat structurel, pas un aléa. Elle était le seul appel de la chaîne à
 * produire jusqu'à 8 000 jetons de JSON sur quatre tableaux non bornés, réflexion adaptative
 * comprise — là où une rubrique en rend ~200 en 5 à 8 s.
 *
 * Neuf dixièmes de seconde de marge, contraints des deux côtés : `MAX_CALL_TIMEOUT_MS` (120 s)
 * borne tout appel sortant, et le mur Edge (150 s) doit encore couvrir le prélude et l'écriture de
 * la réponse. La réponse retenue n'est donc PAS d'augmenter le chiffre, mais de **découper la
 * passe** — un appel par tableau, chacun largement sous son propre plafond.
 */
export const REPORT_BUDGET_MS = 118_000
/**
 * Plafond d'UN appel de tableau.
 *
 * ⚠️ Il valait 60 s — « très loin des 114 s de l'appel unique » — et la PREMIÈRE commande réelle
 * l'a démenti (recette 2026-08-10) : `relocations` a dépassé 60 s sur un RCP de 27 k caractères,
 * et comme un timeout est une raison DÉFINITIVE (jamais rejouée), la commande est morte après les
 * ~60 appels payés des deux premières passes. Le chiffre était une projection, pas une mesure —
 * le même défaut que les « 2,6 min à concurrence 6 ».
 *
 * 100 s est ce que la fenêtre d'invocation du worker sait HÉBERGER en entier : budget 115 s
 * (mur Edge 150 s − 35 s de prélude), moins la marge d'écriture de 8 s et la latence de
 * réclamation. Exporté parce que `trancheMinMs('report')` DOIT valoir ce plafond : lancer un
 * tableau sans la piste entière, c'est transformer une fin de fenêtre en échec définitif.
 */
export const REPORT_PART_TIMEOUT_MS = 100_000
/**
 * Temps qu'un appel de tableau doit pouvoir consommer pour valoir la peine d'être LANCÉ. En deçà,
 * on l'abandonne : un appel tué en vol par la plateforme est payé et ne rend rien (§ « le coût
 * qu'on ne voit pas » — un dépassement ne restitue AUCUN jeton et n'apparaît dans aucune mesure).
 */
const REPORT_MIN_SLICE_MS = 15_000
/**
 * Budget de sortie demandé pour UN tableau.
 *
 * ⚠️ Consultatif côté Anthropic : `MIN_MAX_TOKENS` (16 000) y sert de plancher, parce que la
 * réflexion adaptative partage ce budget avec le texte. Le chiffre documente l'intention et borne
 * réellement tout fournisseur sans plancher.
 */
const REPORT_PART_MAX_OUTPUT_TOKENS = 3_000
/**
 * En deçà, la revue REFUSE de partir.
 *
 * ⚠️ Sans ce plancher, un appelant qui omet `budgetMs` — ou qui a déjà consommé son wall clock à
 * télécharger 12 Mo de Storage — lancerait quand même la passe, et la plateforme la tuerait en
 * 546 : payée, sans rendre ni mesure ni rapport. Pire, `boundedTimeout` traite un budget NÉGATIF
 * comme « non renseigné » et retomberait sur le défaut : un budget épuisé deviendrait un appel
 * pleine longueur. Le garde-fou vit donc ICI, dans la fonction qui lance, jamais chez l'appelant.
 *
 * Le chiffre couvre les TROIS étapes du découpage (préchauffage, vague, recommandations), à une
 * tranche minimale chacune : en deçà, on paierait des appels pour un rapport de toute façon refusé.
 * `boundedMap` ne protège que la vague — le préchauffage part sans regarder l'échéance.
 */
const MIN_REPORT_BUDGET_MS = 3 * REPORT_MIN_SLICE_MS

/**
 * Budget du rapprochement APPROCHÉ des affirmations d'une revue, **en caractères**.
 *
 * ⚠️ Ni le nombre de lignes ni leur longueur ne sont contraints par `reportSchema()`, et les DEUX
 * pèsent : le coût mesuré sur un corpus de 60 000 caractères est de **~8 ms fixes + ~0,58 ms par
 * caractère** (16 ms pour 25 caractères, 354 ms pour 590). Compter des appels laisserait passer les
 * lignes longues ; compter des caractères seuls laisserait passer la multitude de lignes courtes.
 * D'où un coût à deux termes, et un crédit calibré pour que le pire cas — une vingtaine d'intitulés
 * courts, ou une seule ligne au maximum de l'ancrage — reste vers 0,4 s, contre 2 s de CPU (§8.6).
 * Au-delà, un rapport déjà payé serait perdu après cent secondes de génération.
 */
const OCR_CLAIM_BUDGET = 1_100

/**
 * Part forfaitaire prélevée par rapprochement — un coût RÉEL et mesuré : **~10 ms par appel sur un
 * corpus de 60 000 caractères, indépendamment de la longueur de l'affirmation**. La programmation
 * dynamique balaie tout le corpus même pour une affirmation d'un caractère (O(citation × corpus), le
 * terme en corpus domine quand la citation est courte).
 *
 * ⚠️ Ne pas « nettoyer » ce forfait au prétexte qu'il ne dépend pas de la longueur : c'est
 * précisément ce qu'il borne. Sans lui, 1 100 affirmations d'un caractère coûteraient ~11 s de CPU,
 * contre 2 s autorisées (§8.6). Il plafonne le NOMBRE d'appels à 55 ; le terme en caractères plafonne
 * le TRAVAIL. Les deux dimensions viennent du modèle ; aucune ne doit rester libre.
 */
const OCR_CLAIM_FIXED_COST = 20

/** Criticité — `enum` : le tri du rapport en découle, il n'est pas confié à la rédaction. */
export type Criticality = 'blocking' | 'major' | 'minor'
export const CRITICALITIES: readonly Criticality[] = ['blocking', 'major', 'minor']
const DOT: Record<Criticality, string> = { blocking: '🔴', major: '🟠', minor: '🟡' }

/** Ce que le modèle rédige — et RIEN d'autre. */
export interface ReportAnalysis {
  relocations: { content: string; source_position: string; template_position: string; risk: string }[]
  terminology: { before: string; after: string; reference: string }[]
  findings: { criticality: Criticality; title: string; detail: string }[]
  recommendations: { criticality: Criticality; action: string }[]
}

/* ──────────────────────────── Le découpage en quatre appels ─────────────────────────────────
 *
 * UN appel par tableau, et trois contraintes qui en fixent la forme. Aucune n'est un choix de
 * style ; chacune vient d'un piège déjà payé.
 *
 * 1. **Le schéma reste ENTIER, identique aux quatre appels.** C'est le prix, et la leçon, de
 *    `a520ec7` : le schéma entre dans le préfixe mis en cache — prouvé à deux jetons près, un
 *    `enum` qui portait « 4 » contre « 4.1 » déplaçait `cacheWrite` de 16 461 à 16 463. Quatre
 *    schémas taillés chacun pour son tableau, ce serait quatre préfixes distincts : quatre
 *    écritures à 1,25× et zéro relecture, soit **plus cher que pas de cache du tout**. Le schéma
 *    GUIDE (tout le gabarit, partageable) ; le CODE GARANTIT (`splitPart` ne retient que la liste
 *    demandée). Chaque appel rend donc les trois autres listes vides — c'est voulu.
 *
 * 2. **Le premier appel PRÉCHAUFFE, et c'est le plus court qui s'en charge.** Lancer les quatre
 *    ensemble ferait payer quatre fois l'écriture du préfixe — le document source — avant que le
 *    premier ne l'ait écrit. `terminology` ouvre donc la marche : trois champs brefs par ligne,
 *    c'est le tableau le plus rapide à produire. Faire préchauffer `findings` coûterait le double
 *    en latence pour exactement le même cache.
 *
 * 3. **`recommendations` passe en DERNIER, nourri des constats.** C'est la seule dépendance réelle
 *    entre les quatre : une action qui reformule un constat au lieu de le couvrir donnerait deux
 *    listes redondantes là où le client attend « ce qui ne va pas » puis « quoi faire ». Les
 *    constats voyagent dans la QUEUE variable de l'instruction, après le point de rupture du
 *    cache : le préfixe partagé reste intact.
 *
 * ⚠️ Ce que le découpage coûte, et qu'aucun test n'attrapera : un constat TRANSVERSAL — visible
 * seulement en tenant les quatre tableaux à la fois — peut se perdre. C'est le risque assumé au
 * moment de trancher (PLAN-UPGRADE-PROD §3, U0) ; il se surveille en recette, pas en CI.
 */

/** Les trois tableaux INDÉPENDANTS : le premier préchauffe le cache, les deux autres le relisent. */
const REPORT_WAVE = ['terminology', 'relocations', 'findings'] as const
/** Le seul tableau qui dépend d'un autre (cf. n°3) — d'où sa position, et non l'inverse. */
const REPORT_LAST = 'recommendations' as const

/** Les quatre listes du rapport, dans l'ordre où elles sont demandées. */
export const REPORT_PARTS = [...REPORT_WAVE, REPORT_LAST] as const
export type ReportPart = typeof REPORT_PARTS[number]

/** Ne retient que la liste DEMANDÉE, et compte ce qui a été rangé ailleurs. La garantie en code. */
function splitPart(from: ReportAnalysis, part: ReportPart): { only: ReportAnalysis; stray: number } {
  const only = emptyAnalysis()
  switch (part) {
    case 'relocations':
      only.relocations = from.relocations
      break
    case 'terminology':
      only.terminology = from.terminology
      break
    case 'findings':
      only.findings = from.findings
      break
    case 'recommendations':
      only.recommendations = from.recommendations
      break
  }
  const stray = REPORT_PARTS.filter((p) => p !== part).reduce((n, p) => n + from[p].length, 0)
  return { only, stray }
}

const emptyAnalysis = (): ReportAnalysis => ({
  relocations: [],
  terminology: [],
  findings: [],
  recommendations: [],
})

/** Une rubrique telle que la passe de conformité l'a laissée — l'entrée factuelle du rapport. */
export interface ReportSection {
  sectionId: string
  title: string
  status: 'filled' | 'partial' | 'missing'
  /**
   * Valeurs chiffrées que le contrôle d'ancrage n'a pas retrouvées dans le corpus océrisé
   * (`SectionOutcome.ungrounded` quand `figuresAdvisory`). Rendues TELLES QUELLES, en liste, jamais
   * racontées par le modèle : sur un scan, une valeur non retrouvée est presque toujours une lecture
   * fautive, et l'expert a besoin de savoir LAQUELLE relire, pas d'un avertissement général.
   * Ignoré hors source océrisée : sur une source fidèle, une valeur non ancrée a déjà rétrogradé
   * sa rubrique, et l'afficher ici reviendrait à recopier une lacune en « à vérifier ».
   */
  figuresToVerify?: readonly string[]
}

export interface ReportRequest {
  spec: ConformitySpec
  /** Nom commercial, pour personnaliser la question « sans objet ». */
  productName: string
  /** Nom du fichier source, cité en tête de rapport. */
  sourceName: string
  /** Texte source — sert aussi à vérifier les affirmations factuelles de l'analyse. */
  sourceText: string
  /**
   * Provenance de `sourceText`. `'ocr'` change trois choses, et seulement ces trois-là : la
   * tolérance du contrôle des affirmations factuelles, une consigne de plus au modèle (aucun constat
   * de FORME sur un texte reconstruit), et un encart déterministe dans le rapport.
   *
   * ⚠️ **Obligatoire, et non optionnel avec repli `text`.** L'oublier sur un scan est silencieux et
   * coûteux : comparaison littérale contre un corpus reconstruit, donc une revue vidée de ses propres
   * constats justes, sans encart et sans liste de valeurs à relire. Le mieux placé pour le renseigner
   * est `reportInputFrom`, qui le pose avec `figuresToVerify`.
   */
  sourceKind: SourceKind
  /**
   * Source envoyée au modèle en PIÈCE (PDF, image) plutôt qu'en texte dans l'instruction.
   *
   * ⚠️ Obligatoire pour un scan. Sans elle, l'analyse porterait sur le texte océrisé et le modèle
   * attribuerait au document du client les coquilles de la reconnaissance de caractères — un constat
   * FAUX que le contrôle d'ancrage ne peut pas rattraper, puisque la coquille figure bel et bien
   * dans le corpus de contrôle. Le modèle lit l'image ; l'OCR ne sert qu'à vérifier en code.
   */
  sourceParts?: readonly Part[]
  sections: readonly ReportSection[]
  /** Langue du rapport : celle du document téléversé (§ étape 1). */
  lang: OutputLang
  /** Date du rapport, injectée — jamais lue depuis l'horloge du modèle. */
  reportDate: string
  system?: string
  provider?: Provider
  budgetMs?: number
}

/**
 * Construit l'entrée factuelle de la revue depuis les rubriques produites par la passe 1.
 *
 * ⚠️ **Passer par ici, jamais construire `sections` à la main.** `sourceKind` et `figuresToVerify`
 * sont les deux faces d'une même contrepartie : sur un scan, le contrôle des valeurs a été rendu
 * consultatif, et la seule chose offerte au client en échange est la LISTE de ce qu'il doit relire.
 * Les renseigner séparément permettrait de livrer l'encart sans la liste — un avertissement sans
 * contenu, invisible en recette puisque l'encart, lui, serait bien là.
 */
export function reportInputFrom(outcomes: readonly SectionOutcome[]): {
  sections: ReportSection[]
  sourceKind: SourceKind
} {
  return {
    sections: outcomes.map((o) => ({
      sectionId: o.sectionId,
      title: o.title,
      status: o.status,
      ...(o.figuresAdvisory && o.ungrounded.length ? { figuresToVerify: o.ungrounded } : {}),
    })),
    // `figuresAdvisory` vaut la provenance du document pour TOUTE rubrique d'une même exécution,
    // qu'elle porte des valeurs non retrouvées ou non : le drapeau est donc fiable ici, là où un
    // test sur `ungrounded` aurait manqué un scan dont toutes les valeurs se relisent bien.
    sourceKind: outcomes.some((o) => o.figuresAdvisory) ? 'ocr' : 'text',
  }
}

/* ───────────────────────────── Textes fixes, jamais confiés au modèle ───────────────────────── */

interface Locale {
  /** « Revue réglementaire du RCP — PRODUIT » / « SmPC Regulatory Review — PRODUCT ». */
  title: (product: string, docType: ConformityDocType) => string
  subtitle: (src: string, ref: string, date: string) => string
  warningHead: string
  /**
   * Volontairement GÉNÉRIQUE (« le document ») et non nommé par type : « la notice mis en
   * conformité » serait fautif, et accorder pronom et participe pour cinq types produirait cinq
   * variantes d'un texte à valeur juridique. Le titre dit déjà de quel document il s'agit.
   */
  warningBody: string[]
  h: [string, string, string, string, string]
  /** Encart « source scannée » — déterministe, jamais demandé au modèle (cf. l'avertissement). */
  scanHead: string
  scanBody: string[]
  scanFiguresLead: string
  gapsLead: (n: number) => string
  gapsMostSerious: string
  gapsThen: string
  notApplicable: (product: string) => string[]
  cols: { relocation: string[]; terminology: string[]; recommendation: string[] }
  noneFound: string
}

const LOCALES: Record<OutputLang, Locale> = {
  fr: {
    title: (p, d) => `Revue réglementaire ${DOC_SHORT[d].frOf} — ${p}`,
    subtitle: (s, r, d) => `\`${s}\` -> ${r} · ${d}`,
    warningHead: '### ⚠️ AVERTISSEMENT — À LIRE AVANT TOUTE UTILISATION',
    warningBody: [
      "Ce rapport n'est pas un document réglementaire et ne doit jamais être déposé auprès d'une " +
        'autorité. Il accompagne le document mis en conformité, il ne le remplace pas et ' +
        "n'en fait pas partie.",
      'Chaque élément signalé « à vérifier » doit être analysé et validé par un expert en affaires ' +
        'réglementaires avant d\'être repris dans un dossier. Pharnos assiste la décision ; il ne ' +
        "la prend pas, et n'engage pas la responsabilité du titulaire de l'AMM.",
    ],
    h: [
      'Ce qui a été déplacé',
      'Terminologie alignée sur les référentiels officiels',
      'À compléter',
      'Constats qui demandent une décision',
      'Recommandations',
    ],
    // ⚠️ Pas d'émoji dans un livrable : le PDF (WinAnsi) le retire et le SIGNALE — la première
    // livraison OCR réelle (KV-RL, 2026-08-14) est partie avec un avertissement « caractère
    // retiré » causé par notre propre décoration.
    scanHead: '### Votre document source a été lu par reconnaissance de caractères',
    scanBody: [
      // Formulé au niveau de ce qui est SU — notre mode de lecture — et non de ce qui est supposé.
      // Affirmer « aucun texte n'est enregistré dans ce PDF » énoncerait un fait sur le fichier du
      // client alors que la bascule peut venir d'une couche de texte pauvre ou de pages mixtes.
      'Son contenu a été reconstitué à partir de l’image des pages, faute de texte exploitable dans ' +
        'le fichier. Si votre lecteur vous affiche du texte sélectionnable, il provient de sa propre ' +
        'reconnaissance, pas du fichier.',
      'Les mots se relisent de façon fiable ; **les chiffres, non** — une reconnaissance confond ' +
        '0 et O, 1 et l, 5 et S, 8 et B. Le contrôle automatique des valeurs a donc été laissé ' +
        "consultatif pour ce document : exiger l'exactitude sur un texte reconstruit aurait fait " +
        'rétrograder des rubriques correctes.',
      '**Relisez les valeurs chiffrées du document mis en conformité contre votre original** — ' +
        'dosages, dates, durées de conservation, numéros. Un dossier fourni avec sa couche de texte ' +
        "n'appelle pas cette relecture.",
    ],
    scanFiguresLead: 'Valeurs lues par reconnaissance de caractères et non retrouvées à ' +
      "l'identique — à relire en priorité :",
    gapsLead: (n) =>
      `Toute rubrique du gabarit non renseignée par votre document porte la mention ` +
      `« Non fourni, à compléter » — ${n} au total. Le gabarit est le socle : rien n'est passé ` +
      `sous silence.`,
    gapsMostSerious: 'Le plus sérieux',
    gapsThen: 'Ensuite',
    notApplicable: (p) => [
      `**Ces rubriques sont-elles sans objet, ou ne concernent-elles pas ${p} ?**`,
      'Dans ce cas, inscrivez-y simplement « Sans objet ». Si au contraire elles concernent votre ' +
        'produit, complétez-les : le gabarit attend une réponse à chacune.',
    ],
    cols: {
      relocation: ['Contenu', 'Votre document', 'Gabarit', 'Risque évité'],
      terminology: ['Votre document', 'Corrigé en', 'Référentiel'],
      recommendation: ['#', 'Criticité', 'Action'],
    },
    noneFound: 'Aucun.',
  },
  en: {
    title: (p, d) => `${DOC_SHORT[d].en} Regulatory Review — ${p}`,
    subtitle: (s, r, d) => `\`${s}\` -> ${r} · ${d}`,
    warningHead: '### WARNING — READ BEFORE ANY USE',
    warningBody: [
      'This report is not a regulatory document and must never be filed with an authority. It ' +
        'accompanies the upgraded document; it does not replace it and is not part of it.',
      'Every item flagged "to be verified" must be analysed and validated by a regulatory affairs ' +
        'expert before being used in a dossier. Pharnos assists the decision; it does not make it, ' +
        'and does not engage the liability of the marketing authorisation holder.',
    ],
    h: [
      'What was relocated',
      'Terminology aligned with official references',
      'To be completed',
      'Findings that need a decision',
      'Recommendations',
    ],
    scanHead: '### Your source document was read by character recognition',
    scanBody: [
      'Its content was reconstructed from the page images, for want of usable text in the file. If ' +
        'your reader shows you selectable text, that text comes from its own recognition, not from ' +
        'the file.',
      'Words are read back reliably; **figures are not** — recognition confuses 0 with O, 1 with l, ' +
        '5 with S, 8 with B. The automatic check on values was therefore left advisory for this ' +
        'document: requiring an exact match against reconstructed text would have downgraded ' +
        'correct sections.',
      '**Read the figures in the upgraded document against your original** — strengths, dates, ' +
        'shelf life, numbers. A dossier supplied with its text layer does not call for this review.',
    ],
    scanFiguresLead: 'Values read by character recognition and not found identically — read these ' +
      'first:',
    gapsLead: (n) =>
      `Every maquette element left unfilled by your document carries "Not provided, to be ` +
      `completed" — ${n} in total. The maquette is the baseline: nothing is passed over in silence.`,
    gapsMostSerious: 'Most serious',
    gapsThen: 'Then',
    notApplicable: (p) => [
      `**Are these sections not applicable, or do they not concern ${p}?**`,
      'If so, simply enter "Not applicable". If they do apply to your product, complete them: the ' +
        'maquette expects an answer to each one.',
    ],
    cols: {
      relocation: ['Content', 'Your document', 'Maquette', 'Risk avoided'],
      terminology: ['Your document', 'Corrected to', 'Reference'],
      recommendation: ['#', 'Criticality', 'Action'],
    },
    noneFound: 'None.',
  },
}

/* ───────────────────────────────── Schéma et validation ──────────────────────────────────── */

export function reportSchema(): Record<string, unknown> {
  const str = { type: 'string' }
  const crit = { type: 'string', enum: [...CRITICALITIES] }
  const arr = (props: Record<string, unknown>, required: string[]) => ({
    type: 'array',
    items: { type: 'object', additionalProperties: false, required, properties: props },
  })
  return {
    type: 'object',
    additionalProperties: false,
    required: ['relocations', 'terminology', 'findings', 'recommendations'],
    properties: {
      relocations: arr(
        { content: str, source_position: str, template_position: str, risk: str },
        ['content', 'source_position', 'template_position', 'risk'],
      ),
      terminology: arr({ before: str, after: str, reference: str }, ['before', 'after', 'reference']),
      findings: arr({ criticality: crit, title: str, detail: str }, ['criticality', 'title', 'detail']),
      recommendations: arr({ criticality: crit, action: str }, ['criticality', 'action']),
    },
  }
}

function rows<T>(v: unknown, name: string, keys: (keyof T & string)[]): T[] {
  if (!Array.isArray(v)) throw new SectionOutputError('invalid_shape', `rapport : « ${name} » doit être une liste`)
  return v.map((row) => {
    if (!row || typeof row !== 'object') {
      throw new SectionOutputError('invalid_shape', `rapport : entrée de « ${name} » non structurée`)
    }
    const o = row as Record<string, unknown>
    for (const k of keys) {
      if (typeof o[k] !== 'string') {
        throw new SectionOutputError('invalid_shape', `rapport : « ${name}.${k} » absent ou non textuel`)
      }
    }
    return o as T
  })
}

export function parseReportAnalysis(raw: string): ReportAnalysis {
  const t = raw.trim()
  const body = t.startsWith('```')
    ? t.replace(/^```[a-zA-Z]*\s*/, '').replace(/```\s*$/, '').trim()
    : t
  let parsed: unknown
  try {
    parsed = JSON.parse(body)
  } catch {
    throw new SectionOutputError('invalid_json', 'rapport : JSON illisible')
  }
  if (!parsed || typeof parsed !== 'object') {
    throw new SectionOutputError('invalid_shape', 'rapport : objet attendu')
  }
  const o = parsed as Record<string, unknown>
  const analysis: ReportAnalysis = {
    relocations: rows(o.relocations, 'relocations', ['content', 'source_position', 'template_position', 'risk']),
    terminology: rows(o.terminology, 'terminology', ['before', 'after', 'reference']),
    findings: rows(o.findings, 'findings', ['criticality', 'title', 'detail']),
    recommendations: rows(o.recommendations, 'recommendations', ['criticality', 'action']),
  }
  for (const f of [...analysis.findings, ...analysis.recommendations]) {
    if (!CRITICALITIES.includes(f.criticality)) {
      throw new SectionOutputError('invalid_status', `rapport : criticité « ${f.criticality} » inconnue`)
    }
  }
  return analysis
}

/**
 * Écarte les affirmations FACTUELLES sur le document du client qui ne s'y retrouvent pas.
 *
 * Le rapport a le droit de raisonner et de recommander ; il n'a pas le droit d'inventer ce que dit
 * la source. « Votre rubrique 7 s'intitule Fabricant » est une affirmation vérifiable : la chaîne
 * doit figurer dans le document. Ce contrôle ne juge NI les constats NI les recommandations —
 * ce sont des analyses, pas des citations.
 */
export function pruneUnverifiable(analysis: ReportAnalysis, source: PreparedSource): {
  analysis: ReportAnalysis
  dropped: string[]
  /**
   * Nombre d'affirmations jugées SANS la tolérance de lecture, faute de budget CPU. Retourné et non
   * tu : une borne silencieuse se lit comme « tout a été contrôlé de la même façon ».
   */
  strictClaims: number
} {
  const dropped: string[] = []
  // Au-delà du budget on n'abandonne pas le contrôle : on s'en tient au LITTÉRAL, donc à plus de
  // rigueur. Dégrader dans l'autre sens laisserait passer des affirmations non vérifiées, et
  // personne ne le verrait.
  let budgetLeft = OCR_CLAIM_BUDGET
  let strictClaims = 0
  const present = (s: string) => {
    const n = normalizeForEvidence(s)
    // Trop court pour être une affirmation vérifiable : on laisse passer plutôt que de rejeter
    // sur du bruit (« 7 », « 5.2 » se retrouvent partout de toute façon).
    if (n.length < 4) return true
    // Le LITTÉRAL d'abord, et hors budget : c'est le cas courant et il ne coûte rien. Facturer les
    // correspondances exactes épuiserait le crédit sur ce qui n'en consomme pas, et la seule
    // affirmation qui avait besoin de la tolérance serait écartée.
    if (findInSourceExact(n, source)) return true
    // Recherche PARTAGÉE avec le contrôle de citation : sur une source océrisée, elle tolère les
    // caractères mal reconnus. Sans cela, une revue portant sur un scan écarterait ses propres
    // constats justes — le client paierait une analyse vidée par notre outil de lecture.
    if (source.kind === 'ocr') {
      // Facturé au travail RÉELLEMENT possible : au-delà de l'ancrage, `findInSource` refuse sans
      // lancer le moindre calcul — prélever la longueur entière ferait payer deux intitulés bavards
      // au prix de tous les suivants, basculés en littéral strict pour rien.
      const cost = Math.min(n.length, OCR_MAX_ANCHOR_CHARS) + OCR_CLAIM_FIXED_COST
      if (budgetLeft >= cost) {
        budgetLeft -= cost
        if (findInSource(n, source) !== 'absent') return true
      } else {
        strictClaims++
      }
    }
    dropped.push(s)
    return false
  }
  return {
    analysis: {
      ...analysis,
      relocations: analysis.relocations.filter((r) => present(r.source_position)),
      terminology: analysis.terminology.filter((t) => present(t.before)),
    },
    dropped,
    strictClaims,
  }
}

/* ─────────────────────────────────────── Instruction ─────────────────────────────────────── */

/**
 * Le PRÉAMBULE — identique aux quatre appels, donc mis en cache.
 *
 * ⚠️ Tout ce qui entre ici doit être vrai pour les QUATRE tableaux. Y glisser une consigne propre à
 * l'un d'eux ne casserait rien de visible : le préfixe resterait partagé, et les trois autres
 * appels paieraient simplement une consigne qui ne les concerne pas. C'est l'inverse qui est
 * coûteux — sortir d'ici quelque chose de commun le fait payer quatre fois en jetons frais.
 */
export function buildReportPreamble(req: ReportRequest): string {
  const { spec, sections, lang } = req
  const missing = sections.filter((s) => s.status === 'missing')
  const langLabel = lang === 'fr' ? 'FRANÇAIS' : 'ANGLAIS'
  return [
    `Tu rédiges l'ANALYSE d'un rapport d'upgrade réglementaire, en ${langLabel}.`,
    `Document : ${req.sourceName} · Gabarit : ${spec.label} — ${spec.reference}.`,
    '',
    'Le rapport lui-même est assemblé par le programme : avertissement, liste des rubriques à ' +
      'compléter et décomptes sont déjà écrits. Tu ne produis QUE des listes d\'analyse, et ' +
      'chaque demande n\'en porte QU\'UNE.',
    '',
    'Ton : celui d\'un confrère expérimenté qui travaille AVEC le client. Nomme son produit. ' +
      'Explique le risque, jamais le reproche. N\'écris pas « non conforme ».',
    '',
    `Rubriques restées à compléter (${missing.length}) : ${missing.map((s) => s.sectionId).join(', ') || '—'}`,
    // Sur un scan, le modèle lit la PIÈCE — jamais le texte océrisé. Il ne verra donc pas les
    // coquilles de la reconnaissance ; cette consigne ferme le cas inverse, celui où il en
    // devinerait une depuis une image de mauvaise qualité et l'attribuerait au client.
    ...(req.sourceKind === 'ocr'
      ? [
        '',
        'Ce document source est un SCAN, lu depuis son image. N\'en tire AUCUN constat de FORME — ' +
          'orthographe, ponctuation, casse, mot coupé : une anomalie de ce genre viendrait de la ' +
          'qualité de l\'image, pas du document du client. Les constats de FOND restent attendus, ' +
          'à l\'identique.',
      ]
      : []),
    '',
    ...(req.sourceParts?.length ? ['DOCUMENT SOURCE : voir la pièce fournie.'] : ['DOCUMENT SOURCE :', req.sourceText]),
  ].join('\n')
}

/** Ce qui est attendu de CHAQUE tableau — la seule partie qui change d'un appel à l'autre. */
const PART_SPEC: Record<ReportPart, string> = {
  relocations: '- « relocations » : les contenus dont la POSITION change entre le document source ' +
    'et le gabarit. `source_position` doit citer l\'intitulé tel qu\'il apparaît DANS le document ' +
    '(il est vérifié automatiquement ; un intitulé absent fait écarter la ligne). `risk` dit ce ' +
    'qu\'une recopie en place aurait produit, concrètement.',
  terminology: '- « terminology » : les libellés remplacés par leur forme officielle. `before` ' +
    'doit citer le libellé tel qu\'il apparaît dans le document (également vérifié).',
  findings: '- « findings » : les constats qui demandent une décision de l\'expert. C\'est ici, et ' +
    'seulement ici, que ta connaissance réglementaire et pharmaceutique générale est utile — ' +
    'incohérences internes, éléments hors périmètre, résidus d\'un autre dossier, classements ' +
    'erronés. Un constat sans conséquence pratique n\'a pas sa place.',
  recommendations: '- « recommendations » : les actions, une par ligne, formulées à l\'impératif.',
}

/** Les tableaux dont les lignes portent une criticité — la consigne ne part qu'à ceux-là. */
const PART_HAS_CRITICALITY: Record<ReportPart, boolean> = {
  relocations: false,
  terminology: false,
  findings: true,
  recommendations: true,
}

/**
 * La QUEUE variable de l'instruction : le tableau demandé, et lui seul.
 *
 * Placée après le point de rupture du cache, elle ne coûte que ses propres jetons et garde la
 * position de récence — celle que le modèle suit le mieux pour un contrat de sortie.
 *
 * La conséquence du mauvais aiguillage est DITE au modèle (« toute ligne rangée ailleurs est
 * écartée ») : c'est ce qui rend la consigne tenable sans schéma restreint, puisque le schéma, lui,
 * doit rester entier pour que le cache prenne.
 */
export function buildReportPartAsk(part: ReportPart, tail?: string): string {
  const others = REPORT_PARTS.filter((p) => p !== part).map((p) => `« ${p} »`).join(', ')
  return [
    `Cette demande porte sur UNE SEULE des quatre listes : « ${part} ».`,
    `Rends les trois autres (${others}) comme des listes VIDES : elles font l'objet de demandes ` +
      `distinctes, et toute ligne rangée ailleurs que dans « ${part} » est écartée.`,
    '',
    PART_SPEC[part],
    ...(PART_HAS_CRITICALITY[part]
      ? [
        '',
        'Criticité : « blocking » empêche le dépôt · « major » provoquera une question de ' +
          'l\'autorité · « minor » est une amélioration.',
      ]
      : []),
    ...(tail ? ['', tail] : []),
  ].join('\n')
}

/**
 * Les constats, tels qu'ils sont donnés à l'appel des recommandations.
 *
 * ⚠️ **Aucune borne, et c'est délibéré.** Couper la liste ferait produire des actions aveugles aux
 * derniers constats, sans que rien ne le signale — le rapport recommanderait alors de traiter ce
 * qu'il vient lui-même de signaler. Une borne qui tronque en silence est pire que pas de borne : les
 * intitulés sont courts, et ils ne sont pas mis en cache de toute façon.
 */
function findingsDigest(findings: ReportAnalysis['findings']): string {
  if (!findings.length) {
    return 'Aucun constat n\'a été retenu sur ce document : les actions ne peuvent donc pas s\'y ' +
      'adosser. Ne recommande que ce que le document lui-même justifie.'
  }
  return [
    'Constats DÉJÀ établis sur ce document. Tes actions doivent les COUVRIR sans les reformuler — ' +
      'le rapport les affiche déjà, juste au-dessus de tes recommandations :',
    ...findings.map((f) => `- [${f.criticality}] ${f.title}`),
  ].join('\n')
}

/* ────────────────────────────────────── Assemblage ───────────────────────────────────────── */

const table = (head: string[], body: string[][]): string[] => [
  `| ${head.join(' | ')} |`,
  `|${head.map(() => '---').join('|')}|`,
  ...body.map((r) => `| ${r.join(' | ')} |`),
]

const byCriticality = <T extends { criticality: Criticality }>(xs: T[]): T[] =>
  [...xs].sort((a, b) => CRITICALITIES.indexOf(a.criticality) - CRITICALITIES.indexOf(b.criticality))

/**
 * Assemble le markdown du rapport. Les parties fixes viennent d'ici, l'analyse du modèle : c'est
 * cette séparation qui rend l'avertissement et le décompte des lacunes impossibles à altérer.
 */
export function renderReportMarkdown(analysis: ReportAnalysis, req: ReportRequest): string {
  const L = LOCALES[req.lang]
  const missing = req.sections.filter((s) => s.status === 'missing')
  const out: string[] = [
    `# ${L.title(req.productName, req.spec.docType)}`,
    '',
    L.subtitle(req.sourceName, req.spec.reference, req.reportDate),
    '',
    `> ${L.warningHead}`,
    '>',
    ...L.warningBody.flatMap((p) => [`> ${p}`, '>']).slice(0, -1),
    '',
    '---',
    '',
  ]
  // Encart « scan » : déterministe comme l'avertissement, et pour la même raison — c'est la portée
  // exacte de nos garanties sur CE document. Un modèle pourrait l'omettre ou l'adoucir.
  if (req.sourceKind === 'ocr') {
    const toVerify = [...new Set(req.sections.flatMap((s) => s.figuresToVerify ?? []))]
    out.push(
      `> ${L.scanHead}`,
      '>',
      ...L.scanBody.flatMap((p) => [`> ${p}`, '>']).slice(0, -1),
    )
    if (toVerify.length) {
      out.push('>', `> ${L.scanFiguresLead}`, '>', `> ${toVerify.map((v) => `\`${v}\``).join(' · ')}`)
    }
    out.push('', '---', '')
  }
  let n = 0
  const section = (title: string) => out.push(`## ${++n}. ${title}`, '')

  section(L.h[0])
  if (analysis.relocations.length) {
    out.push(
      ...table(L.cols.relocation, analysis.relocations.map((r) => [
        r.content, r.source_position, `**${r.template_position}**`, r.risk,
      ])),
      '',
    )
  } else out.push(L.noneFound, '')

  section(L.h[1])
  if (analysis.terminology.length) {
    out.push(
      ...table(L.cols.terminology, analysis.terminology.map((t) => [t.before, `**${t.after}**`, t.reference])),
      '',
    )
  } else out.push(L.noneFound, '')

  // Liste des lacunes : DÉRIVÉE des statuts, jamais racontée par le modèle.
  section(`${L.h[2]} — ${missing.length}`)
  out.push(L.gapsLead(missing.length), '')
  if (missing.length) {
    const [first, ...rest] = missing
    out.push(`**${L.gapsMostSerious}** : ${first.sectionId}. ${first.title}.`, '')
    if (rest.length) {
      out.push(`${L.gapsThen} : ${rest.map((s) => `${s.sectionId}. ${s.title}`).join(' · ')}.`, '')
    }
    out.push(...L.notApplicable(req.productName).map((l, i) => (i ? `> ${l}` : `> ${l}`)), '')
  }

  section(L.h[3])
  const findings = byCriticality(analysis.findings)
  if (findings.length) {
    for (const f of findings) out.push(`- ${DOT[f.criticality]} **${f.title}** ${f.detail}`)
    out.push('')
  } else out.push(L.noneFound, '')

  section(L.h[4])
  const recs = byCriticality(analysis.recommendations)
  if (recs.length) {
    out.push(
      ...table(L.cols.recommendation, recs.map((r, i) => [String(i + 1), DOT[r.criticality], r.action])),
      '',
    )
  } else out.push(L.noneFound, '')

  return out.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n'
}

/* ─────────────────────────────────────── Génération ──────────────────────────────────────── */

export interface ReportOutcome {
  markdown: string
  analysis: ReportAnalysis
  /** Affirmations écartées faute d'être retrouvées dans le document — signal de qualité. */
  droppedClaims: string[]
  /**
   * Affirmations jugées sans la tolérance de lecture, faute de budget CPU (source océrisée bavarde).
   * Non nul = le contrôle a été plus STRICT que prévu sur ces lignes, donc certaines ont pu être
   * écartées à tort. À journaliser : une borne qu'on ne voit pas se lit comme une absence de borne.
   */
  strictClaims: number
  /**
   * Lignes rendues sous une liste NON demandée, donc écartées.
   *
   * **Métrique à suivre**, exactement comme `misrouted` sur les rubriques : elle est le prix du
   * schéma entier: il faut le garder pour que le cache prenne, mais il laisse au modèle la
   * possibilité de ranger une ligne ailleurs. Non nul et durable ⇒ la consigne de queue ne tient
   * plus, et l'arbitrage cache/schéma serait à rouvrir.
   */
  strayRows: number
  /** Durée de CHAQUE appel de tableau. C'est la mesure qui justifie le découpage — ou l'infirme. */
  partsMs: Record<ReportPart, number>
  /**
   * Tentatives par tableau : 1 en régime normal, 2 après un rejeu pour mauvais aiguillage.
   *
   * ⚠️ La passe coûte donc **4 appels au moins**, pas 4 exactement. Un compte figé à 4 sous-estimerait
   * la facture des cas difficiles — précisément le défaut relevé sur les revues avortées de U0, dont
   * le coût n'était retrouvable que par différence avec la console.
   */
  partsAttempts: Record<ReportPart, number>
}

/** Ce que rend UN appel de tableau. */
export interface ReportPartOutcome {
  part: ReportPart
  /** Analyse ne portant QUE `part` — les trois autres listes y sont vides, garanties en code. */
  analysis: ReportAnalysis
  /** 2 = la première réponse était mal aiguillée et a été rejouée. */
  attempts: number
  /** Lignes rangées sous une autre liste, écartées (cf. `ReportOutcome.strayRows`). */
  strayRows: number
  ms: number
}

/**
 * Les fragments COMMUNS aux quatre appels : la pièce, puis le préambule. Le tableau demandé s'ajoute
 * après — d'où le point de rupture du cache sur le dernier fragment d'ici.
 *
 * L'invariant « le texte océrisé n'entre jamais dans le prompt » se tient ICI, dans la fonction qui
 * assemble les fragments — pas dans le commentaire du champ. Sans la pièce, le repli enverrait le
 * texte reconstruit AVEC la consigne qui affirme au modèle qu'il lit une image : il reprocherait
 * alors au client des coquilles fabriquées par notre propre lecture, et `pruneUnverifiable` ne
 * pourrait pas les écarter puisqu'elles figurent bel et bien dans le corpus de contrôle.
 * La NATURE de la pièce compte, pas sa présence : `sourceParts: [{ text: ocr }]` satisferait un
 * simple test de longueur et enverrait le texte reconstruit au modèle, avec la consigne qui lui
 * affirme qu'il lit une image. C'est l'invariant que ce garde-fou prétend tenir.
 */
function reportPrefix(req: ReportRequest): Part[] {
  if (req.sourceKind === 'ocr' && !req.sourceParts?.some((p) => p.inlineData)) {
    throw new Error('revue sur source océrisée : la pièce d’origine (image ou PDF) est obligatoire')
  }
  // Pièce d'abord, instruction ensuite — même ordre que la passe de conformité : le préfixe stable
  // reste cachable et la consigne de sortie garde la position la plus récente.
  return [...(req.sourceParts ?? []), { text: buildReportPreamble(req) }]
}

/**
 * Produit UN tableau du rapport.
 *
 * Exportée parce que U4 pilote la revue tableau par tableau, avec son propre état en base : une
 * ligne `upgrade_sections` par tableau, donc un rejeu ciblé plutôt que quatre appels repayés.
 * `generateReport` n'est que l'orchestration de ces quatre appels dans une seule invocation.
 */
export async function generateReportPart(
  generate: (parts: Part[], opts: AiOptions) => Promise<string>,
  req: ReportRequest,
  part: ReportPart,
  options: { deadline: number; tail?: string },
): Promise<ReportPartOutcome> {
  const prefix = reportPrefix(req)
  const startedAt = Date.now()
  let strayRows = 0

  for (let attempt = 1; attempt <= 2; attempt++) {
    const remaining = options.deadline - Date.now()
    // Ne pas LANCER ce qui ne peut pas finir : la plateforme tuerait l'appel en vol, payé et muet.
    if (remaining < REPORT_MIN_SLICE_MS) {
      if (attempt === 1) {
        throw new Error(
          `revue « ${part} » : ${Math.round(remaining)} ms restants — un appel qui ne peut pas finir ` +
            `est un 546 déguisé`,
        )
      }
      break
    }
    const raw = await generate([...prefix, { text: buildReportPartAsk(part, options.tail) }], {
      // Sans posture, la revue perdrait ce que le client achète : c'est la SEULE passe où la
      // connaissance générale est un actif, et elle doit être autorisée explicitement.
      system: req.system ?? reviewSystem(req.lang),
      json: true,
      // ⚠️ Le schéma ENTIER, identique aux quatre appels — sans quoi le préfixe cesse d'être
      // partagé et les quatre paient une écriture de cache (cf. « Le découpage », n°1).
      jsonSchema: reportSchema(),
      maxOutputTokens: REPORT_PART_MAX_OUTPUT_TOKENS,
      timeoutMs: Math.min(REPORT_PART_TIMEOUT_MS, remaining),
      provider: req.provider,
      cacheBreakpointAfter: prefix.length - 1,
    })
    const { only, stray } = splitPart(parseReportAnalysis(raw), part)
    strayRows += stray
    // Liste demandée VIDE alors que le modèle a rempli une autre : ce n'est pas « rien à signaler »,
    // c'est un mauvais aiguillage. Le rejouer coûte un appel ; l'accepter ferait écrire « Aucun. »
    // dans un rapport payé, là où le modèle avait bel et bien trouvé quelque chose.
    if (only[part].length || stray === 0) {
      return { part, analysis: only, attempts: attempt, strayRows, ms: Date.now() - startedAt }
    }
  }
  // Deux fois de suite : on refuse. Aucune ligne n'est rangée sous une liste qu'elle ne concerne
  // pas, et surtout aucune liste jamais obtenue n'est présentée comme vide.
  throw new SectionOutputError(
    'misrouted',
    `revue : la liste « ${part} » est revenue vide deux fois, avec ${strayRows} ligne(s) rangée(s) ` +
      `ailleurs — refusé plutôt que rendu « Aucun. »`,
  )
}

/** Verse une analyse partielle dans l'assemblage. */
function merge(into: ReportAnalysis, from: ReportAnalysis): void {
  into.relocations.push(...from.relocations)
  into.terminology.push(...from.terminology)
  into.findings.push(...from.findings)
  into.recommendations.push(...from.recommendations)
}

/**
 * Un tableau manquant fait REFUSER le rapport entier.
 *
 * ⚠️ Ne pas « dégrader gracieusement » ici. `renderReportMarkdown` écrit « Aucun. » pour une liste
 * vide — c'est une AFFIRMATION, pas une absence de données. Livrer « Aucune terminologie à
 * aligner » parce qu'un appel a expiré, c'est exactement le défaut corrigé en `d224665` : un
 * rapport qui contredit son propre document, sans que rien ne le signale. L'appelant rejoue le ou
 * les tableaux nommés — leur état est per-tableau, jamais la passe entière.
 */
function refuseIfIncomplete(report: PoolReport<ReportPartOutcome>, parts: readonly ReportPart[]): void {
  if (report.failed === 0 && report.skipped === 0) return
  const lost = report.outcomes
    .map((o, i) => (o.skipped || o.error ? `« ${parts[i]} » (${o.skipped ? 'non lancé' : o.error?.message})` : null))
    .filter((s): s is string => s !== null)
  // `cause` porte la PREMIÈRE erreur telle quelle : c'est elle qui dit si l'échec est déterministe
  // (JSON illisible, troncature — jamais re-tenter) ou transitoire (503, délai). L'enrobage nomme le
  // tableau ; il ne doit pas effacer ce qui permet de décider du rejeu.
  throw new Error(`revue incomplète, rapport refusé — à rejouer : ${lost.join(' · ')}`, {
    cause: report.outcomes.find((o) => o.error)?.error,
  })
}

/**
 * Produit le rapport : QUATRE appels contraints, assemblage déterministe.
 *
 * Trois étapes, pour les raisons détaillées en tête de fichier (§ « Le découpage ») : un
 * préchauffage qui écrit le préfixe partagé, une vague qui le relit, puis les recommandations
 * nourries des constats.
 */
export async function generateReport(
  generate: (parts: Part[], opts: AiOptions) => Promise<string>,
  req: ReportRequest,
): Promise<ReportOutcome> {
  const budgetMs = req.budgetMs ?? REPORT_BUDGET_MS
  if (budgetMs < MIN_REPORT_BUDGET_MS) {
    throw new Error(
      `revue : budget de ${Math.round(budgetMs)} ms — un appel qui ne peut pas finir est un 546 déguisé`,
    )
  }
  // Lève AVANT tout appel si la source est un scan sans sa pièce : rien ne doit être payé pour un
  // rapport qu'on refusera ensuite.
  reportPrefix(req)
  const deadline = Date.now() + budgetMs

  // Étapes 1 et 2 — `warmupFirst` fait partir `terminology` SEUL : c'est lui qui écrit le préfixe
  // partagé, que `relocations` et `findings` relisent ensuite à 0,1×. Sans lui, trois écritures.
  const wave = await boundedMap(
    REPORT_WAVE,
    (part) => generateReportPart(generate, req, part, { deadline }),
    {
      concurrency: REPORT_WAVE.length,
      warmupFirst: true,
      deadline,
      minSliceMs: REPORT_MIN_SLICE_MS,
    },
  )
  refuseIfIncomplete(wave, REPORT_WAVE)

  const assembled = emptyAnalysis()
  const partsMs = {} as Record<ReportPart, number>
  const partsAttempts = {} as Record<ReportPart, number>
  let strayRows = 0
  const collect = (value: ReportPartOutcome) => {
    merge(assembled, value.analysis)
    partsMs[value.part] = value.ms
    partsAttempts[value.part] = value.attempts
    strayRows += value.strayRows
  }
  for (const o of wave.outcomes) collect(o.value as ReportPartOutcome)

  // Étape 3 — les recommandations voient les constats. C'est la seule dépendance entre les quatre,
  // et elle voyage dans la queue variable : le préfixe partagé reste intact.
  collect(
    await generateReportPart(generate, req, REPORT_LAST, {
      deadline,
      tail: findingsDigest(assembled.findings),
    }),
  )

  const { analysis, dropped, strictClaims } = pruneUnverifiable(
    assembled,
    prepareSource(req.sourceText, req.sourceKind),
  )
  return {
    markdown: renderReportMarkdown(analysis, req),
    analysis,
    droppedClaims: dropped,
    strictClaims,
    strayRows,
    partsMs,
    partsAttempts,
  }
}
