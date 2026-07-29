// deno test — choix du fournisseur IA. Ce module reste sans dépendance : le job de tests des
// modules partagés ne doit pas télécharger le SDK Anthropic pour vérifier un aiguillage.
import { assertEquals, assertThrows } from 'jsr:@std/assert@1'

import { assertStructuredOutputSupported, resolveProvider } from './select.ts'

Deno.test('resolveProvider : sans rien → vertex (comportement historique)', () => {
  assertEquals(resolveProvider(undefined, undefined), 'vertex')
})

Deno.test('resolveProvider : la variable d’environnement décide', () => {
  assertEquals(resolveProvider(undefined, 'anthropic'), 'anthropic')
  assertEquals(resolveProvider(undefined, 'vertex'), 'vertex')
})

Deno.test('resolveProvider : l’option d’appel prime sur l’environnement', () => {
  assertEquals(resolveProvider('vertex', 'anthropic'), 'vertex')
  assertEquals(resolveProvider('anthropic', 'vertex'), 'anthropic')
})

Deno.test('resolveProvider : casse et espaces tolérés', () => {
  assertEquals(resolveProvider(' Anthropic ', undefined), 'anthropic')
})

Deno.test('resolveProvider : valeur inconnue → vertex, jamais une panne', () => {
  // Un `AI_PROVIDER` mal renseigné doit dégrader vers le comportement d'avant, pas couper le service.
  assertEquals(resolveProvider(undefined, 'openai'), 'vertex')
  assertEquals(resolveProvider('', ''), 'vertex')
})

Deno.test('assertStructuredOutputSupported : un appel structuré ne part JAMAIS sur vertex', () => {
  // Vertex ne sait faire que du JSON libre : servir cet appel rendrait un texte non contraint là
  // où l'appelant attend un schéma respecté — une panne qui ne ressemble pas à une panne (M2).
  assertThrows(() => assertStructuredOutputSupported('vertex', true), Error, 'jsonSchema')
})

Deno.test('assertStructuredOutputSupported : les appels non structurés passent partout', () => {
  assertStructuredOutputSupported('vertex', false)
  assertStructuredOutputSupported('anthropic', false)
  assertStructuredOutputSupported('anthropic', true)
})
