// deno test — passe de rapport. Le générateur est injecté : aucun réseau, aucun SDK.
import { assertEquals, assertRejects, assertStringIncludes } from 'jsr:@std/assert@1'

import { prepareSource } from './ai/evidence.ts'
import { SectionOutputError } from './ai/section-schema.ts'
import type { AiOptions, Part } from './ai/types.ts'
import { CONFORMITY_SPECS, flattenRubrics } from './conformity-specs.ts'
import { statsLivrable } from './deliverable-markdown.ts'
import {
  buildReportPartAsk,
  buildReportPreamble,
  generateReport,
  parseReportAnalysis,
  pruneUnverifiable,
  renderReportMarkdown,
  reportInputFrom,
  REPORT_PARTS,
  reportSchema,
  type ReportAnalysis,
  type ReportPart,
  type ReportRequest,
} from './report-core.ts'

const SOURCE = [
  '1. Name of the proprietary product: KV-Kacin 500',
  '5.3 Pre-clinical Safety:',
  '7. Marketing Authorization Holder:',
  'Infections and Infestatiosn',
].join('\n')

function req(over: Partial<ReportRequest> = {}): ReportRequest {
  return {
    spec: CONFORMITY_SPECS.rcp,
    productName: 'KV-KACIN 500',
    sourceName: 'KV-Kacin_SmPC.pdf',
    sourceText: SOURCE,
    sections: [
      { sectionId: '1', title: 'DÉNOMINATION DU MÉDICAMENT', status: 'filled' },
      { sectionId: 'prescription', title: 'CONDITIONS DE PRESCRIPTION ET DE DÉLIVRANCE', status: 'missing' },
      { sectionId: '4.6-fertilite', title: 'Fertilité', status: 'missing' },
    ],
    lang: 'fr',
    sourceKind: 'text',
    reportDate: '30 juillet 2026',
    ...over,
  }
}

const ANALYSIS: ReportAnalysis = {
  relocations: [{
    content: 'Sécurité préclinique',
    source_position: '5.3 Pre-clinical Safety:',
    template_position: '5.3',
    risk: 'aurait rempli la pharmacocinétique',
  }],
  terminology: [{
    before: 'Infections and Infestatiosn',
    after: 'Infections et infestations',
    reference: 'MedDRA',
  }],
  findings: [
    { criticality: 'minor', title: 'Détail mineur.', detail: 'Sans conséquence immédiate.' },
    { criticality: 'blocking', title: 'Nom d’un autre produit.', detail: 'Résidu de copier-coller.' },
    { criticality: 'major', title: 'Excipient incohérent.', detail: 'Absent de la liste.' },
  ],
  recommendations: [
    { criticality: 'major', action: 'Résoudre l’incohérence' },
    { criticality: 'blocking', action: 'Retirer l’en-tête fautif' },
  ],
}

const out = (a: ReportAnalysis) => JSON.stringify(a)

const EMPTY: ReportAnalysis = { relocations: [], terminology: [], findings: [], recommendations: [] }

interface Seen {
  parts: Part[]
  opts: AiOptions
  /** Le tableau demandé par CET appel, lu dans la queue de l'instruction. */
  part: ReportPart
}

/** Le tableau demandé, tel que le modèle le lirait — sur la queue variable, jamais sur le préfixe. */
function askedPart(parts: Part[]): ReportPart {
  const ask = String(parts[parts.length - 1].text)
  const part = REPORT_PARTS.find((p) => ask.includes(`UNE SEULE des quatre listes : « ${p} »`))
  if (!part) throw new Error(`aucune liste demandée dans la queue : ${ask.slice(0, 120)}`)
  return part
}

/**
 * Générateur de test : rend, pour chaque appel, la SEULE liste demandée — c'est ce que fait un
 * modèle qui suit la consigne. `overrides` permet de simuler un mauvais aiguillage ou une panne.
 */
function partGenerator(
  log: Seen[],
  overrides: Partial<Record<ReportPart, (n: number) => Promise<string>>> = {},
  analysis: ReportAnalysis = ANALYSIS,
) {
  const counts = {} as Record<ReportPart, number>
  return (parts: Part[], opts: AiOptions): Promise<string> => {
    const part = askedPart(parts)
    log.push({ parts, opts, part })
    counts[part] = (counts[part] ?? 0) + 1
    const override = overrides[part]
    if (override) return override(counts[part])
    return Promise.resolve(JSON.stringify({ ...EMPTY, [part]: analysis[part] }))
  }
}

/* ───────────────────────────────── Schéma et validation ───────────────────────────────── */

Deno.test('reportSchema : la criticité est un enum — le tri en découle', () => {
  const s = reportSchema() as { properties: Record<string, { items: { properties: Record<string, { enum?: string[] }> } }> }
  assertEquals(s.properties.findings.items.properties.criticality.enum, ['blocking', 'major', 'minor'])
  assertEquals(s.properties.recommendations.items.properties.criticality.enum, ['blocking', 'major', 'minor'])
})

Deno.test('parseReportAnalysis : une criticité inconnue est refusée', () => {
  const bad = JSON.stringify({
    ...ANALYSIS,
    findings: [{ criticality: 'urgent', title: 'x', detail: 'y' }],
  })
  const e = assertThrowsSection(() => parseReportAnalysis(bad))
  assertEquals(e.reason, 'invalid_status')
})

Deno.test('parseReportAnalysis : JSON illisible et listes mal formées sont refusés', () => {
  assertEquals(assertThrowsSection(() => parseReportAnalysis('pas du json')).reason, 'invalid_json')
  assertEquals(
    assertThrowsSection(() => parseReportAnalysis(JSON.stringify({ ...ANALYSIS, terminology: 'x' }))).reason,
    'invalid_shape',
  )
  assertEquals(
    assertThrowsSection(() =>
      parseReportAnalysis(JSON.stringify({ ...ANALYSIS, relocations: [{ content: 'a' }] }))
    ).reason,
    'invalid_shape',
  )
})

function assertThrowsSection(fn: () => unknown): SectionOutputError {
  try {
    fn()
  } catch (e) {
    if (e instanceof SectionOutputError) return e
    throw e
  }
  throw new Error('aucune erreur levée')
}

/* ──────────────────────── Contrôle des affirmations factuelles ─────────────────────────── */

Deno.test('pruneUnverifiable : une citation du document ABSENTE de la source est écartée', () => {
  // Le rapport a le droit de raisonner ; il n'a pas le droit d'inventer ce que dit la source.
  const invented: ReportAnalysis = {
    ...ANALYSIS,
    relocations: [
      ...ANALYSIS.relocations,
      { content: 'x', source_position: '9. Date of Cessation', template_position: '9', risk: 'y' },
    ],
  }
  const { analysis, dropped } = pruneUnverifiable(invented, prepareSource(SOURCE))
  assertEquals(analysis.relocations.length, 1)
  assertEquals(dropped, ['9. Date of Cessation'])
})

Deno.test('pruneUnverifiable : les CONSTATS et RECOMMANDATIONS ne sont jamais écartés', () => {
  // Ce sont des analyses, pas des citations : les filtrer reviendrait à interdire l'expertise.
  const { analysis } = pruneUnverifiable(ANALYSIS, prepareSource(SOURCE))
  assertEquals(analysis.findings.length, 3)
  assertEquals(analysis.recommendations.length, 2)
})

Deno.test('pruneUnverifiable : une citation trop courte passe plutôt que de rejeter sur du bruit', () => {
  const short: ReportAnalysis = {
    ...ANALYSIS,
    terminology: [{ before: '7.', after: 'Titulaire', reference: 'gabarit' }],
  }
  const { analysis, dropped } = pruneUnverifiable(short, prepareSource(SOURCE))
  assertEquals(analysis.terminology.length, 1)
  assertEquals(dropped.length, 0)
})

/* ─────────────────────────────────── Assemblage ────────────────────────────────────────── */

Deno.test('renderReportMarkdown : l’avertissement est reproduit au mot près', () => {
  const md = renderReportMarkdown(ANALYSIS, req())
  assertStringIncludes(md, '⚠️ AVERTISSEMENT — À LIRE AVANT TOUTE UTILISATION')
  assertStringIncludes(md, "n'est pas un document réglementaire et ne doit jamais être déposé")
  assertStringIncludes(md, "n'engage pas la responsabilité du titulaire de l'AMM")
})

Deno.test('renderReportMarkdown : le décompte des lacunes vient des STATUTS, pas du modèle', () => {
  // Un rapport qui annonce 9 rubriques là où le document en marque 11 détruit la confiance.
  const md = renderReportMarkdown(ANALYSIS, req())
  assertStringIncludes(md, 'À compléter — 2')
  assertStringIncludes(md, 'CONDITIONS DE PRESCRIPTION ET DE DÉLIVRANCE')
  assertStringIncludes(md, 'Fertilité')
})

Deno.test('le §3 parle RUBRIQUES — jamais d’identifiants internes, et jamais un blanc qui n’existe pas', () => {
  // Trois défauts que ce test ferme, tous trouvés en revue de diff sur un livrable PAYÉ :
  //  ① le rapport comptait les 34 entrées du gabarit → « À compléter — 4 » pour UNE rubrique
  //    absente, sous une tuile qui en annonçait 1 ;
  //  ② il rendait `4.6-fertilite. Fertilité` — l'identifiant interne du moteur, dans un document
  //    réglementaire ;
  //  ③ un CONTENEUR `missing` produisait une lacune FANTÔME : « compléter 4. DONNÉES CLINIQUES »
  //    alors que l'assemblage saute son corps, donc que le document ne porte aucun blanc là.
  const statuts = (missing: readonly string[]) =>
    flattenRubrics(CONFORMITY_SPECS.rcp).map((r) => ({
      sectionId: r.id,
      title: r.title,
      status: (missing.includes(r.id) ? 'missing' : 'filled') as 'filled' | 'partial' | 'missing',
    }))

  // ① + ② : la rubrique 4.6 absente en entier (chapeau + ses trois morceaux) = UNE lacune, nommée.
  const sections = statuts(['4.6', '4.6-grossesse', '4.6-allaitement', '4.6-fertilite'])
  const md = renderReportMarkdown(ANALYSIS, req({ sections }))
  assertStringIncludes(md, 'À compléter — 1')
  assertStringIncludes(md, '1 rubrique au total')
  assertStringIncludes(md, '4.6. Fertilité, grossesse et allaitement (Grossesse, Allaitement, Fertilité)')
  assertEquals(/4\.[26]-/.test(md), false, 'identifiant interne exposé dans un livrable payé')

  // ③ : un conteneur seul ne produit AUCUNE lacune — le document ne laisse pas de blanc à remplir.
  const chapeau = renderReportMarkdown(ANALYSIS, req({ sections: statuts(['4']) }))
  assertStringIncludes(chapeau, 'À compléter — 0')
  assertEquals(chapeau.includes('DONNÉES CLINIQUES'), false)

  // L'invariant qui a manqué deux fois : la TUILE et le RAPPORT comptent la même chose.
  assertStringIncludes(
    md,
    `À compléter — ${statsLivrable(sections, ANALYSIS, CONFORMITY_SPECS.rcp).aCompleter}
`,
  )
})

Deno.test('renderReportMarkdown : la question « sans objet » nomme le produit', () => {
  assertStringIncludes(renderReportMarkdown(ANALYSIS, req()), 'ne concernent-elles pas KV-KACIN 500 ?')
})

Deno.test('renderReportMarkdown : constats et recommandations sont triés par criticité', () => {
  const md = renderReportMarkdown(ANALYSIS, req())
  const order = [...md.matchAll(/[🔴🟠🟡]/gu)].map((m) => m[0])
  // Bloquant, majeur, mineur — pour les constats PUIS pour les recommandations.
  assertEquals(order, ['🔴', '🟠', '🟡', '🔴', '🟠'])
})

Deno.test('renderReportMarkdown : le titre nomme le document relu, avec l’ordre de la langue', () => {
  // FR : le complément suit et porte sa contraction d'article. EN : il précède — « Regulatory
  // Review of the SmPC » serait une traduction littérale non idiomatique.
  assertStringIncludes(
    renderReportMarkdown(ANALYSIS, req()),
    '# Revue réglementaire du RCP — KV-KACIN 500',
  )
  assertStringIncludes(
    renderReportMarkdown(ANALYSIS, req({ spec: CONFORMITY_SPECS.notice })),
    '# Revue réglementaire de la notice — KV-KACIN 500',
  )
  assertStringIncludes(
    renderReportMarkdown(ANALYSIS, req({ spec: CONFORMITY_SPECS.labeling })),
    "# Revue réglementaire de l'étiquetage — KV-KACIN 500",
  )
  assertStringIncludes(
    renderReportMarkdown(ANALYSIS, req({ lang: 'en', spec: CONFORMITY_SPECS.notice })),
    '# Package Leaflet Regulatory Review — KV-KACIN 500',
  )
})

Deno.test('renderReportMarkdown : rapport ANGLAIS quand la source est anglaise', () => {
  const md = renderReportMarkdown(ANALYSIS, req({ lang: 'en', reportDate: '30 July 2026' }))
  assertStringIncludes(md, '# SmPC Regulatory Review — KV-KACIN 500')
  assertStringIncludes(md, 'WARNING — READ BEFORE ANY USE')
  assertStringIncludes(md, 'does not engage the liability of the marketing authorisation holder')
  assertStringIncludes(md, 'To be completed — 2')
  // Aucun résidu français dans un rapport anglais.
  assertEquals(md.includes('AVERTISSEMENT'), false)
  assertEquals(md.includes('À compléter'), false)
})

Deno.test('renderReportMarkdown : sans lacune, aucune question « sans objet » n’est posée', () => {
  const md = renderReportMarkdown(ANALYSIS, req({
    sections: [{ sectionId: '1', title: 'DÉNOMINATION', status: 'filled' }],
  }))
  assertStringIncludes(md, 'À compléter — 0')
  assertEquals(md.includes('sans objet'), false)
})

Deno.test('renderReportMarkdown : une analyse vide reste un rapport valable', () => {
  const empty: ReportAnalysis = { relocations: [], terminology: [], findings: [], recommendations: [] }
  const md = renderReportMarkdown(empty, req())
  assertStringIncludes(md, 'Aucun.')
  // L'avertissement et les lacunes subsistent : ils ne dépendent pas de l'analyse.
  assertStringIncludes(md, 'AVERTISSEMENT')
  assertStringIncludes(md, 'À compléter — 2')
})

/* ─────────────────────────────────── Bout en bout ──────────────────────────────────────── */

Deno.test('generateReport : QUATRE appels, un par tableau, et le rapport les réunit tous', async () => {
  const log: Seen[] = []
  const md = await generateReport(partGenerator(log), req())

  assertEquals(log.map((s) => s.part), ['terminology', 'relocations', 'findings', 'recommendations'])
  // Chaque tableau se retrouve dans le livrable : le découpage n'en perd aucun.
  assertStringIncludes(md.markdown, 'AVERTISSEMENT')
  assertStringIncludes(md.markdown, 'Infections et infestations') // terminology
  assertStringIncludes(md.markdown, 'Sécurité préclinique') // relocations
  assertStringIncludes(md.markdown, 'Nom d’un autre produit.') // findings
  assertStringIncludes(md.markdown, 'Retirer l’en-tête fautif') // recommendations
  assertEquals(md.droppedClaims, [])
  assertEquals(md.strayRows, 0)
  // La mesure par tableau est rendue : c'est elle qui justifie le découpage, ou l'infirmera.
  assertEquals(Object.keys(md.partsMs).sort(), [...REPORT_PARTS].sort())
  // Le schéma est bien transmis : la criticité ne peut pas dériver.
  assertEquals(log[0].opts.json, true)
  assertEquals(typeof log[0].opts.jsonSchema, 'object')
})

Deno.test('generateReport : le préambule ne demande PAS l’avertissement au modèle', async () => {
  const log: Seen[] = []
  await generateReport(partGenerator(log), req())
  const preamble = String(log[0].parts[0].text)
  assertEquals(preamble.includes('AVERTISSEMENT'), false)
  assertStringIncludes(preamble, 'assemblé par le programme')
  // Aucune consigne d'auto-vérification (§3.3).
  assertEquals(/double-check|vérifie avant de répondre/i.test(preamble), false)
})

Deno.test('generateReport : la posture d’expert est posée sur CHAQUE appel, dans la langue du rapport', async () => {
  // C'est la SEULE passe où la connaissance générale est un actif : sans posture, la revue perdrait
  // ce que le client achète. Le découpage multiplie les appels — un seul qui la perdrait suffirait.
  const fr: Seen[] = []
  const en: Seen[] = []
  await generateReport(partGenerator(fr), req({ lang: 'fr' }))
  await generateReport(partGenerator(en), req({ lang: 'en' }))

  assertEquals(fr.length, 4)
  assertEquals(en.length, 4)
  for (const s of fr) {
    assertStringIncludes(String(s.opts.system), 'expert senior en affaires réglementaires')
    assertStringIncludes(String(s.opts.system), 'Tu SIGNALES, tu ne complètes jamais le document')
  }
  for (const s of en) {
    assertStringIncludes(String(s.opts.system), 'senior regulatory affairs expert')
    assertStringIncludes(String(s.opts.system), 'You FLAG; you never complete the document')
  }
})

Deno.test('generateReport : une sortie inexploitable REFUSE le rapport, elle ne le vide pas', async () => {
  // Le tableau fautif est NOMMÉ — l'appelant rejoue celui-là, pas les quatre.
  const log: Seen[] = []
  const e = await assertRejects(
    () => generateReport(partGenerator(log, { findings: () => Promise.resolve('pas du json') }), req()),
    Error,
    'revue incomplète, rapport refusé',
  )
  assertStringIncludes(e.message, '« findings »')
  // La cause typée survit à l'enrobage : un JSON illisible reste déterministe, donc non re-tentable.
  assertEquals((e.cause as SectionOutputError)?.reason, 'invalid_json')
})

/* ─────────────────────────────── Source SCANNÉE (océrisée) ─────────────────────────────────── */

/** Le même document, tel qu'une reconnaissance de caractères le restitue : l → I, O → 0, S → 5. */
const OCR_SOURCE = [
  '1. Name of the proprietary product: KV-Kacin 5OO',
  '5.3 Pre-clinlcal Safety:',
  '7. Marketing Authorization Holder:',
  'Infections and Infestatiosn',
].join('\n')

Deno.test('pruneUnverifiable : sur un scan, un constat juste n’est pas écarté pour une lettre mal lue', () => {
  // Sans tolérance, la revue d'un document scanné écarterait ses PROPRES constats justes : le client
  // paierait une analyse vidée par notre outil de lecture, sans qu'aucun message le lui dise.
  const ocr = pruneUnverifiable(ANALYSIS, prepareSource(OCR_SOURCE, 'ocr'))
  assertEquals(ocr.analysis.relocations.length, 1)
  assertEquals(ocr.dropped, [])
  // Déclaré fidèle, le même corpus écarte la ligne — c'est bien la provenance qui décide.
  const strict = pruneUnverifiable(ANALYSIS, prepareSource(OCR_SOURCE, 'text'))
  assertEquals(strict.analysis.relocations.length, 0)
  assertEquals(strict.dropped, ['5.3 Pre-clinical Safety:'])
})

Deno.test('pruneUnverifiable : la tolérance OCR n’ouvre pas la porte aux affirmations inventées', () => {
  const invented: ReportAnalysis = {
    ...ANALYSIS,
    relocations: [{
      content: 'Posologie',
      source_position: '4.2 Posology and method of administration',
      template_position: '4.2',
      risk: 'aucun',
    }],
  }
  const { analysis, dropped } = pruneUnverifiable(invented, prepareSource(OCR_SOURCE, 'ocr'))
  assertEquals(analysis.relocations.length, 0)
  assertEquals(dropped.length, 1)
})

Deno.test('renderReportMarkdown : un document scanné le DIT, et dit quoi relire', () => {
  const md = renderReportMarkdown(ANALYSIS, req({
    sourceKind: 'ocr',
    sections: [
      { sectionId: '1', title: 'DÉNOMINATION DU MÉDICAMENT', status: 'filled', figuresToVerify: ['500'] },
      { sectionId: '2', title: 'COMPOSITION', status: 'filled', figuresToVerify: ['500', '35 000'] },
      { sectionId: '4.6-fertilite', title: 'Fertilité', status: 'missing' },
    ],
  }))
  assertStringIncludes(md, 'lu par reconnaissance de caractères')
  // La cause est NOMMÉE : le client verra du texte dans son lecteur et doit comprendre pourquoi.
  assertStringIncludes(md, 'reconnaissance de caractères')
  assertStringIncludes(md, 'propre reconnaissance')
  // Les valeurs à relire sont LISTÉES, dédoublonnées, jamais seulement comptées.
  assertStringIncludes(md, '`500` · `35 000`')
  assertEquals(md.split('`500`').length - 1, 1)
})

Deno.test('renderReportMarkdown : une source fidèle ne porte AUCUN encart de scan', () => {
  // Un avertissement affiché à tort userait celui qui compte, et laisserait croire à une faiblesse
  // du livrable là où il n'y en a pas.
  const md = renderReportMarkdown(ANALYSIS, req({
    sections: [{ sectionId: '1', title: 'DÉNOMINATION', status: 'filled', figuresToVerify: ['500'] }],
  }))
  assertEquals(md.includes('reconnaissance de caractères'), false)
  assertEquals(md.includes('`500`'), false)
})

Deno.test('renderReportMarkdown : l’encart de scan existe dans les DEUX langues', () => {
  const en = renderReportMarkdown(ANALYSIS, req({ lang: 'en', sourceKind: 'ocr' }))
  assertStringIncludes(en, 'read by character recognition')
  assertStringIncludes(en, 'reconstructed from the page images')
  // La cause est nommée en anglais aussi : le client voit du texte dans son lecteur.
  assertStringIncludes(en, 'its own recognition')
})

Deno.test('buildReportPreamble : sur un scan, aucun constat de FORME n’est autorisé', () => {
  // Le modèle lit l'image ; une anomalie d'orthographe viendrait de la qualité du scan, pas du
  // document du client. La lui reprocher serait un constat FAUX que rien en aval ne rattrape.
  const withScan = buildReportPreamble(req({ sourceKind: 'ocr' }))
  assertStringIncludes(withScan, 'AUCUN constat de FORME')
  assertEquals(buildReportPreamble(req()).includes('constat de FORME'), false)
})

Deno.test('buildReportPreamble : source en PIÈCE — le texte océrisé n’entre pas dans le prompt', () => {
  // Deux raisons qui vont dans le même sens : aucun jeton payé pour l'OCR, et aucune coquille de
  // lecture soumise au modèle comme si elle venait du client.
  const inst = buildReportPreamble(req({
    sourceKind: 'ocr',
    sourceText: OCR_SOURCE,
    sourceParts: [{ inlineData: { mimeType: 'application/pdf', data: 'AAAA' } }],
  }))
  assertEquals(inst.includes('Pre-clinlcal'), false)
  assertStringIncludes(inst, 'voir la pièce fournie')
})

Deno.test('generateReport : pièce, préambule, PUIS la demande — récence sur le contrat de sortie', async () => {
  const log: Seen[] = []
  await generateReport(partGenerator(log, {}, EMPTY), req({
    sourceKind: 'ocr',
    sourceParts: [{ inlineData: { mimeType: 'application/pdf', data: 'AAAA' } }],
  }))
  for (const s of log) {
    assertEquals(s.parts.length, 3)
    assertEquals('inlineData' in s.parts[0], true)
    assertStringIncludes(String(s.parts[1].text), 'assemblé par le programme')
    assertStringIncludes(String(s.parts[2].text), 'UNE SEULE des quatre listes')
  }
})

Deno.test('generateReport : une revue sur source océrisée SANS la pièce est refusée', async () => {
  // L'invariant se tient dans la fonction qui assemble les fragments. Sinon le repli enverrait le
  // texte océrisé au modèle AVEC la consigne qui lui affirme qu'il lit une image, et il reprocherait
  // au client des coquilles fabriquées par notre propre lecture.
  await assertRejects(
    () => generateReport(() => Promise.resolve(out(ANALYSIS)), req({ sourceKind: 'ocr' })),
    Error,
    'pièce d’origine (image ou PDF) est obligatoire',
  )
})

Deno.test('reportInputFrom : provenance et valeurs à relire se posent ENSEMBLE', () => {
  // Les deux faces d'une même contrepartie : sur un scan le contrôle des valeurs devient
  // consultatif, et la seule chose offerte en échange est la liste de ce qu'il faut relire.
  // Les renseigner séparément permettrait de livrer l'encart sans la liste.
  const base = { title: 'T', evidence: '', verdict: 'verified' as const, attempts: 1, downgraded: false }
  const ocr = reportInputFrom([
    { ...base, sectionId: '1', status: 'filled', content: 'x', ungrounded: ['500'], figuresAdvisory: true },
    { ...base, sectionId: '2', status: 'filled', content: 'y', ungrounded: [], figuresAdvisory: true },
  ])
  assertEquals(ocr.sourceKind, 'ocr')
  assertEquals(ocr.sections[0].figuresToVerify, ['500'])
  // Une rubrique sans valeur en cause ne porte pas de liste vide.
  assertEquals(ocr.sections[1].figuresToVerify, undefined)

  // Source fidèle : `ungrounded` y signale une rubrique DÉJÀ rétrogradée. La recopier en « à
  // vérifier » présenterait une lacune comme une simple relecture.
  const text = reportInputFrom([
    { ...base, sectionId: '1', status: 'missing', content: '', ungrounded: ['500'], figuresAdvisory: false },
  ])
  assertEquals(text.sourceKind, 'text')
  assertEquals(text.sections[0].figuresToVerify, undefined)
})

Deno.test('pruneUnverifiable : le budget CPU épuisé dégrade vers la RIGUEUR, et le dit', () => {
  // Le coût du rapprochement approché est proportionnel à la LONGUEUR de l'affirmation, et ni le
  // nombre de lignes ni leur longueur ne sont bornés par le schéma : compter des appels ne bornerait
  // donc rien. Au-delà du crédit on s'en tient au littéral — on écarte davantage. Dégrader vers la
  // permissivité laisserait passer des affirmations non vérifiées, sans que personne le voie.
  const claim = '5.3 Pre-clinlcal Safety:' // 24 caractères après normalisation
  const many: ReportAnalysis = {
    ...ANALYSIS,
    relocations: Array.from({ length: 80 }, () => ({
      content: 'x',
      // Présente à une lettre près : retenue tant que le crédit dure, écartée après.
      source_position: claim,
      template_position: '5.3',
      risk: 'y',
    })),
  }
  const { analysis, strictClaims } = pruneUnverifiable(many, prepareSource(SOURCE, 'ocr'))
  // 1 100 / (24 + 20 de part fixe) = 25 rapprochements approchés, puis 55 jugements littéraux.
  assertEquals(analysis.relocations.length, 25)
  assertEquals(strictClaims, 55)
  // La ligne de terminologie est retrouvée LITTÉRALEMENT : elle ne dépense rien et survit au budget.
  assertEquals(analysis.terminology.length, 1)
  // Sur une source fidèle, aucun budget ne s'applique : la comparaison y est littérale de bout en bout.
  assertEquals(pruneUnverifiable(many, prepareSource(SOURCE)).strictClaims, 0)
})

Deno.test('pruneUnverifiable : le crédit ne se dépense QUE pour ce qui en a besoin', () => {
  // Facturer les correspondances exactes — qui ne coûtent rien — épuiserait le crédit sur elles, et
  // la seule affirmation qui avait besoin de la tolérance serait écartée.
  const many: ReportAnalysis = {
    ...ANALYSIS,
    relocations: [
      ...Array.from({ length: 200 }, () => ({
        content: 'x',
        source_position: '5.3 Pre-clinical Safety:', // littérale
        template_position: '5.3',
        risk: 'y',
      })),
      {
        content: 'x',
        source_position: '5.3 Pre-clinlcal Safety:', // a besoin de la tolérance
        template_position: '5.3',
        risk: 'y',
      },
    ],
  }
  const { analysis, strictClaims } = pruneUnverifiable(many, prepareSource(SOURCE, 'ocr'))
  assertEquals(analysis.relocations.length, 201)
  assertEquals(strictClaims, 0)
})

Deno.test('generateReport : un budget insuffisant REFUSE de partir', async () => {
  // Le garde-fou vit dans la fonction qui LANCE, pas chez l'appelant. Sans lui, un budget épuisé
  // descend jusqu'à `boundedTimeout`, qui traite une valeur négative comme « non renseignée » et
  // repart pour le défaut : l'appel serait tué en 546 par la plateforme, payé et sans mesure.
  //
  // Le plancher couvre les TROIS étapes du découpage : `boundedMap` ne protège que la vague, le
  // préchauffage part sans regarder l'échéance. 44 s pinne cette frontière.
  let appels = 0
  const never = () => {
    appels++
    return Promise.resolve(out(ANALYSIS))
  }
  for (const budgetMs of [44_000, 19_000, 0, -5_000]) {
    await assertRejects(
      () => generateReport(never, req({ budgetMs })),
      Error,
      'un appel qui ne peut pas finir',
    )
  }
  // Le refus se prononce AVANT tout appel : rien n'est payé.
  assertEquals(appels, 0)
})

/* ──────────────────────── Le découpage en quatre appels (U0 → U4) ──────────────────────────── */

Deno.test('découpage : le SCHÉMA est identique aux quatre appels, à l’octet', async () => {
  // ⚠️ LE test de ce lot. Le schéma entre dans le préfixe mis en cache — prouvé à deux jetons près
  // en `a520ec7`, où un `enum` portant « 4 » contre « 4.1 » déplaçait `cacheWrite` de 16 461 à
  // 16 463. Un schéma taillé par tableau produirait quatre préfixes distincts : quatre écritures à
  // 1,25× et zéro relecture, donc PLUS CHER que pas de cache du tout. La sortie resterait juste ;
  // seule la facture changerait — aucun autre test ne le verrait.
  const log: Seen[] = []
  await generateReport(partGenerator(log), req())
  const schemas = log.map((s) => JSON.stringify(s.opts.jsonSchema))
  assertEquals(new Set(schemas).size, 1)
  // Et c'est bien le schéma ENTIER : les quatre listes y restent exigées.
  assertEquals(
    Object.keys((log[0].opts.jsonSchema as { properties: Record<string, unknown> }).properties).sort(),
    [...REPORT_PARTS].sort(),
  )
})

Deno.test('découpage : le PRÉFIXE est identique aux quatre appels, et la rupture le désigne', async () => {
  // Le corollaire du schéma : si le préambule variait d'un appel à l'autre — une consigne propre à
  // un tableau qui s'y glisse — le cache ne prendrait pas davantage.
  const log: Seen[] = []
  await generateReport(partGenerator(log), req())
  const prefixes = log.map((s) => JSON.stringify(s.parts.slice(0, -1)))
  assertEquals(new Set(prefixes).size, 1)
  for (const s of log) {
    // La rupture désigne le DERNIER fragment du préfixe, jamais le dernier fragment tout court :
    // marquer celui-là mettrait la partie variable en cache et ferait payer l'écriture à chaque fois.
    assertEquals(s.opts.cacheBreakpointAfter, s.parts.length - 2)
  }
})

Deno.test('découpage : `terminology` PRÉCHAUFFE seul, les deux suivants relisent', async () => {
  // Sans préchauffage, trois appels démarrent avant que le préfixe ne soit écrit et le paient tous
  // les trois. Et c'est le tableau le plus COURT qui s'en charge : faire préchauffer `findings`
  // coûterait le double en latence pour exactement le même cache.
  const log: Seen[] = []
  let running = 0
  let maxParallel = 0
  const during: Record<string, number> = {}
  await generateReport((parts, opts) => {
    const part = askedPart(parts)
    log.push({ parts, opts, part })
    running++
    maxParallel = Math.max(maxParallel, running)
    during[part] = running
    return new Promise((resolve) =>
      setTimeout(() => {
        running--
        resolve(JSON.stringify({ ...EMPTY, [part]: ANALYSIS[part] }))
      }, 1)
    )
  }, req())

  assertEquals(log[0].part, 'terminology')
  assertEquals(during.terminology, 1) // seul en vol
  assertEquals(maxParallel, 2) // relocations ‖ findings
  assertEquals(during.recommendations, 1) // la dernière étape est séquentielle, elle attend les constats
})

Deno.test('découpage : les recommandations VOIENT les constats, sans casser le préfixe', async () => {
  // La seule dépendance entre les quatre. Elle voyage dans la queue variable — donc APRÈS le point
  // de rupture : le préfixe partagé reste intact (vérifié par le test de préfixe ci-dessus).
  const log: Seen[] = []
  await generateReport(partGenerator(log), req())
  // Sans pièce jointe le préfixe n'a qu'un fragment : la demande est TOUJOURS la dernière.
  const ask = String(log[3].parts[log[3].parts.length - 1].text)
  assertStringIncludes(ask, 'Constats DÉJÀ établis')
  assertStringIncludes(ask, 'Nom d’un autre produit.')
  assertStringIncludes(ask, 'sans les reformuler')
  // Les trois autres n'en portent rien : ce serait des jetons frais payés pour rien.
  for (const i of [0, 1, 2]) {
    assertEquals(String(log[i].parts[log[i].parts.length - 1].text).includes('Constats DÉJÀ'), false)
  }
})

Deno.test('découpage : une liste vide AVEC des lignes ailleurs est rejouée, puis refusée', async () => {
  // Élargir le schéma pour partager le cache rend ATTEIGNABLE un cas jusque-là impossible : ranger
  // sa réponse sous une autre liste. Un rejeu le corrige ; l'accepter écrirait « Aucun. » dans un
  // rapport payé, là où le modèle avait bel et bien trouvé quelque chose.
  const misrouted = () => Promise.resolve(JSON.stringify({ ...EMPTY, terminology: ANALYSIS.terminology }))

  // Une fois : rejoué, puis correct — le rapport aboutit et compte les lignes égarées.
  const okLog: Seen[] = []
  const ok = await generateReport(
    partGenerator(okLog, {
      findings: (n) => (n === 1 ? misrouted() : Promise.resolve(JSON.stringify({ ...EMPTY, findings: ANALYSIS.findings }))),
    }),
    req(),
  )
  assertEquals(okLog.filter((s) => s.part === 'findings').length, 2)
  assertEquals(ok.strayRows, 1)
  assertStringIncludes(ok.markdown, 'Nom d’un autre produit.')

  // Deux fois : refusé. Rien n'est rangé sous une liste qu'il ne concerne pas.
  const koLog: Seen[] = []
  const e = await assertRejects(
    () => generateReport(partGenerator(koLog, { findings: misrouted }), req()),
    Error,
    'revue incomplète, rapport refusé',
  )
  assertStringIncludes(e.message, '« findings »')
  assertEquals((e.cause as SectionOutputError)?.reason, 'misrouted')
  assertEquals(koLog.filter((s) => s.part === 'findings').length, 2)
})

Deno.test('découpage : une liste LÉGITIMEMENT vide ne déclenche aucun rejeu', async () => {
  // « Rien à signaler » est un résultat, pas une panne : le distinguer du mauvais aiguillage tient
  // au fait qu'AUCUNE autre liste n'a été remplie. Sans cette nuance, tout rapport propre paierait
  // quatre appels de plus.
  const log: Seen[] = []
  const md = await generateReport(partGenerator(log, {}, EMPTY), req())
  assertEquals(log.length, 4)
  assertEquals(md.strayRows, 0)
  assertStringIncludes(md.markdown, 'Aucun.')
  // L'avertissement et les lacunes subsistent : ils ne dépendent pas de l'analyse.
  assertStringIncludes(md.markdown, 'AVERTISSEMENT')
  assertStringIncludes(md.markdown, 'À compléter — 2')
})

Deno.test('buildReportPartAsk : chaque demande NOMME les trois listes à laisser vides', () => {
  for (const part of REPORT_PARTS) {
    const ask = buildReportPartAsk(part)
    assertStringIncludes(ask, `UNE SEULE des quatre listes : « ${part} »`)
    // La conséquence est dite : c'est ce qui rend la consigne tenable sans schéma restreint.
    assertStringIncludes(ask, 'est écartée')
    for (const other of REPORT_PARTS.filter((p) => p !== part)) {
      assertStringIncludes(ask, `« ${other} »`)
    }
  }
  // La criticité ne part qu'aux deux listes qui en portent une.
  assertStringIncludes(buildReportPartAsk('findings'), '« blocking » empêche le dépôt')
  assertStringIncludes(buildReportPartAsk('recommendations'), '« blocking » empêche le dépôt')
  assertEquals(buildReportPartAsk('terminology').includes('blocking'), false)
  assertEquals(buildReportPartAsk('relocations').includes('blocking'), false)
})

Deno.test('buildReportPartAsk : une relocation vers un AUTRE module du dossier se journalise', () => {
  // Doctrine §2/6.1 (arbitrage CEO 2026-08-14) : le tableau de formulation par volume nominal
  // sort du RCP vers le module 3.2.P.1 — la revue doit journaliser ce déplacement, pas le taire.
  const ask = buildReportPartAsk('relocations')
  assertStringIncludes(ask, 'AUTRE module du dossier CTD')
  assertStringIncludes(ask, 'module 3.2.P.1')
  // Formulation AGNOSTIQUE du type de document : la même consigne part aux revues de notice et
  // d'étiquetage — elle ne doit nommer ni « RCP » ni une rubrique qui n'existe que chez lui.
  assertStringIncludes(ask, 'jamais de l\'information produit')
})
