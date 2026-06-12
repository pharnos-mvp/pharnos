// deno test — glossaire pharma et construction du prompt de traduction professionnelle.
import { assert, assertEquals } from 'jsr:@std/assert@1'

import {
  buildTranslateSystem,
  DOSAGE_FORM_FR,
  FREQUENCY_FR,
  MEDDRA_SOC_FR,
  ROUTE_FR,
} from './pharma-glossary.ts'

Deno.test('les 27 SOC MedDRA sont présentes (EN → FR officiel)', () => {
  assertEquals(Object.keys(MEDDRA_SOC_FR).length, 27)
  assertEquals(MEDDRA_SOC_FR['Nervous system disorders'], 'Affections du système nerveux')
  assertEquals(MEDDRA_SOC_FR['Gastrointestinal disorders'], 'Affections gastro-intestinales')
  assertEquals(
    MEDDRA_SOC_FR['General disorders and administration site conditions'],
    "Troubles généraux et anomalies au site d'administration",
  )
})

Deno.test('les 6 catégories de fréquence portent leurs bornes officielles', () => {
  assertEquals(Object.keys(FREQUENCY_FR).length, 6)
  assert(FREQUENCY_FR['very common'].includes('≥ 1/10'))
  assert(FREQUENCY_FR['uncommon'].includes('≥ 1/1 000, < 1/100'))
  assert(FREQUENCY_FR['not known'].includes('fréquence indéterminée'))
})

Deno.test('formes et voies EDQM usuelles (gélule ≠ capsule molle, IV…)', () => {
  assertEquals(DOSAGE_FORM_FR['capsule, hard'], 'gélule')
  assertEquals(DOSAGE_FORM_FR['capsule, soft'], 'capsule molle')
  assertEquals(DOSAGE_FORM_FR['solution for injection'], 'solution injectable')
  assertEquals(ROUTE_FR['intravenous use'], 'voie intraveineuse')
})

Deno.test('cible FR + docType rcp → terminologie verrouillée + titres officiels du template', () => {
  const sys = buildTranslateSystem('rcp', 'fr', 'français')
  assert(sys.includes('TERMINOLOGIE VERROUILLÉE'))
  assert(sys.includes('Affections du système nerveux'))
  assert(sys.includes('très fréquent (≥ 1/10)'))
  assert(sys.includes('TITRES DE RUBRIQUES OFFICIELS'))
  assert(sys.includes("Posologie et mode d'administration"))
  assert(sys.includes('Ne traduis JAMAIS les noms commerciaux'))
})

Deno.test('cible FR + docType hors templates (gmp) → glossaire sans bloc titres', () => {
  const sys = buildTranslateSystem('gmp', 'fr', 'français')
  assert(sys.includes('TERMINOLOGIE VERROUILLÉE'))
  assert(!sys.includes('TITRES DE RUBRIQUES OFFICIELS'))
})

Deno.test('cible non-FR → règles cœur seulement (pas de glossaire FR)', () => {
  const sys = buildTranslateSystem('rcp', 'en', 'anglais')
  assert(sys.includes('Ne traduis JAMAIS les noms commerciaux'))
  assert(!sys.includes('TERMINOLOGIE VERROUILLÉE'))
})
