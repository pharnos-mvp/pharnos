// deno test — politique de retry des Edge Functions : transitoires only, bornée, breaker.
import { assertEquals, assertRejects } from 'jsr:@std/assert@1'

import { CircuitBreaker, HttpError, withRetry } from './retry.ts'

Deno.test('withRetry : succès direct → 1 seul appel', async () => {
  let calls = 0
  const out = await withRetry(() => {
    calls++
    return Promise.resolve('ok')
  })
  assertEquals(out, 'ok')
  assertEquals(calls, 1)
})

Deno.test('withRetry : 429 transitoire → re-tente puis réussit', async () => {
  let calls = 0
  const out = await withRetry(
    () => {
      calls++
      if (calls < 2) throw new HttpError(429, 'rate limited')
      return Promise.resolve('ok')
    },
    { baseMs: 1 },
  )
  assertEquals(out, 'ok')
  assertEquals(calls, 2)
})

Deno.test('withRetry : 400 déterministe → AUCUN retry', async () => {
  let calls = 0
  await assertRejects(
    () =>
      withRetry(
        () => {
          calls++
          throw new HttpError(400, 'bad request')
        },
        { baseMs: 1 },
      ),
    HttpError,
  )
  assertEquals(calls, 1)
})

Deno.test('withRetry : 503 persistant → borné au nombre de tentatives', async () => {
  let calls = 0
  await assertRejects(
    () =>
      withRetry(
        () => {
          calls++
          throw new HttpError(503, 'down')
        },
        { attempts: 3, baseMs: 1 },
      ),
    HttpError,
  )
  assertEquals(calls, 3)
})

Deno.test('withRetry : erreur réseau (TypeError) → transitoire', async () => {
  let calls = 0
  const out = await withRetry(
    () => {
      calls++
      if (calls < 2) throw new TypeError('fetch failed')
      return Promise.resolve('ok')
    },
    { baseMs: 1 },
  )
  assertEquals(out, 'ok')
  assertEquals(calls, 2)
})

Deno.test('CircuitBreaker : s’ouvre après le seuil, échec immédiat ensuite', async () => {
  const breaker = new CircuitBreaker(2, 60_000)
  const boom = () => breaker.run(() => Promise.reject(new HttpError(500, 'down')))
  await assertRejects(boom, HttpError, 'down')
  await assertRejects(boom, HttpError, 'down')
  // Circuit ouvert : le travail n'est plus exécuté.
  let executed = false
  await assertRejects(
    () =>
      breaker.run(() => {
        executed = true
        return Promise.resolve('ok')
      }),
    HttpError,
    'Circuit ouvert',
  )
  assertEquals(executed, false)
})

Deno.test('CircuitBreaker : un succès referme le compteur', async () => {
  const breaker = new CircuitBreaker(2, 60_000)
  await assertRejects(() => breaker.run(() => Promise.reject(new HttpError(500, 'down'))))
  const out = await breaker.run(() => Promise.resolve('ok'))
  assertEquals(out, 'ok')
  // Après le succès, il faut de nouveau 2 échecs pour ouvrir.
  await assertRejects(() => breaker.run(() => Promise.reject(new HttpError(500, 'down'))))
  const out2 = await breaker.run(() => Promise.resolve('ok'))
  assertEquals(out2, 'ok')
})
