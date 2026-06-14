// deno test — whitelist CORS des Edge Functions : prod, previews Pages, dev local. Rien d'autre.
import { assertEquals } from 'jsr:@std/assert@1'

import { corsHeaders, isAllowedOrigin } from './cors.ts'

Deno.test('autorise app.pharnos.com, prod/previews Cloudflare Pages et localhost', () => {
  assertEquals(isAllowedOrigin('https://app.pharnos.com'), true)
  assertEquals(isAllowedOrigin('https://pharnos.pages.dev'), true)
  assertEquals(isAllowedOrigin('https://v2.pharnos.pages.dev'), true)
  assertEquals(isAllowedOrigin('https://abc123de.pharnos.pages.dev'), true)
  assertEquals(isAllowedOrigin('http://localhost:5173'), true)
  assertEquals(isAllowedOrigin('http://localhost:4173'), true)
})

Deno.test('refuse les origines hostiles (y compris suffixes trompeurs)', () => {
  assertEquals(isAllowedOrigin('https://evil.com'), false)
  assertEquals(isAllowedOrigin('https://pharnos.pages.dev.evil.com'), false)
  assertEquals(isAllowedOrigin('https://notpharnos.pages.dev'), false)
  assertEquals(isAllowedOrigin('http://pharnos.pages.dev'), false) // http interdit hors localhost
  assertEquals(isAllowedOrigin('https://localhost:5173'), false) // https localhost non servi
  assertEquals(isAllowedOrigin('https://a.b.pharnos.pages.dev'), false) // 1 seul niveau de sous-domaine
  assertEquals(isAllowedOrigin('https://pharnos.com'), false) // apex = landing statique, hors whitelist
  assertEquals(isAllowedOrigin('https://app.pharnos.com.evil.com'), false) // suffixe trompeur
  assertEquals(isAllowedOrigin('http://app.pharnos.com'), false) // http interdit
})

Deno.test('sans Origin (curl/server-to-server) : pas un contexte CORS → laissé passer', () => {
  assertEquals(isAllowedOrigin(null), true)
  // …mais aucun Access-Control-Allow-Origin n'est émis.
  assertEquals('Access-Control-Allow-Origin' in corsHeaders(null), false)
})

Deno.test('écho exact de l’origine autorisée (jamais *) + Vary: Origin', () => {
  const h = corsHeaders('https://v2.pharnos.pages.dev')
  assertEquals(h['Access-Control-Allow-Origin'], 'https://v2.pharnos.pages.dev')
  assertEquals(h['Vary'], 'Origin')
})
