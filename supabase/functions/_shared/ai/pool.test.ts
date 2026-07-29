// deno test — parallélisme borné. Module pur : aucune dépendance, aucun réseau.
import { assertEquals } from 'jsr:@std/assert@1'

import { boundedMap, isComplete, values } from './pool.ts'

/** Attente réelle, courte : le but est de vérifier le CHEVAUCHEMENT, pas la précision du minuteur. */
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

Deno.test('boundedMap : l’ordre des résultats suit les items, pas les achèvements', async () => {
  // Le premier item est le plus lent : sans remise en ordre, il finirait dernier.
  const report = await boundedMap([30, 5, 5, 5], async (ms, i) => {
    await sleep(ms)
    return i
  }, { concurrency: 4 })
  assertEquals(values(report), [0, 1, 2, 3])
})

Deno.test('boundedMap : la borne de simultanéité est RESPECTÉE', async () => {
  let live = 0
  let peak = 0
  await boundedMap(Array.from({ length: 20 }, (_, i) => i), async () => {
    live++
    peak = Math.max(peak, live)
    await sleep(5)
    live--
  }, { concurrency: 3 })
  assertEquals(peak <= 3, true)
  assertEquals(peak, 3)
})

Deno.test('boundedMap : le parallélisme raccourcit réellement le lot', async () => {
  const items = Array.from({ length: 12 }, () => 20)
  const seq = await boundedMap(items, (ms) => sleep(ms), { concurrency: 1 })
  const par = await boundedMap(items, (ms) => sleep(ms), { concurrency: 6 })
  // 12 items de 20 ms : ~240 ms en série, ~40 ms à six. On vérifie l'ordre de grandeur, pas la ms.
  assertEquals(par.ms < seq.ms / 2, true)
})

Deno.test('boundedMap : un item qui échoue ne fait PAS tomber le lot', async () => {
  // Un `Promise.all` perdrait 58 appels payés pour une rubrique en panne.
  const report = await boundedMap([1, 2, 3, 4], (n) => {
    if (n === 2) return Promise.reject(new Error('rubrique 2 en panne'))
    return Promise.resolve(n * 10)
  }, { concurrency: 2 })
  assertEquals(report.ok, 3)
  assertEquals(report.failed, 1)
  assertEquals(values(report), [10, 30, 40])
  assertEquals(report.outcomes[1].error?.message, 'rubrique 2 en panne')
  assertEquals(isComplete(report), false)
})

Deno.test('boundedMap : une valeur rejetée non-Error devient une Error exploitable', async () => {
  const report = await boundedMap([1], () => Promise.reject('panne textuelle'), {})
  assertEquals(report.outcomes[0].error instanceof Error, true)
  assertEquals(report.outcomes[0].error?.message, 'panne textuelle')
})

Deno.test('boundedMap : sous échéance, les items restants sont ABANDONNÉS, pas tués en vol', async () => {
  // Lancer un appel qui ne peut pas finir, c'est payer pour un 546. On l'abandonne avant.
  let t = 1_000
  const now = () => t
  const report = await boundedMap([1, 2, 3, 4, 5], () => {
    t += 40 // chaque item consomme 40 ms d'horloge simulée
    return Promise.resolve('ok')
  }, { concurrency: 1, now, deadline: 1_100, minSliceMs: 30 })

  assertEquals(report.ok, 2)
  assertEquals(report.skipped, 3)
  assertEquals(isComplete(report), false)
  // Les abandons ne consomment rien.
  assertEquals(report.outcomes.filter((o) => o.skipped).every((o) => o.ms === 0), true)
})

Deno.test('boundedMap : la durée du plus long item est rendue — c’est elle qui vise le mur', async () => {
  let t = 0
  const durations = [10, 250, 30]
  const report = await boundedMap(durations, (d) => {
    t += d
    return Promise.resolve(d)
  }, { concurrency: 1, now: () => t })
  assertEquals(report.slowestMs, 250)
})

Deno.test('boundedMap : un lot vide est complet et instantané', async () => {
  const report = await boundedMap([], () => Promise.resolve(1), { concurrency: 6 })
  assertEquals(report.outcomes.length, 0)
  assertEquals(isComplete(report), true)
})

Deno.test('boundedMap : la progression est notifiée item par item', async () => {
  const seen: number[] = []
  await boundedMap([3, 1, 2], async (ms, i) => {
    await sleep(ms)
    return i
  }, { concurrency: 3, onSettled: (o) => seen.push(o.index) })
  assertEquals(seen.length, 3)
  // Notifié à l'ACHÈVEMENT : le plus rapide arrive en premier, l'ordre diffère des items.
  assertEquals([...seen].sort(), [0, 1, 2])
})
