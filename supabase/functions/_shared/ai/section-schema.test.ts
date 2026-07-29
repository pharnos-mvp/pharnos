// deno test — schéma de rubrique (M2). Module pur : aucun SDK, aucun réseau.
import { assertEquals, assertThrows } from 'jsr:@std/assert@1'

import { CONFORMITY_SPECS } from '../conformity-specs.ts'
import {
  findRubric,
  parseSectionResult,
  SectionOutputError,
  sectionIds,
  sectionSchema,
} from './section-schema.ts'

const RCP = CONFORMITY_SPECS.rcp

Deno.test('sectionIds : les rubriques ENFANTS sont incluses (une rubrique = un appel)', () => {
  const ids = sectionIds(RCP)
  // Sans les enfants, 4.2-posologie ou 4.6-grossesse seraient inatteignables par le worker.
  assertEquals(ids.includes('4.2-posologie'), true)
  assertEquals(ids.includes('4.6-allaitement'), true)
  assertEquals(ids.includes('1'), true)
  assertEquals(ids.includes('prescription'), true)
})

Deno.test('sectionSchema : forme stricte et énumération réduite à la rubrique demandée', () => {
  const schema = sectionSchema(['4.1']) as Record<string, unknown>
  assertEquals(schema.additionalProperties, false)
  assertEquals(schema.required, ['section_id', 'status', 'content', 'source_evidence'])
  const props = schema.properties as Record<string, { enum?: string[] }>
  assertEquals(props.section_id.enum, ['4.1'])
  assertEquals(props.status.enum, ['filled', 'partial', 'missing'])
})

Deno.test('sectionSchema : une énumération vide est une erreur, pas un schéma permissif', () => {
  // Un `enum: []` laisserait le modèle libre d'inventer un identifiant : le garde-fou saute.
  assertThrows(() => sectionSchema([]), SectionOutputError)
})

Deno.test('findRubric : retrouve une rubrique imbriquée avec son titre officiel', () => {
  assertEquals(findRubric(RCP, '4.6-grossesse')?.title, 'Grossesse')
  assertEquals(findRubric(RCP, '99.9'), null)
})

Deno.test('parseSectionResult : sortie nominale', () => {
  const out = parseSectionResult(
    JSON.stringify({
      section_id: '4.1',
      status: 'filled',
      content: '  Traitement de X.  ',
      source_evidence: 'Indications : traitement de X.',
    }),
    ['4.1'],
  )
  assertEquals(out.section_id, '4.1')
  assertEquals(out.status, 'filled')
  assertEquals(out.content, 'Traitement de X.')
})

Deno.test('parseSectionResult : un encadrement ```json d’un modèle de repli est réparé', () => {
  const raw = '```json\n{"section_id":"1","status":"filled","content":"X 500 mg","source_evidence":"X 500 mg comprimé"}\n```'
  assertEquals(parseSectionResult(raw, ['1']).content, 'X 500 mg')
})

Deno.test('parseSectionResult : une rubrique HORS de la demande est refusée', () => {
  // Ranger une réponse sur 4.2 sous l'identifiant 4.1 produirait un document faux.
  const raw = JSON.stringify({
    section_id: '4.2',
    status: 'filled',
    content: 'x',
    source_evidence: 'y',
  })
  const e = assertThrows(() => parseSectionResult(raw, ['4.1']), SectionOutputError)
  assertEquals((e as SectionOutputError).reason, 'unknown_section')
})

Deno.test('parseSectionResult : JSON illisible, forme et statut inconnus sont tous refusés', () => {
  assertEquals(
    (assertThrows(() => parseSectionResult('pas du json', ['1']), SectionOutputError) as SectionOutputError).reason,
    'invalid_json',
  )
  assertEquals(
    (assertThrows(() => parseSectionResult('[]', ['1']), SectionOutputError) as SectionOutputError).reason,
    'invalid_shape',
  )
  assertEquals(
    (assertThrows(
      () => parseSectionResult(JSON.stringify({ section_id: '1', status: 'ok', content: 'a', source_evidence: 'b' }), ['1']),
      SectionOutputError,
    ) as SectionOutputError).reason,
    'invalid_status',
  )
  assertEquals(
    (assertThrows(
      () => parseSectionResult(JSON.stringify({ section_id: '1', status: 'filled', content: 'a' }), ['1']),
      SectionOutputError,
    ) as SectionOutputError).reason,
    'invalid_shape',
  )
})
