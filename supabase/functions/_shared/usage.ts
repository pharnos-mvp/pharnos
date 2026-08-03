// Comptage des tokens IA par requête (jalon M1) — alimente le quota par organisation.
// AsyncLocalStorage isole l'accumulateur PAR requête : un isolate Edge traite des requêtes
// concurrentes, donc un compteur module-global se contaminerait d'une requête à l'autre.
import { AsyncLocalStorage } from 'node:async_hooks'

export interface Usage {
  /**
   * Jetons d'entrée facturés, TOTAL — `cacheRead` et `cacheWrite` y sont déjà compris.
   *
   * ⚠️ Ne jamais additionner `in + cacheRead + cacheWrite` : on compterait deux fois. Les deux
   * champs suivants sont une VENTILATION de `in`, pas des postes supplémentaires.
   */
  in: number
  out: number
  /**
   * Part de `in` servie depuis le cache de préfixe (facturée 0,1×) et part écrite dans ce cache
   * (facturée 1,25×). Sans cette ventilation, un cache qui ne prend jamais reste invisible : le
   * total ne bouge pas et l'on croit économiser alors que l'on paie plein tarif.
   */
  cacheRead: number
  cacheWrite: number
}

/** Un accumulateur neuf, à zéro. Un seul endroit pour ajouter un compteur sans en oublier. */
export function emptyUsage(): Usage {
  return { in: 0, out: 0, cacheRead: 0, cacheWrite: 0 }
}

const als = new AsyncLocalStorage<Usage>()

/** Exécute `fn` en accumulant les tokens des appels IA effectués pendant son exécution. */
export async function withUsage<T>(fn: () => Promise<T>): Promise<{ result: T; usage: Usage }> {
  const usage: Usage = emptyUsage()
  const result = await als.run(usage, fn)
  return { result, usage }
}

/**
 * Même chose, mais l'accumulateur appartient à l'APPELANT : il reste lisible même si `fn` échoue.
 *
 * `withUsage` ne rend son décompte qu'en cas de succès — un appel IA payé puis suivi d'une erreur
 * (troncature, refus final du fournisseur) ne débite alors aucun quota. Sur un protocole qui peut
 * enchaîner deux appels par rubrique et 28 rubriques par document, cela suffirait à consommer l'IA
 * gratuitement en faisant échouer la génération. L'appelant débite dans un `finally`.
 */
export function runWithUsage<T>(usage: Usage, fn: () => Promise<T>): Promise<T> {
  return als.run(usage, fn)
}

/**
 * Ajoute des tokens à l'accumulateur de la requête courante (no-op hors d'un `withUsage`).
 *
 * `input` est le total facturé ; `cacheRead`/`cacheWrite` en sont la ventilation, et valent 0 chez
 * un fournisseur sans cache de préfixe (Vertex) — un zéro honnête, pas une donnée manquante.
 */
export function addUsage(
  input: number,
  output: number,
  cacheRead = 0,
  cacheWrite = 0,
): void {
  const u = als.getStore()
  if (!u) return
  const n = (v: number) => Math.max(0, Math.round(v) || 0)
  u.in += n(input)
  u.out += n(output)
  u.cacheRead += n(cacheRead)
  u.cacheWrite += n(cacheWrite)
}
