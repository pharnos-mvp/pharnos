// deno test — bornage des timeouts sortants sous le mur de wall clock de la plateforme Edge.
// Un garde-fou supérieur au mur ne peut jamais se déclencher (546 plateforme au lieu d'un 502).
import { assert, assertEquals } from 'jsr:@std/assert@1'

import { boundedTimeout, EDGE_WALL_CLOCK_MS, MAX_CALL_TIMEOUT_MS } from './vertex.ts'

Deno.test('le plafond d’appel reste SOUS le mur plateforme (marge pour Storage + réponse)', () => {
  assert(MAX_CALL_TIMEOUT_MS < EDGE_WALL_CLOCK_MS)
  assert(EDGE_WALL_CLOCK_MS - MAX_CALL_TIMEOUT_MS >= 30_000)
})

Deno.test('boundedTimeout : valeur demandée sous le plafond → conservée', () => {
  assertEquals(boundedTimeout(90_000, 60_000), 90_000)
})

Deno.test('boundedTimeout : valeur au-dessus du plafond → écrêtée (garde-fou mort impossible)', () => {
  assertEquals(boundedTimeout(180_000, 60_000), MAX_CALL_TIMEOUT_MS)
})

Deno.test('boundedTimeout : sans valeur → défaut du mode, lui aussi borné', () => {
  assertEquals(boundedTimeout(undefined, 60_000), 60_000)
  assertEquals(boundedTimeout(undefined, 300_000), MAX_CALL_TIMEOUT_MS)
})

Deno.test('boundedTimeout : valeur absurde (0, négative, NaN) → repli sur le défaut', () => {
  assertEquals(boundedTimeout(0, 60_000), 60_000)
  assertEquals(boundedTimeout(-1, 60_000), 60_000)
  assertEquals(boundedTimeout(Number.NaN, 60_000), 60_000)
})
