import { assertEquals } from 'jsr:@std/assert@1'

import { addUsage, emptyUsage, runWithUsage, withUsage } from './usage.ts'

Deno.test('emptyUsage : les quatre compteurs partent de zéro', () => {
  assertEquals(emptyUsage(), { in: 0, out: 0, cacheRead: 0, cacheWrite: 0 })
})

Deno.test('addUsage : la ventilation du cache remonte jusqu’à l’appelant', async () => {
  const { usage } = await withUsage(async () => {
    addUsage(1000, 200, 800, 150)
    addUsage(500, 100, 400, 0)
  })
  assertEquals(usage, { in: 1500, out: 300, cacheRead: 1200, cacheWrite: 150 })
})

Deno.test('addUsage : un fournisseur sans cache de préfixe laisse un zéro honnête', async () => {
  // Le chemin Vertex appelle `addUsage(in, out)` à deux arguments. Les compteurs de cache doivent
  // rester à zéro sans exiger que l’appelant les connaisse — sinon toute nouvelle mesure obligerait
  // à retoucher chaque fournisseur.
  const { usage } = await withUsage(async () => {
    addUsage(900, 120)
  })
  assertEquals(usage, { in: 900, out: 120, cacheRead: 0, cacheWrite: 0 })
})

Deno.test('`in` CONTIENT déjà le cache — les additionner compterait deux fois', async () => {
  // L’invariant qui protège le calcul de coût. `in` est le total facturé ; `cacheRead` et
  // `cacheWrite` en sont une ventilation. Un jour où quelqu’un écrira `in + cacheRead`, la facture
  // annoncée dépassera la facture réelle et le prix de vente sera calculé sur du vent.
  const { usage } = await withUsage(async () => {
    addUsage(10_000, 500, 8_000, 1_500)
  })
  assertEquals(usage.cacheRead + usage.cacheWrite <= usage.in, true)
  assertEquals(usage.in - usage.cacheRead - usage.cacheWrite, 500) // jetons frais
})

Deno.test('runWithUsage : le décompte survit à un échec de `fn`', async () => {
  // C’est la raison d’être de l’accumulateur externalisé : un appel payé puis suivi d’une erreur
  // doit rester débité, sinon il suffit de faire échouer la génération pour consommer l’IA
  // gratuitement.
  const usage = emptyUsage()
  await runWithUsage(usage, async () => {
    addUsage(700, 90, 600, 100)
    throw new Error('troncature')
  }).catch(() => {})
  assertEquals(usage, { in: 700, out: 90, cacheRead: 600, cacheWrite: 100 })
})

Deno.test('addUsage : hors accumulateur, sans effet et sans lever', () => {
  addUsage(1, 2, 3, 4)
})

Deno.test('addUsage : valeurs absurdes normalisées, jamais de compteur négatif', async () => {
  const { usage } = await withUsage(async () => {
    addUsage(-50, Number.NaN, -1, 12.6)
  })
  assertEquals(usage, { in: 0, out: 0, cacheRead: 0, cacheWrite: 13 })
})
