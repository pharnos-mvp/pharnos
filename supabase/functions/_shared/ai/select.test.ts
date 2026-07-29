// deno test — choix du fournisseur IA. Ce module reste sans dépendance : le job de tests des
// modules partagés ne doit pas télécharger le SDK Anthropic pour vérifier un aiguillage.
import { assertEquals } from 'jsr:@std/assert@1'

import { resolveProvider } from './select.ts'

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
