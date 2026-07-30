// Passe de TRADUCTION par rubrique (étape 2 du processus d'upgrade) — module PUR : le générateur
// est injecté, donc ce cœur se teste sans réseau, sans SDK et sans Supabase.
//
// Elle vient APRÈS la passe de conformité et n'a pas la même garantie à tenir. La conformité
// répond à « d'où vient cette information ? » et le prouve par `source_evidence`. La traduction
// répond à « est-ce la même information ? » — la source à comparer n'est plus le document du
// client mais le contenu que NOUS avons déjà validé. La chaîne de garantie est donc :
//
//   document du client  ──[citation vérifiée]──▶  contenu FR  ──[valeurs ancrées]──▶  contenu EN
//
// Trois règles structurantes (PROCESS-UPGRADE-ETAPE-2) :
//  1. **Le statut se RECOPIE, jamais ne se recalcule.** Une rubrique absente dans la langue source
//     ne peut pas devenir renseignée dans la langue cible. Corollaire économique : une rubrique
//     marquée ne déclenche AUCUN appel — le marqueur cible est rendu en code.
//  2. **Aucune valeur chiffrée ne doit changer.** Un dosage altéré à la traduction est un défaut
//     produit bien plus grave qu'une phrase maladroite : il se contrôle donc, il ne s'espère pas.
//  3. **Le gabarit ne change pas** : `section_id` reste verrouillé par `enum`.
import { ungroundedFigures, prepareSource } from './ai/evidence.ts'
import { translationSystem } from './ai/personas.ts'
import { SectionOutputError } from './ai/section-schema.ts'
import type { SectionStatus } from './ai/section-schema.ts'
import type { AiOptions, Part, Provider } from './ai/types.ts'
import { MISSING_MARKER, MISSING_MARKER_EN, type OutputLang } from './upgrade-section-core.ts'

/** Une traduction + un rejeu. Au-delà, on garde la langue source et on le DIT. */
export const MAX_TRANSLATE_ATTEMPTS = 2

/** Budget d'une rubrique traduite, rejeu compris — la traduction est plus courte que la génération. */
export const TRANSLATE_BUDGET_MS = 60_000
export const TRANSLATE_ATTEMPT_TIMEOUT_MS = 45_000
const MIN_REPLAY_BUDGET_MS = 15_000
const TRANSLATE_MAX_OUTPUT_TOKENS = 4_000

const MARKER_BY_LANG: Record<OutputLang, string> = { fr: MISSING_MARKER, en: MISSING_MARKER_EN }

const LANGUAGE_LABEL: Record<OutputLang, string> = { fr: 'FRANÇAIS', en: 'ANGLAIS' }

export type SectionGenerator = (parts: Part[], opts: AiOptions) => Promise<string>

export interface TranslateRequest {
  /** Identifiant de la rubrique — verrouillé par `enum`, le modèle ne peut pas répondre à côté. */
  sectionId: string
  /** Titre officiel de la rubrique dans la langue CIBLE, repris du gabarit — jamais traduit ici. */
  title: string
  /** Statut établi par la passe de conformité. RECOPIÉ tel quel dans la sortie. */
  status: SectionStatus
  /** Contenu validé dans la langue source. C'est LUI qui sert de référence, pas le document client. */
  content: string
  /** Langue du contenu produit. */
  targetLang: OutputLang
  /**
   * Consigne système. Laissée optionnelle pour les tests, mais en production elle vient TOUJOURS de
   * `personas.translationSystem(targetLang)` : sans elle, le modèle traduit sans savoir qu'il lui
   * est interdit d'« améliorer » le texte — le risque propre à cette passe.
   */
  system?: string
  provider?: Provider
  budgetMs?: number
  now?: () => number
}

export interface TranslateOutcome {
  sectionId: string
  title: string
  /** Recopié depuis la requête — la traduction ne juge pas de la complétude. */
  status: SectionStatus
  content: string
  attempts: number
  /**
   * `false` quand la traduction a été refusée et le contenu SOURCE conservé. Un livrable dont une
   * rubrique reste dans la langue d'origine est visiblement incomplet ; un livrable dont un dosage
   * a changé est faux. On préfère toujours le premier.
   */
  translated: boolean
  /** Valeurs chiffrées que la traduction avait altérées ou inventées — vide quand tout est ancré. */
  driftedFigures: string[]
}

/** Schéma de sortie : ni `status` ni `source_evidence`. Les demander inviterait à les recalculer. */
export function translateSchema(sectionId: string): Record<string, unknown> {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['section_id', 'content'],
    properties: {
      section_id: { type: 'string', enum: [sectionId] },
      content: { type: 'string' },
    },
  }
}

/** Valide la sortie. Défense en profondeur : le décodage contraint appartient au fournisseur. */
export function parseTranslation(raw: string, sectionId: string): string {
  const t = raw.trim()
  const body = t.startsWith('```')
    ? t.replace(/^```[a-zA-Z]*\s*/, '').replace(/```\s*$/, '').trim()
    : t
  let parsed: unknown
  try {
    parsed = JSON.parse(body)
  } catch {
    throw new SectionOutputError('invalid_json', 'traduction : JSON illisible')
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new SectionOutputError('invalid_shape', 'traduction : objet attendu')
  }
  const o = parsed as Record<string, unknown>
  if (o.section_id !== sectionId) {
    throw new SectionOutputError(
      'unknown_section',
      `traduction : rubrique « ${String(o.section_id).slice(0, 40) } » au lieu de « ${sectionId} »`,
    )
  }
  if (typeof o.content !== 'string') {
    throw new SectionOutputError('invalid_shape', 'traduction : champ « content » absent ou non textuel')
  }
  return o.content.trim()
}

/**
 * Instruction de traduction d'UNE rubrique.
 *
 * Aucune consigne d'auto-vérification (§3.3) : le contrôle des valeurs est programmatique.
 * Le titre officiel n'est PAS soumis au modèle — il vient du gabarit dans la langue cible, ce qui
 * élimine par construction toute traduction libre des intitulés de rubrique.
 */
export function buildTranslateInstruction(req: TranslateRequest, drifted?: string[]): string {
  const lines = [
    `Traduis en ${LANGUAGE_LABEL[req.targetLang]} le texte de la rubrique « ${req.sectionId}. ` +
      `${req.title} » d'un résumé des caractéristiques du produit.`,
    '',
    'Contrat de sortie :',
    `- « section_id » : exactement « ${req.sectionId} ».`,
    '- « content » : la traduction du texte fourni, et rien d\'autre. Pas de titre de rubrique, ' +
      'pas de commentaire, pas de note de traduction.',
    '',
    'Règles :',
    '- Emploie la formule OFFICIELLE de la langue cible quand elle existe (référentiels MedDRA, ' +
      'EDQM, formules consacrées des résumés des caractéristiques du produit). La traduction ' +
      'littérale d\'une formule réglementaire produit un texte compréhensible et non conforme.',
    '- Les valeurs chiffrées sont INCHANGÉES : dosages, concentrations, durées, fréquences, ' +
      'numéros. Seule la convention typographique s\'adapte (séparateur de milliers, décimale).',
    '- Ne traduis pas les dénominations commerciales, les DCI, les raisons sociales, les adresses ' +
      'ni les noms d\'organismes : un destinataire de pharmacovigilance traduit n\'existe pas.',
    '- N\'ajoute rien et n\'enlève rien. Le texte cible dit exactement ce que dit le texte source.',
  ]
  if (drifted?.length) {
    lines.push(
      '',
      'TENTATIVE PRÉCÉDENTE REJETÉE — les valeurs ci-dessous ne figuraient pas dans le texte ' +
        'source, ou en différaient :',
      `Valeurs fautives : ${drifted.map((f) => `"${f}"`).join(', ')}`,
      'Recommence en reprenant EXACTEMENT les valeurs du texte source.',
    )
  }
  lines.push('', 'TEXTE SOURCE :', req.content)
  return lines.join('\n')
}

function attemptOptions(req: TranslateRequest, timeoutMs: number): AiOptions {
  return {
    system: req.system ?? translationSystem(req.targetLang),
    // La posture du terminologue et le termbase sont IDENTIQUES pour toutes les rubriques d'un
    // document, alors que leur texte diffère : c'est la consigne système qu'il faut mettre en cache
    // ici, pas le contenu. Un point de rupture sur l'unique fragment ferait entrer le texte variable
    // dans le cache et chaque appel paierait l'écriture.
    cacheSystem: true,
    json: true,
    jsonSchema: translateSchema(req.sectionId),
    maxOutputTokens: TRANSLATE_MAX_OUTPUT_TOKENS,
    timeoutMs,
    provider: req.provider,
  }
}

/**
 * Traduit une rubrique, et ne rend la traduction que si aucune valeur chiffrée n'a bougé.
 *
 * Une rubrique dont le statut est `missing` ne part JAMAIS au modèle : son contenu est le marqueur,
 * rendu ici dans la langue cible. Sur un RCP réel, cela retire environ un tiers des appels.
 */
export async function translateSection(
  generate: SectionGenerator,
  req: TranslateRequest,
): Promise<TranslateOutcome> {
  const base = {
    sectionId: req.sectionId,
    title: req.title,
    status: req.status,
  }

  // Statut recopié : une lacune ne se traduit pas, elle se ré-affiche. Aucun appel, aucun coût.
  if (req.status === 'missing') {
    return {
      ...base,
      content: MARKER_BY_LANG[req.targetLang],
      attempts: 0,
      translated: true,
      driftedFigures: [],
    }
  }

  const now = req.now ?? Date.now
  const deadline = now() + (req.budgetMs ?? TRANSLATE_BUDGET_MS)
  // La référence de la traduction est le contenu VALIDÉ, pas le document du client.
  //
  // ⚠️ Volontairement `'text'`, même quand le document d'origine était un SCAN : les deux côtés de
  // cette comparaison sont produits par le moteur, donc fidèles au caractère près. Une tolérance
  // OCR n'aurait ici aucune justification et laisserait passer une dérive de dosage entre le FR et
  // l'EN — le seul défaut que cette passe existe pour empêcher. La provenance du document source se
  // traite en amont (passe 1) et se DIT en aval (encart de la revue), jamais ici.
  const reference = prepareSource(req.content)

  let translation = ''
  let drifted: string[] = []
  let attempts = 0

  for (let i = 0; i < MAX_TRANSLATE_ATTEMPTS; i++) {
    const remaining = deadline - now()
    if (i > 0 && remaining < MIN_REPLAY_BUDGET_MS) break
    const timeoutMs = Math.min(TRANSLATE_ATTEMPT_TIMEOUT_MS, Math.max(remaining, 1_000))

    attempts++
    let raw: string
    try {
      raw = await generate(
        [{ text: buildTranslateInstruction(req, i > 0 ? drifted : undefined) }],
        attemptOptions(req, timeoutMs),
      )
    } catch (e) {
      // Une panne AU REJEU ne doit pas effacer le premier essai : on garde la langue source et on
      // le signale, plutôt que de faire échouer tout le livrable pour une rubrique.
      if (i === 0) throw e
      break
    }
    translation = parseTranslation(raw, req.sectionId)
    drifted = ungroundedFigures(translation, reference)
    if (drifted.length === 0) {
      return { ...base, content: translation, attempts, translated: true, driftedFigures: [] }
    }
  }

  // Traduction refusée : le contenu source est conservé. Visiblement incomplet, jamais faux.
  return { ...base, content: req.content, attempts, translated: false, driftedFigures: drifted }
}

/**
 * Contrôle de recette de la passe : la parité doit être MÉCANIQUE (§ étape 2).
 * Un écart signale une rubrique inventée ou perdue à la traduction.
 */
export function parityReport(
  source: readonly { status: SectionStatus }[],
  target: readonly { status: SectionStatus }[],
): { ok: boolean; sections: [number, number]; missing: [number, number] } {
  const missing = (xs: readonly { status: SectionStatus }[]) =>
    xs.filter((x) => x.status === 'missing').length
  const sections: [number, number] = [source.length, target.length]
  const marks: [number, number] = [missing(source), missing(target)]
  return { ok: sections[0] === sections[1] && marks[0] === marks[1], sections, missing: marks }
}
