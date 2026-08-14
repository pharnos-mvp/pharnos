// deno test — passe de traduction. Le générateur est injecté : aucun réseau, aucun SDK.
import { assertEquals, assertRejects, assertStringIncludes } from 'jsr:@std/assert@1'

import { SectionOutputError } from './ai/section-schema.ts'
import type { AiOptions, Part } from './ai/types.ts'
import { MISSING_MARKER } from './upgrade-section-core.ts'
import {
  buildTranslateInstruction,
  parityReport,
  translateSchema,
  translateSection,
  type TranslateRequest,
} from './translate-section-core.ts'

function scripted(outputs: (string | Error)[]) {
  const calls: { parts: Part[]; opts: AiOptions }[] = []
  const generate = (parts: Part[], opts: AiOptions) => {
    calls.push({ parts, opts })
    const next = outputs[calls.length - 1]
    if (next === undefined) throw new Error(`appel n°${calls.length} non prévu par le test`)
    if (next instanceof Error) return Promise.reject(next)
    return Promise.resolve(next)
  }
  return { generate, calls }
}

const out = (content: string, sectionId = '6.3') => JSON.stringify({ section_id: sectionId, content })

function req(over: Partial<TranslateRequest> = {}): TranslateRequest {
  return {
    sectionId: '6.3',
    title: 'Shelf life',
    status: 'filled',
    content: '36 mois.',
    targetLang: 'en',
    system: 'consigne système',
    ...over,
  }
}

Deno.test('translateSection : traduction nominale, statut recopié', async () => {
  const s = scripted([out('36 months.')])
  const r = await translateSection(s.generate, req())
  assertEquals(r.content, '36 months.')
  assertEquals(r.status, 'filled')
  assertEquals(r.translated, true)
  assertEquals(r.attempts, 1)
  // Le titre vient du GABARIT dans la langue cible : il n'est jamais soumis au modèle.
  assertEquals(r.title, 'Shelf life')
})

Deno.test('translateSection : une rubrique MARQUÉE ne coûte AUCUN appel', async () => {
  // Le statut se recopie, jamais ne se recalcule : le marqueur cible est rendu en code. Sur un RCP
  // réel cela retire environ un tiers des appels de la passe.
  const s = scripted([])
  const en = await translateSection(s.generate, req({ status: 'missing', content: MISSING_MARKER }))
  assertEquals(s.calls.length, 0)
  assertEquals(en.attempts, 0)
  assertEquals(en.content, '[Not provided, to be completed]')
  assertEquals(en.status, 'missing')

  const fr = await translateSection(s.generate, req({ status: 'missing', targetLang: 'fr' }))
  assertEquals(fr.content, MISSING_MARKER)
  assertEquals(s.calls.length, 0)
})

Deno.test('translateSection : le schéma ne demande NI statut NI citation', () => {
  // Les demander inviterait le modèle à les recalculer — or la complétude a déjà été établie.
  const schema = translateSchema('4.1') as { required: string[]; properties: Record<string, unknown> }
  assertEquals(schema.required, ['section_id', 'content'])
  assertEquals(Object.keys(schema.properties).sort(), ['content', 'section_id'])
})

Deno.test('translateSection : un dosage altéré est rejeté, puis rejoué', async () => {
  const s = scripted([out('Shelf life: 26 months.'), out('Shelf life: 36 months.')])
  const r = await translateSection(s.generate, req())
  assertEquals(r.attempts, 2)
  assertEquals(r.translated, true)
  assertEquals(r.content, 'Shelf life: 36 months.')
  // Le rejeu NOMME la valeur fautive — une correction utile, pas un « recommence ».
  assertStringIncludes(String(s.calls[1].parts[0].text), '"26"')
})

Deno.test('translateSection : dosage toujours faux après rejeu → la langue SOURCE est conservée', async () => {
  // Un livrable dont une rubrique reste dans la langue d'origine est visiblement incomplet ; un
  // livrable dont un dosage a changé est FAUX. On préfère toujours le premier.
  const bad = out('Shelf life: 26 months.')
  const s = scripted([bad, bad])
  const r = await translateSection(s.generate, req())
  assertEquals(r.attempts, 2)
  assertEquals(r.translated, false)
  assertEquals(r.content, '36 mois.')
  assertEquals(r.driftedFigures, ['26'])
  // Le statut reste celui de la passe de conformité : la traduction ne juge pas de la complétude.
  assertEquals(r.status, 'filled')
})

Deno.test('translateSection : les conventions de milliers ne comptent pas pour une dérive', async () => {
  // « 35 000 » en français et « 35,000 » en anglais sont la MÊME valeur. Sans la canonisation,
  // chaque rubrique de composition serait rejetée à la traduction.
  const s = scripted([out('Each vial contains 35,000 IU and 1,500 mg.')])
  const r = await translateSection(s.generate, req({
    content: 'Chaque flacon contient 35 000 UI et 1 500 mg.',
  }))
  assertEquals(r.driftedFigures, [])
  assertEquals(r.translated, true)
})

Deno.test('translateSection : une sortie inexploitable est une panne, pas une dérive', async () => {
  const s = scripted(['pas du json'])
  await assertRejects(() => translateSection(s.generate, req()), SectionOutputError)
  assertEquals(s.calls.length, 1)
})

Deno.test('translateSection : une rubrique autre que celle demandée est refusée', async () => {
  const s = scripted([out('36 months.', '6.4')])
  const e = await assertRejects(() => translateSection(s.generate, req()), SectionOutputError)
  assertEquals((e as SectionOutputError).reason, 'unknown_section')
})

Deno.test('translateSection : une panne AU REJEU garde la langue source au lieu de tout perdre', async () => {
  const s = scripted([out('Shelf life: 26 months.'), new Error('Anthropic 529: overloaded')])
  const r = await translateSection(s.generate, req())
  assertEquals(s.calls.length, 2)
  assertEquals(r.translated, false)
  assertEquals(r.content, '36 mois.')
})

Deno.test('translateSection : pas de rejeu quand le budget restant ne le permet pas', async () => {
  const s = scripted([out('Shelf life: 26 months.')])
  let t = 1_000_000
  const r = await translateSection(s.generate, req({
    budgetMs: 20_000,
    now: () => { const v = t; t += 18_000; return v },
  }))
  assertEquals(r.attempts, 1)
  assertEquals(r.translated, false)
})

Deno.test('buildTranslateInstruction : le titre n’est pas soumis à la traduction', () => {
  const i = buildTranslateInstruction(req())
  assertStringIncludes(i, 'en ANGLAIS')
  assertStringIncludes(i, 'Pas de titre de rubrique')
  assertStringIncludes(i, 'TEXTE SOURCE :')
  // Aucune consigne d'auto-vérification (§3.3) : le contrôle est programmatique.
  assertEquals(/vérifie|double-check|relis/i.test(i), false)
})

Deno.test('translateSection : la posture de terminologue est posée MÊME sans système fourni', async () => {
  // Sans elle, le modèle traduit sans savoir qu'il lui est interdit d'« améliorer » le texte — le
  // risque propre à cette passe. Ce repli ne doit pas pouvoir disparaître en silence.
  const s = scripted([out('36 months.')])
  await translateSection(s.generate, { ...req(), system: undefined })
  const sys = String(s.calls[0].opts.system)
  assertStringIncludes(sys, 'terminologue réglementaire')
  assertStringIncludes(sys, 'Tu n’AMÉLIORES pas')
})

Deno.test('translateSection : c’est la CONSIGNE qui est mise en cache, pas le contenu', async () => {
  // Chaque rubrique porte un texte différent : un point de rupture sur l'unique fragment ferait
  // entrer le variable dans le cache et chaque appel paierait l'écriture. La posture et le termbase,
  // eux, sont identiques d'une rubrique à l'autre.
  const s = scripted([out('36 months.')])
  await translateSection(s.generate, req())
  assertEquals(s.calls[0].opts.cacheSystem, true)
  assertEquals(s.calls[0].opts.cacheBreakpointAfter, undefined)
})

Deno.test('parityReport : la parité est MÉCANIQUE, pas déclarative', () => {
  const src = [{ status: 'filled' as const }, { status: 'missing' as const }, { status: 'partial' as const }]
  assertEquals(parityReport(src, src).ok, true)
  // Une rubrique perdue à la traduction.
  assertEquals(parityReport(src, src.slice(1)).ok, false)
  // Une lacune « comblée » par la traduction — exactement ce que l'invariant interdit.
  const filledIn = [{ status: 'filled' as const }, { status: 'filled' as const }, { status: 'partial' as const }]
  const r = parityReport(src, filledIn)
  assertEquals(r.ok, false)
  assertEquals(r.missing, [1, 0])
})

Deno.test('instruction : la traduction CONSERVE les tableaux — mêmes colonnes, mêmes lignes', () => {
  // Le risque propre de cette passe est l'« amélioration » : re-rédiger un tableau en paragraphes
  // perdrait la structure MedDRA que le gabarit attend (constaté sur la 4.8, KV-RL 2026-08-14).
  const instruction = buildTranslateInstruction({
    sectionId: '4.8',
    title: 'Effets indésirables',
    status: 'filled',
    content: '| Classe | Réaction |\n|---|---|\n| Immunitaire | Hypersensibilité |',
    targetLang: 'en',
    system: 'x',
  })
  assertStringIncludes(instruction, 'reste un tableau')
  assertStringIncludes(instruction, 'seuls les libellés se traduisent')
})
