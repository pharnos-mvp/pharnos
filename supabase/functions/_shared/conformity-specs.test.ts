// deno test — specs de conformité : invariants structurels (la PR U1 fait foi de la
// transcription des templates ; ces tests verrouillent la cohérence interne).
import { assert, assertEquals } from 'jsr:@std/assert@1'

import {
  CONFORMITY_SPECS,
  flattenRubrics,
  specForDocType,
  specPromptText,
} from './conformity-specs.ts'

Deno.test('les 5 specs existent et portent une référence de template', () => {
  const types = Object.keys(CONFORMITY_SPECS).sort()
  assertEquals(types, ['cover', 'labeling', 'notice', 'pght', 'rcp'])
  for (const spec of Object.values(CONFORMITY_SPECS)) {
    assert(spec.reference.length > 10, `${spec.docType} : référence manquante`)
    assert(spec.rules.length >= 3, `${spec.docType} : règles globales manquantes`)
    assert(spec.rubrics.length >= 5, `${spec.docType} : rubriques manquantes`)
  }
})

Deno.test('RCP : rubriques 1 à 10 présentes, ordonnées, + conditions de prescription', () => {
  const top = CONFORMITY_SPECS.rcp.rubrics.map((r) => r.id)
  assertEquals(top, ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'prescription'])
  const all = flattenRubrics(CONFORMITY_SPECS.rcp).map((r) => r.id)
  for (const id of ['4.1', '4.2', '4.8', '4.9', '5.1', '5.3', '6.1', '6.6']) {
    assert(all.includes(id), `RCP : rubrique ${id} absente`)
  }
})

Deno.test('RCP 4.8 : pharmacovigilance ABMed obligatoire pour le Bénin uniquement', () => {
  const r48 = flattenRubrics(CONFORMITY_SPECS.rcp).find((r) => r.id === '4.8')
  const abmed = r48?.mentions?.find((m) => m.text.includes('vigilances.abmed@gouv.bj'))
  assertEquals(abmed?.requiredFor, ['BJ'])
  // Rendu prompt : présent pour BJ, absent pour CI.
  assert(specPromptText(CONFORMITY_SPECS.rcp, 'BJ').includes('vigilances.abmed@gouv.bj'))
  assert(!specPromptText(CONFORMITY_SPECS.rcp, 'CI').includes('vigilances.abmed@gouv.bj'))
})

Deno.test('Notice : sections 1 à 6 + encadré + table des matières', () => {
  const ids = CONFORMITY_SPECS.notice.rubrics.map((r) => r.id)
  for (const id of ['entete', 'encadre', 'tdm', '1', '2', '3', '4', '5', '6']) {
    assert(ids.includes(id), `Notice : rubrique ${id} absente`)
  }
})

Deno.test('PGHT : objet exact et tableau 4 colonnes en FCFA', () => {
  const prompt = specPromptText(CONFORMITY_SPECS.pght)
  assert(prompt.includes('Attestation de PGHT'))
  assert(prompt.includes('PGHT (FCFA)'))
  assert(prompt.includes('Nom commercial | DCI et dosage | Forme et présentation'))
})

Deno.test('Cover : les 5 informations produit sont toutes obligatoires', () => {
  const produit = CONFORMITY_SPECS.cover.rubrics.find((r) => r.id === 'produit')
  assertEquals(produit?.children?.length, 5)
  assert(produit!.children!.every((c) => c.required))
})

Deno.test('ids uniques dans chaque spec (constats traçables)', () => {
  for (const spec of Object.values(CONFORMITY_SPECS)) {
    const ids = flattenRubrics(spec).map((r) => r.id)
    assertEquals(new Set(ids).size, ids.length, `${spec.docType} : ids dupliqués`)
  }
})

Deno.test('mapping docType Pharnos → spec (artwork → labeling, inconnu → null)', () => {
  assertEquals(specForDocType('rcp')?.docType, 'rcp')
  assertEquals(specForDocType('artwork')?.docType, 'labeling')
  assertEquals(specForDocType('labeling')?.docType, 'labeling')
  assertEquals(specForDocType('gmp'), null)
  assertEquals(specForDocType(''), null)
})

Deno.test('specPromptText : obligatoires marqués, optionnelles distinguées', () => {
  const prompt = specPromptText(CONFORMITY_SPECS.labeling)
  assert(prompt.includes('[OBLIGATOIRE]'))
  assert(prompt.includes('[optionnelle]'))
  assert(prompt.includes('FAB/EXP'))
})
