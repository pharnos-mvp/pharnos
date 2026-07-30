// deno test — passe de rapport. Le générateur est injecté : aucun réseau, aucun SDK.
import { assertEquals, assertRejects, assertStringIncludes } from 'jsr:@std/assert@1'

import { prepareSource } from './ai/evidence.ts'
import { SectionOutputError } from './ai/section-schema.ts'
import { CONFORMITY_SPECS } from './conformity-specs.ts'
import {
  generateReport,
  parseReportAnalysis,
  pruneUnverifiable,
  renderReportMarkdown,
  reportSchema,
  type ReportAnalysis,
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

Deno.test('generateReport : appel unique, sortie contrainte, assemblage déterministe', async () => {
  const calls: unknown[] = []
  const md = await generateReport((parts, opts) => {
    calls.push({ parts, opts })
    return Promise.resolve(out(ANALYSIS))
  }, req())

  assertEquals(calls.length, 1)
  assertStringIncludes(md.markdown, 'AVERTISSEMENT')
  assertStringIncludes(md.markdown, 'Infections et infestations')
  assertEquals(md.droppedClaims, [])
  // Le schéma est bien transmis : la criticité ne peut pas dériver.
  const opts = (calls[0] as { opts: { jsonSchema?: unknown; json?: boolean } }).opts
  assertEquals(opts.json, true)
  assertEquals(typeof opts.jsonSchema, 'object')
})

Deno.test('generateReport : l’instruction ne demande PAS l’avertissement au modèle', async () => {
  let instruction = ''
  await generateReport((parts) => {
    instruction = String((parts[0] as { text: string }).text)
    return Promise.resolve(out(ANALYSIS))
  }, req())
  assertEquals(instruction.includes('AVERTISSEMENT'), false)
  assertStringIncludes(instruction, 'assemblé par le programme')
  // Aucune consigne d'auto-vérification (§3.3).
  assertEquals(/double-check|vérifie avant de répondre/i.test(instruction), false)
})

Deno.test('generateReport : une sortie inexploitable remonte, elle ne produit pas un rapport vide', async () => {
  await assertRejects(
    () => generateReport(() => Promise.resolve('pas du json'), req()),
    SectionOutputError,
  )
})
