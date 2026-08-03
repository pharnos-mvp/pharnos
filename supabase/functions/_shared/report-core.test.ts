// deno test — passe de rapport. Le générateur est injecté : aucun réseau, aucun SDK.
import { assertEquals, assertRejects, assertStringIncludes } from 'jsr:@std/assert@1'

import { prepareSource } from './ai/evidence.ts'
import { SectionOutputError } from './ai/section-schema.ts'
import { CONFORMITY_SPECS } from './conformity-specs.ts'
import {
  buildReportInstruction,
  generateReport,
  parseReportAnalysis,
  pruneUnverifiable,
  renderReportMarkdown,
  reportInputFrom,
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

Deno.test('generateReport : la posture d’expert est posée, dans la langue du rapport', async () => {
  // C'est la SEULE passe où la connaissance générale est un actif : sans posture, la revue perdrait
  // ce que le client achète. Le repli ne doit pas pouvoir disparaître en silence.
  const seen: string[] = []
  const run = (lang: 'fr' | 'en') =>
    generateReport((_p, opts) => {
      seen.push(String(opts.system))
      return Promise.resolve(out(ANALYSIS))
    }, req({ lang }))

  await run('fr')
  await run('en')
  assertStringIncludes(seen[0], 'expert senior en affaires réglementaires')
  assertStringIncludes(seen[0], 'Tu SIGNALES, tu ne complètes jamais le document')
  assertStringIncludes(seen[1], 'senior regulatory affairs expert')
  assertStringIncludes(seen[1], 'You FLAG; you never complete the document')
})

Deno.test('generateReport : une sortie inexploitable remonte, elle ne produit pas un rapport vide', async () => {
  await assertRejects(
    () => generateReport(() => Promise.resolve('pas du json'), req()),
    SectionOutputError,
  )
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

Deno.test('buildReportInstruction : sur un scan, aucun constat de FORME n’est autorisé', () => {
  // Le modèle lit l'image ; une anomalie d'orthographe viendrait de la qualité du scan, pas du
  // document du client. La lui reprocher serait un constat FAUX que rien en aval ne rattrape.
  const withScan = buildReportInstruction(req({ sourceKind: 'ocr' }))
  assertStringIncludes(withScan, 'AUCUN constat de FORME')
  assertEquals(buildReportInstruction(req()).includes('constat de FORME'), false)
})

Deno.test('buildReportInstruction : source en PIÈCE — le texte océrisé n’entre pas dans le prompt', () => {
  // Deux raisons qui vont dans le même sens : aucun jeton payé pour l'OCR, et aucune coquille de
  // lecture soumise au modèle comme si elle venait du client.
  const inst = buildReportInstruction(req({
    sourceKind: 'ocr',
    sourceText: OCR_SOURCE,
    sourceParts: [{ inlineData: { mimeType: 'application/pdf', data: 'AAAA' } }],
  }))
  assertEquals(inst.includes('Pre-clinlcal'), false)
  assertStringIncludes(inst, 'voir la pièce fournie')
})

Deno.test('generateReport : la pièce précède l’instruction (préfixe cachable, récence sur le contrat)', async () => {
  let seen: unknown[] = []
  const empty = JSON.stringify({ relocations: [], terminology: [], findings: [], recommendations: [] })
  await generateReport((parts) => {
    seen = parts
    return Promise.resolve(empty)
  }, req({
    sourceKind: 'ocr',
    sourceParts: [{ inlineData: { mimeType: 'application/pdf', data: 'AAAA' } }],
  }))
  assertEquals(seen.length, 2)
  assertEquals('inlineData' in (seen[0] as Record<string, unknown>), true)
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
  let appels = 0
  const never = () => {
    appels++
    return Promise.resolve(out(ANALYSIS))
  }
  for (const budgetMs of [19_000, 0, -5_000]) {
    await assertRejects(
      () => generateReport(never, req({ budgetMs })),
      Error,
      'un appel qui ne peut pas finir',
    )
  }
  // Le refus se prononce AVANT tout appel : rien n'est payé.
  assertEquals(appels, 0)
})
