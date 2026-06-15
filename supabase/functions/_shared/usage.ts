// Comptage des tokens IA par requête (jalon M1) — alimente le quota par organisation.
// AsyncLocalStorage isole l'accumulateur PAR requête : un isolate Edge traite des requêtes
// concurrentes, donc un compteur module-global se contaminerait d'une requête à l'autre.
import { AsyncLocalStorage } from 'node:async_hooks'

export interface Usage {
  in: number
  out: number
}

const als = new AsyncLocalStorage<Usage>()

/** Exécute `fn` en accumulant les tokens des appels Vertex effectués pendant son exécution. */
export async function withUsage<T>(fn: () => Promise<T>): Promise<{ result: T; usage: Usage }> {
  const usage: Usage = { in: 0, out: 0 }
  const result = await als.run(usage, fn)
  return { result, usage }
}

/** Ajoute des tokens à l'accumulateur de la requête courante (no-op hors d'un `withUsage`). */
export function addUsage(input: number, output: number): void {
  const u = als.getStore()
  if (!u) return
  u.in += Math.max(0, Math.round(input) || 0)
  u.out += Math.max(0, Math.round(output) || 0)
}
