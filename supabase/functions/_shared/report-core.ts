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
// Et un contrôle qui reste applicable malgré la liberté d'analyse : **toute affirmation FACTUELLE
// sur le document du client est vérifiable**. « Votre rubrique 7 s'intitule Fabricant » se contrôle
// — la chaîne doit figurer dans la source. Ce qui ne se retrouve pas est écarté.
import { normalizeForEvidence, prepareSource, type PreparedSource } from './ai/evidence.ts'
import { SectionOutputError } from './ai/section-schema.ts'
import type { AiOptions, Part, Provider } from './ai/types.ts'
import { DOC_SHORT, type ConformityDocType, type ConformitySpec } from './conformity-specs.ts'
import type { OutputLang } from './upgrade-section-core.ts'

export const REPORT_BUDGET_MS = 100_000
const REPORT_ATTEMPT_TIMEOUT_MS = 90_000
const REPORT_MAX_OUTPUT_TOKENS = 8_000

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

/** Une rubrique telle que la passe de conformité l'a laissée — l'entrée factuelle du rapport. */
export interface ReportSection {
  sectionId: string
  title: string
  status: 'filled' | 'partial' | 'missing'
}

export interface ReportRequest {
  spec: ConformitySpec
  /** Nom commercial, pour personnaliser la question « sans objet ». */
  productName: string
  /** Nom du fichier source, cité en tête de rapport. */
  sourceName: string
  /** Texte source — sert aussi à vérifier les affirmations factuelles de l'analyse. */
  sourceText: string
  sections: readonly ReportSection[]
  /** Langue du rapport : celle du document téléversé (§ étape 1). */
  lang: OutputLang
  /** Date du rapport, injectée — jamais lue depuis l'horloge du modèle. */
  reportDate: string
  system?: string
  provider?: Provider
  budgetMs?: number
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
} {
  const dropped: string[] = []
  const present = (s: string) => {
    const n = normalizeForEvidence(s)
    // Trop court pour être une affirmation vérifiable : on laisse passer plutôt que de rejeter
    // sur du bruit (« 7 », « 5.2 » se retrouvent partout de toute façon).
    if (n.length < 4) return true
    if (source.normalized.includes(n) || source.deHyphenated.includes(n.replace(/-/g, ''))) return true
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
  }
}

/* ─────────────────────────────────────── Instruction ─────────────────────────────────────── */

export function buildReportInstruction(req: ReportRequest): string {
  const { spec, sections, lang } = req
  const missing = sections.filter((s) => s.status === 'missing')
  const langLabel = lang === 'fr' ? 'FRANÇAIS' : 'ANGLAIS'
  return [
    `Tu rédiges l'ANALYSE d'un rapport d'upgrade réglementaire, en ${langLabel}.`,
    `Document : ${req.sourceName} · Gabarit : ${spec.label} — ${spec.reference}.`,
    '',
    'Le rapport lui-même est assemblé par le programme : avertissement, liste des rubriques à ' +
      'compléter et décomptes sont déjà écrits. Tu ne produis QUE les quatre listes ci-dessous.',
    '',
    '- « relocations » : les contenus dont la POSITION change entre le document source et le ' +
      'gabarit. `source_position` doit citer l\'intitulé tel qu\'il apparaît DANS le document ' +
      '(il est vérifié automatiquement ; un intitulé absent fait écarter la ligne). `risk` dit ce ' +
      'qu\'une recopie en place aurait produit, concrètement.',
    '- « terminology » : les libellés remplacés par leur forme officielle. `before` doit citer le ' +
      'libellé tel qu\'il apparaît dans le document (également vérifié).',
    '- « findings » : les constats qui demandent une décision de l\'expert. C\'est ici, et ' +
      'seulement ici, que ta connaissance réglementaire et pharmaceutique générale est utile — ' +
      'incohérences internes, éléments hors périmètre, résidus d\'un autre dossier, classements ' +
      'erronés. Un constat sans conséquence pratique n\'a pas sa place.',
    '- « recommendations » : les actions, une par ligne, formulées à l\'impératif.',
    '',
    'Criticité : « blocking » empêche le dépôt · « major » provoquera une question de l\'autorité · ' +
      '« minor » est une amélioration.',
    '',
    'Ton : celui d\'un confrère expérimenté qui travaille AVEC le client. Nomme son produit. ' +
      'Explique le risque, jamais le reproche. N\'écris pas « non conforme ».',
    '',
    `Rubriques restées à compléter (${missing.length}) : ${missing.map((s) => s.sectionId).join(', ') || '—'}`,
    '',
    'DOCUMENT SOURCE :',
    req.sourceText,
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
}

/** Produit le rapport : un seul appel, analyse contrainte, assemblage déterministe. */
export async function generateReport(
  generate: (parts: Part[], opts: AiOptions) => Promise<string>,
  req: ReportRequest,
): Promise<ReportOutcome> {
  const raw = await generate([{ text: buildReportInstruction(req) }], {
    system: req.system,
    json: true,
    jsonSchema: reportSchema(),
    maxOutputTokens: REPORT_MAX_OUTPUT_TOKENS,
    timeoutMs: Math.min(REPORT_ATTEMPT_TIMEOUT_MS, req.budgetMs ?? REPORT_BUDGET_MS),
    provider: req.provider,
  })
  const { analysis, dropped } = pruneUnverifiable(parseReportAnalysis(raw), prepareSource(req.sourceText))
  return { markdown: renderReportMarkdown(analysis, req), analysis, droppedClaims: dropped }
}
