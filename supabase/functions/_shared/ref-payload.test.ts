// deno test — contrat d'efficacité des payloads du référentiel, côté SERVEUR.
//
// La même table de fixtures est assertée côté web par `ref-payload-parity.test.ts` contre le
// résolveur réel : si l'une des deux implémentations dérive, un des deux tests casse. C'est le
// verrou qui remplace le partage de code impossible entre Deno (Edge) et Vite (bundle web).
import { assert, assertEquals } from 'jsr:@std/assert@1'

import {
  isRefSection,
  isUsefulNumber,
  isUsefulT,
  refPayloadEffective,
  REF_SECTIONS,
  type RefPayloadFixture,
} from './ref-payload.ts'
// Import JSON natif (attribut de type) : aucune permission `--allow-read` requise, donc la
// commande CI `deno test supabase/functions/_shared/` reste inchangée et sans droit de lecture.
import fixturesJson from './ref-payload-fixtures.json' with { type: 'json' }

const fixtures = fixturesJson as RefPayloadFixture[]

Deno.test('la table de fixtures couvre les 4 sections rendues, dans les deux sens', () => {
  assert(fixtures.length >= 20, 'table de fixtures anémique')
  for (const section of REF_SECTIONS) {
    const forSection = fixtures.filter((f) => f.section === section)
    assert(
      forSection.some((f) => f.effective),
      `aucune fixture EFFECTIVE pour ${section}`,
    )
    assert(
      forSection.some((f) => !f.effective),
      `aucune fixture INEFFECTIVE pour ${section}`,
    )
  }
})

for (const f of fixtures) {
  Deno.test(`refPayloadEffective — ${f.case}`, () => {
    assertEquals(refPayloadEffective(f.section, f.payload), f.effective)
  })
}

Deno.test('isUsefulT exige fr ET en non vides (une paire blanche n’est pas du contenu)', () => {
  assertEquals(isUsefulT({ fr: 'a', en: 'b' }), true)
  assertEquals(isUsefulT({ fr: 'a', en: '' }), false)
  assertEquals(isUsefulT({ fr: ' ', en: ' ' }), false)
  assertEquals(isUsefulT({ fr: 'a' }), false)
  assertEquals(isUsefulT('a'), false)
  assertEquals(isUsefulT(null), false)
  assertEquals(isUsefulT([{ fr: 'a', en: 'b' }]), false)
})

Deno.test('isUsefulNumber : fini et ≥ 0 (un négatif est une coquille)', () => {
  assertEquals(isUsefulNumber(0), true)
  assertEquals(isUsefulNumber(1500000), true)
  assertEquals(isUsefulNumber(-1), false)
  assertEquals(isUsefulNumber(Number.NaN), false)
  assertEquals(isUsefulNumber(Number.POSITIVE_INFINITY), false)
  assertEquals(isUsefulNumber('1000'), false)
  assertEquals(isUsefulNumber(null), false)
})

Deno.test('isRefSection : liste blanche stricte (une section que rien ne rend reste exclue)', () => {
  assertEquals(isRefSection('agency'), true)
  assertEquals(isRefSection('samples'), true)
  // `ctd_structure` est RENDUE depuis P4.5 (`resolvedModule1Tree` applique ses deltas) — elle
  // rejoint donc la liste blanche. Le critère d'entrée reste le même : un consommateur réel.
  assertEquals(isRefSection('ctd_structure'), true)
  assertEquals(isRefSection('agency.directeur'), false) // chemin d'override, pas une section
  assertEquals(isRefSection('AGENCY'), false)
  assertEquals(isRefSection(''), false)
  assertEquals(isRefSection(undefined), false)
})
