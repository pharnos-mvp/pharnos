// Génération PAR RUBRIQUE (lot M2) — module PUR : le générateur est INJECTÉ, donc ce cœur se teste
// sans réseau, sans SDK et sans Supabase. `upgrade/index.ts` lui passe `generateParts`.
//
// PLAN-MOTEUR-IA §3 : une rubrique du gabarit = un appel. Sortie de quelques centaines à ~2 000
// tokens → 10 à 20 s, très loin du mur de 150 s. Ce n'est pas un contournement : un document entier
// demande ~440 s, au-dessus même du mur du plan Pro. C'est la seule forme qui tienne.
//
// Ce module est le point où les garanties sont rendues exécutables (§8.2) :
//  1. le modèle ne peut pas répondre sur une autre rubrique (`enum` réduit à celle demandée) ;
//  2. une rubrique dont la citation n'est pas retrouvée dans la source est rejouée UNE fois, puis
//     rétrogradée en `missing` — jamais livrée telle quelle ;
//  3. une rubrique dont les VALEURS CHIFFRÉES ne se retrouvent pas dans la source subit le même
//     sort. Sans ce troisième contrôle, citer un titre de rubrique — présent dans tout RCP —
//     suffirait à faire passer un contenu inventé : la citation prouve qu'un passage existe, pas
//     que le contenu en découle.
import {
  isEvidenceRejected,
  ungroundedFigures,
  verifyEvidence,
  type EvidenceVerdict,
  type PreparedSource,
} from './ai/evidence.ts'
import {
  parseSectionResult,
  sectionSchema,
  type SectionResult,
  type SectionStatus,
} from './ai/section-schema.ts'
import type { AiOptions, Part, Provider } from './ai/types.ts'
import type { ConformitySpec, RubricSpec } from './conformity-specs.ts'

/**
 * Marqueur officiel des rubriques sans information source — CONTRAT CLIENT (le compteur du front
 * l'affiche et le compte). Depuis M2 il n'est plus le mécanisme : `status` est un champ typé, le
 * marqueur n'est plus qu'une conséquence d'affichage (§3.2). Il est rendu ICI, jamais par le modèle.
 */
export const MISSING_MARKER = '[Non fourni, à compléter]'

/** Le même marqueur dans la langue cible — la lacune se traduit, elle ne disparaît pas (étape 2). */
export const MISSING_MARKER_EN = '[Not provided, to be completed]'

/** Langue du document PRODUIT. La langue de la source, elle, n'a pas à être déclarée : le modèle la lit. */
export type OutputLang = 'fr' | 'en'

const LANGUAGE_LABEL: Record<OutputLang, string> = { fr: 'FRANÇAIS', en: 'ANGLAIS' }

const MARKER_BY_LANG: Record<OutputLang, string> = { fr: MISSING_MARKER, en: MISSING_MARKER_EN }

/** Une génération + un rejeu. Au-delà, on constate l'échec : rejouer indéfiniment coûte et ment. */
export const MAX_SECTION_ATTEMPTS = 2

/** Budget par défaut d'UNE rubrique, rejeu compris. Reste très en deçà du mur de 150 s. */
export const SECTION_BUDGET_MS = 110_000

/** Timeout d'une tentative. Une rubrique qui dépasse n'a pas de raison d'aboutir en la rejouant. */
export const SECTION_ATTEMPT_TIMEOUT_MS = 60_000

/** En deçà, on ne LANCE pas de rejeu : un appel qui ne peut pas finir est un appel payé pour rien. */
const MIN_REPLAY_BUDGET_MS = 20_000

/**
 * Budget de TEXTE demandé pour une rubrique. ⚠️ Le fournisseur Anthropic le relève à son plancher
 * (`MIN_MAX_TOKENS`, 16 000) parce que `max_tokens` y plafonne réflexion + texte (§10, piège n°2) :
 * cette constante ne borne donc pas la dépense réelle aujourd'hui. Elle reste le réglage du banc M3.
 */
const SECTION_MAX_OUTPUT_TOKENS = 4_000

/** Longueur de la citation refusée renvoyée au modèle au rejeu — bornée, jamais le document. */
const REJECTED_ECHO_CHARS = 200

/** Signature du générateur injecté — exactement celle de `provider.generateParts`. */
export type SectionGenerator = (parts: Part[], opts: AiOptions) => Promise<string>

export interface SectionRequest {
  spec: ConformitySpec
  /** LA rubrique à produire (feuille du gabarit dans le cas nominal). */
  rubric: RubricSpec
  /** Fragments du document source — l'instruction est ajoutée DERRIÈRE (préfixe stable, cf. boucle). */
  sourceParts: Part[]
  /** Source normalisée pour le contrôle de CITATION. `available: false` → verdict `unverifiable`. */
  source: PreparedSource
  /**
   * Base d'ancrage des VALEURS CHIFFRÉES, si elle diffère de `source`. Le contexte certifié du
   * dossier (titulaire, fabricant, RCCM, adresses) est une donnée vérifiée par Pharnos, présentée
   * au modèle comme utilisable : sans elle ici, un numéro de RCCM légitime ferait rétrograder la
   * rubrique 7. Défaut : `source`.
   */
  grounding?: PreparedSource
  /** Consigne système (rôle, zéro-invention, terminologie verrouillée). */
  system?: string
  /** Pays cible : filtre les mentions imposées propres à un pays. */
  countryCode?: string
  /** Contexte certifié du dossier (fiche produit Pharnos) — données vérifiées, pas des inventions. */
  extraContext?: string
  /**
   * Langue du document PRODUIT. Défaut `fr` : le gabarit UEMOA est français, donc l'étape 1 rend du
   * français même à partir d'une source anglaise. Ce réglage NE touche pas `source_evidence`, qui
   * reste toujours dans la langue de la source — c'est ce qui permet de la retrouver.
   */
  outputLang?: OutputLang
  /** Fournisseur imposé pour CET appel — la sortie structurée n'existe pas chez tous (§3.2). */
  provider?: Provider
  /** Budget total de la rubrique, rejeu compris. */
  budgetMs?: number
  /** Horloge injectable (tests). */
  now?: () => number
}

export interface SectionOutcome {
  sectionId: string
  /** Titre officiel FR du gabarit — jamais un titre produit par le modèle. */
  title: string
  status: SectionStatus
  /** Texte de la rubrique, ou le marqueur quand elle est absente/rétrogradée. */
  content: string
  /** Citation source retenue — vide dès lors que la rubrique ne porte rien à justifier. */
  evidence: string
  verdict: EvidenceVerdict
  /** Valeurs chiffrées du contenu introuvables dans la source — vide quand tout est ancré. */
  ungrounded: string[]
  attempts: number
  /**
   * `true` quand une rubrique PRODUITE a été rétrogradée en `missing`. C'est la métrique qualité
   * n°1 du banc M3 (§7) — encore faut-il pouvoir en lire la CAUSE, d'où `downgradeReason` : un
   * drapeau qui confond invention, incohérence et budget épuisé ne mesure rien.
   */
  downgraded: boolean
  downgradeReason?: DowngradeReason
  /**
   * `true` quand le corpus de contrôle est issu d'une reconnaissance de caractères : les valeurs de
   * `ungrounded` sont alors **à vérifier**, pas des inventions constatées. La revue doit le dire.
   */
  figuresAdvisory: boolean
}

export type DowngradeReason =
  /** Citation source introuvable après rejeu. */
  | 'evidence'
  /** Valeurs chiffrées absentes de la source (contenu inventé sous une citation valide). */
  | 'figures'
  /** `status` annonce du contenu, `content` est vide. */
  | 'empty_content'
  /** Rejet non rejoué faute de budget : un défaut de PLATEFORME, pas une tentation d'inventer. */
  | 'budget'

/**
 * Neutralise ce qui permettrait à un extrait de se faire passer pour une consigne : caractères de
 * contrôle, et guillemets fermants qui refermeraient le délimiteur pour enchaîner sur du texte
 * d'apparence système. Ce texte vient de NOTRE modèle, mais il dérive d'un document fourni par
 * l'utilisateur : il est traité comme une donnée, jamais comme une instruction.
 */
function echoSafe(s: string): string {
  return s
    // deno-lint-ignore no-control-regex
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/["\u00AB\u00BB\u201C\u201D\u201E]/g, "'")
    .trim()
    .slice(0, REJECTED_ECHO_CHARS)
}

/**
 * Instruction de LA rubrique. Volontairement courte : le modèle n'a pas besoin de l'arbre complet
 * du gabarit pour écrire une rubrique — le lui envoyer 28 fois serait payer 28 fois pour rien.
 *
 * Deux clauses OBLIGATOIRES sur Opus 5 (§10) : concision sur `content` et discipline de périmètre.
 * Sans elles, Opus 5 produit du remplissage fidèle mais non demandé — précisément ce que
 * `source_evidence` ne détecte pas, puisque le remplissage EST tiré de la source.
 *
 * Aucune consigne d'auto-vérification (§3.3, §8.3) : la vérification est programmatique.
 */
export function buildSectionInstruction(req: SectionRequest, rejected?: RejectedAttempt): string {
  const { spec, rubric, countryCode, extraContext } = req
  const lines: string[] = [
    `Tu produis UNE SEULE rubrique du template « ${spec.label} » (${spec.reference}).`,
    '',
    `Rubrique demandée : ${rubric.id}. ${rubric.title} ${rubric.required ? '[OBLIGATOIRE]' : '[optionnelle]'}`,
  ]
  for (const m of rubric.mentions ?? []) {
    if (m.requiredFor && (!countryCode || !m.requiredFor.includes(countryCode))) continue
    lines.push(`Mention imposée dans cette rubrique : « ${m.text} »`)
  }
  if (rubric.children?.length) {
    const kids = rubric.children.map((c) => c.id).join(', ')
    lines.push(
      `Cette rubrique a des sous-rubriques produites SÉPARÉMENT (${kids}) : ne les produis pas ici.`,
    )
  }
  if (spec.rules.length) {
    lines.push('', 'Règles du template applicables :', ...spec.rules.map((r) => `- ${r}`))
  }
  if (extraContext) lines.push('', extraContext.trim())

  lines.push(
    '',
    'Contrat de sortie :',
    `- « section_id » : exactement « ${rubric.id} ».`,
    '- « status » : « filled » si la source couvre la rubrique, « partial » si elle ne la couvre ' +
      "qu'en partie, « missing » si la source n'en dit rien.",
    '- « content » : le TEXTE de la rubrique, sans son titre, sans commentaire et sans mise en ' +
      'forme décorative. Concis : ce qui ne figure pas dans la source n’y entre pas. Laisse ce ' +
      'champ vide si « status » vaut « missing ».',
    '- « source_evidence » : un extrait COPIÉ MOT POUR MOT du document source (une à trois ' +
      'phrases) d’où provient « content ». Un extrait qui ne figure pas dans le document fait ' +
      'rejeter la rubrique. Laisse ce champ vide si « status » vaut « missing ».',
    '',
    'Périmètre : rien pour une autre rubrique, pas d’introduction, pas de conclusion, pas de ' +
      'recommandation, pas de connaissance générale sur ce médicament.',
    '',
    // ⚠️ Clause DÉCISIVE quand la source n'est pas dans la langue du gabarit. Sans elle, le modèle
    // traduit AUSSI la citation pour rester cohérent avec `content` — et le contrôle, qui cherche
    // la citation dans le document ORIGINAL, échoue sur CHAQUE rubrique. Le dossier entier
    // ressortirait « non fourni » alors qu'il est complet.
    `LANGUES — le document source peut être rédigé dans une autre langue que le gabarit.\n` +
      `- « content » est rédigé en ${LANGUAGE_LABEL[req.outputLang ?? 'fr']}, quelle que soit la ` +
      'langue de la source.\n' +
      '- « source_evidence » reste au contraire dans la LANGUE DE LA SOURCE, copié caractère pour ' +
      'caractère. Ne le traduis JAMAIS : il est recherché tel quel dans le document original.',
  )

  if (rejected?.reason === 'evidence') {
    lines.push(
      '',
      'TENTATIVE PRÉCÉDENTE REJETÉE — l’extrait cité n’a pas été retrouvé dans le document source.',
      `Extrait refusé : "${echoSafe(rejected.result.source_evidence)}"`,
      // Formulation IMPORTANTE : demander « un passage présent tel quel » enseignerait à citer
      // n'importe quelle ligne (un titre suffirait) au lieu d'ancrer le contenu. On demande la
      // provenance du contenu — ou l'aveu que la source ne dit rien.
      'Recommence : écris « content » à partir de ce que dit RÉELLEMENT le document, et cite en ' +
        '« source_evidence » le passage D’OÙ PROVIENT ce que tu écris. Si le document ne dit rien ' +
        'sur cette rubrique, réponds « status: missing » avec « content » et « source_evidence » vides.',
    )
  } else if (rejected?.reason === 'too_long') {
    lines.push(
      '',
      'TENTATIVE PRÉCÉDENTE REJETÉE — la citation était TROP LONGUE pour être vérifiée d’un seul ' +
        'tenant.',
      'Recommence à l’identique, mais cite en « source_evidence » UNE SEULE phrase — la plus ' +
        'précise — d’où provient « content ». Ne change rien d’autre.',
    )
  } else if (rejected?.reason === 'figures') {
    lines.push(
      '',
      'TENTATIVE PRÉCÉDENTE REJETÉE — les valeurs ci-dessous figuraient dans ton contenu mais ' +
        'PAS dans le document source :',
      `Valeurs non fondées : ${rejected.figures.map((f) => `"${echoSafe(f)}"`).join(', ')}`,
      'Recommence sans aucune valeur absente du document. Une donnée chiffrée que la source ne ' +
        'porte pas ne doit pas être écrite : la rubrique est alors « partial » ou « missing ».',
    )
  }
  return lines.join('\n')
}

/** Ce que le rejeu doit corriger — le message d'un rejet de citation ne vaut rien pour l'autre. */
interface RejectedAttempt {
  reason: 'evidence' | 'figures' | 'too_long'
  result: SectionResult
  figures: string[]
}

/** Options d'appel d'une tentative — la sortie structurée est le cœur du protocole (§3.2). */
function attemptOptions(req: SectionRequest, timeoutMs: number): AiOptions {
  return {
    system: req.system,
    json: true,
    jsonSchema: sectionSchema([req.rubric.id]),
    maxOutputTokens: SECTION_MAX_OUTPUT_TOKENS,
    timeoutMs,
    provider: req.provider,
    // Cache de préfixe : consigne système + document source sont IDENTIQUES pour les 29 rubriques
    // d'un même document, et pèsent 72 % du coût d'entrée (mesuré sur KV-Kacin). Le point de
    // rupture se place donc après le dernier fragment source ; l'instruction, variable, reste
    // dehors. Sans fragment source (cas de test), pas de préfixe à partager.
    ...(req.sourceParts.length > 0 ? { cacheBreakpointAfter: req.sourceParts.length - 1 } : {}),
    // `effort` laissé au défaut du fournisseur (`medium`, §10) : sur une réécriture structurée à
    // invention nulle, un effort supérieur fabrique du contenu non demandé.
  }
}

/**
 * Produit une rubrique et n'en rend le contenu QUE si sa citation source a été retrouvée ET que ses
 * valeurs chiffrées existent dans la source.
 *
 * Les erreurs du générateur (timeout, refus, troncature, JSON inexploitable) remontent telles
 * quelles : ce sont des pannes déterministes, pas des rejets de citation. En particulier un timeout
 * n'est JAMAIS rejoué (§8.9) — une seconde tentative après 60 s ne tient pas sous le mur de 150 s.
 */
export async function generateSection(
  generate: SectionGenerator,
  req: SectionRequest,
): Promise<SectionOutcome> {
  const now = req.now ?? Date.now
  const deadline = now() + (req.budgetMs ?? SECTION_BUDGET_MS)
  const ids = [req.rubric.id]
  // SEUL le numéro de la rubrique demandée est exempté : exempter tous ceux du gabarit (« 10 »,
  // « 4.2 »…) laisserait passer « posologie : 10 mg » ou « chez 10 % des patients » inventés.
  // Les renvois explicites (« voir rubrique 6.6 ») sont retirés en amont par `ungroundedFigures`.
  const ownId = new Set([req.rubric.id])
  // L'ancrage des chiffres peut porter sur une base PLUS LARGE que la citation : le contexte
  // certifié du dossier (titulaire, fabricant, RCCM, adresses) est une donnée vérifiée par Pharnos.
  // La citation, elle, doit rester dans le DOCUMENT — d'où deux sources distinctes.
  const grounding = req.grounding ?? req.source
  // La provenance a UNE source de vérité : celle du document. Lire `grounding.kind` ici laisserait
  // un appelant construire une base d'ancrage sans la déclarer océrisée — on obtiendrait alors une
  // citation tolérante ET des chiffres exigeants, donc un rejeu qui INVITE le modèle à « corriger »
  // 300 en 3OO. C'est exactement le scénario que le rejeu ne doit jamais produire.
  // Une erreur d'APPELANT, pas une sortie de modèle inexploitable : elle doit casser bruyamment en
  // test plutôt que produire un livrable au contrôle mal réglé.
  if (grounding.kind !== req.source.kind) {
    throw new Error('provenance incohérente entre le document source et la base d’ancrage')
  }
  // Corpus de contrôle océrisé ⇒ les chiffres deviennent CONSULTATIFS (voir la boucle ci-dessous).
  const figuresAdvisory = req.source.kind === 'ocr'

  let parsed: SectionResult | null = null
  let verdict: EvidenceVerdict = 'not_attempted'
  let ungrounded: string[] = []
  let attempts = 0
  let budgetExhausted = false

  for (let i = 0; i < MAX_SECTION_ATTEMPTS; i++) {
    const remaining = deadline - now()
    // Au rejeu seulement : refuser de LANCER un appel qui ne peut pas finir sous le mur. La
    // première tentative part toujours — sinon la rubrique n'aurait aucune chance d'exister.
    if (i > 0 && remaining < MIN_REPLAY_BUDGET_MS) {
      budgetExhausted = true
      break
    }
    const timeoutMs = Math.min(SECTION_ATTEMPT_TIMEOUT_MS, Math.max(remaining, 1_000))

    const correction: RejectedAttempt | undefined = i > 0 && parsed
      ? {
        // Sur un corpus océrisé, la boucle ne rejoue QUE sur la citation : `'figures'` y est
        // inatteignable, et c'est essentiel. Reprocher au modèle des valeurs correctes lues de
        // travers l'amènerait à les « corriger » vers la lecture fautive — nous ferions écrire
        // 8 mg là où le document dit 3 mg, en croyant renforcer un contrôle.
        // ⚠️ `too_long` a son propre message. Le confondre avec `evidence` ferait affirmer au modèle
        // que sa citation « n'a pas été retrouvée » — c'est FAUX, elle est trop longue pour être
        // jugée d'un tenant — et ne lui demanderait jamais de la raccourcir : la seconde tentative
        // serait identique, et une rubrique correcte finirait « Non fourni ».
        reason: verdict === 'too_long' ? 'too_long' : isEvidenceRejected(verdict) ? 'evidence' : 'figures',
        result: parsed,
        figures: ungrounded,
      }
      : undefined
    attempts++
    let raw: string
    try {
      raw = await generate(
        // Source D'ABORD, instruction ENSUITE. Deux raisons qui vont dans le même sens : le préfixe
        // stable (système + source) devient cachable pour les 28 rubriques d'un même document, et le
        // contrat de sortie — non le document fourni par l'utilisateur — occupe la position de
        // récence, celle qui pèse le plus sur ce que le modèle fait.
        [...req.sourceParts, { text: buildSectionInstruction(req, correction) }],
        attemptOptions(req, timeoutMs),
      )
    } catch (e) {
      // Une panne AU REJEU ne doit pas effacer la première tentative : celle-ci était rejetée, donc
      // la rubrique se rétrograde proprement. Faire remonter un 502 obligerait le worker (M4) à
      // rejouer la rubrique entière — deux appels payés pour retomber sur le même verdict.
      if (i === 0) throw e
      break
    }
    parsed = parseSectionResult(raw, ids)
    verdict = verifyEvidence(parsed.source_evidence, req.source, parsed.status, req.rubric.title)
    ungrounded = parsed.status === 'missing'
      ? []
      : ungroundedFigures(parsed.content, grounding, ownId)
    // Sur un corpus océrisé, un chiffre non retrouvé n'est PAS une invention constatée : l'OCR
    // confond 0/O, 1/l, 5/S, 8/B. Rejouer puis rétrograder sur ce signal ferait tomber des rubriques
    // justes. Les valeurs sont donc SIGNALÉES à vérifier, jamais opposées au livrable.
    if (!isEvidenceRejected(verdict) && (figuresAdvisory || ungrounded.length === 0)) break
  }

  const title = req.rubric.title
  // Le marqueur suit la langue du document produit : une lacune se traduit, elle ne disparait pas.
  const marker = MARKER_BY_LANG[req.outputLang ?? 'fr']
  if (!parsed) {
    // Aucune tentative n'a pu être lancée (budget épuisé avant même le premier appel).
    return {
      sectionId: req.rubric.id,
      title,
      status: 'missing',
      content: marker,
      evidence: '',
      verdict,
      ungrounded,
      attempts,
      downgraded: false,
      figuresAdvisory,
    }
  }

  // Rétrogradation. On préfère signaler une rubrique à compléter que livrer une affirmation non
  // justifiée : sur un dossier d'AMM, se tromper dans ce sens coûte une relecture, dans l'autre
  // coûte le dossier. La CAUSE est conservée — sans elle, la métrique du §7 ne se lit pas : un
  // rejet faute de budget est un défaut de PLATEFORME, pas une tentation d'inventer.
  //
  // ⚠️ `figuresRejected` — et non `ungrounded.length > 0` — dans TOUTE la chaîne : sur un corpus
  // océrisé les valeurs sont consultatives, et un test oublié ici rétrograderait précisément les
  // rubriques que la boucle vient d'accepter. La condition vit dans une seule variable pour que les
  // deux endroits ne puissent pas diverger.
  const figuresRejected = !figuresAdvisory && ungrounded.length > 0
  const rejected = isEvidenceRejected(verdict) || figuresRejected
  const downgradeReason: DowngradeReason | undefined = parsed.status === 'missing'
    ? undefined
    : rejected && budgetExhausted
    ? 'budget'
    : isEvidenceRejected(verdict)
    ? 'evidence'
    : figuresRejected
    ? 'figures'
    : parsed.content.length === 0
    ? 'empty_content'
    : undefined

  if (parsed.status === 'missing' || downgradeReason) {
    return {
      sectionId: parsed.section_id,
      title,
      status: 'missing',
      content: marker,
      evidence: '',
      verdict,
      ungrounded,
      attempts,
      downgraded: Boolean(downgradeReason),
      ...(downgradeReason ? { downgradeReason } : {}),
      figuresAdvisory,
    }
  }
  return {
    sectionId: parsed.section_id,
    title,
    status: parsed.status,
    content: parsed.content,
    evidence: parsed.source_evidence,
    verdict,
    ungrounded,
    attempts,
    downgraded: false,
    figuresAdvisory,
  }
}
