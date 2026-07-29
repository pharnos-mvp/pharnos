// deno test — détection du repli serveur. Module pur : ce test ne télécharge pas le SDK.
import { assertEquals } from 'jsr:@std/assert@1'

import { servedByFallback } from './fallback.ts'

Deno.test('servedByFallback : appel normal (une seule tentative) → false', () => {
  assertEquals(servedByFallback([{ type: 'message' }]), false)
})

Deno.test('servedByFallback : le modèle de repli a servi → true', () => {
  assertEquals(servedByFallback([{ type: 'message' }, { type: 'fallback_message' }]), true)
})

Deno.test('servedByFallback : tour « collant » sans bloc fallback → true quand même', () => {
  // Le routage persistant ne pose AUCUN bloc `fallback` dans le contenu : seul `usage.iterations`
  // révèle que le repli a servi. C'est précisément le cas que la lecture des blocs raterait.
  assertEquals(servedByFallback([{ type: 'fallback_message' }]), true)
})

Deno.test('servedByFallback : champ absent, nul ou mal formé → false, jamais une exception', () => {
  assertEquals(servedByFallback(undefined), false)
  assertEquals(servedByFallback(null), false)
  assertEquals(servedByFallback([]), false)
  assertEquals(servedByFallback([{}]), false)
})
