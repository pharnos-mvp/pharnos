// Parallélisme BORNÉ avec mesure — module PUR (aucune API Deno ni DOM, TS standard uniquement),
// donc utilisable à l'identique par le worker asynchrone et par le navigateur.
//
// POURQUOI CE MODULE EXISTE. La génération par rubrique tient largement sous le mur de 150 s
// (5 à 22 s par rubrique, mesuré sur KV-Kacin), mais l'ENCHAÎNEMENT ne tient pas : 59 appels
// séquentiels demandent 11 à 23 minutes une fois la réflexion d'Opus 5 comptée. Le parallélisme
// n'est donc pas une optimisation de confort, c'est ce qui rend le produit livrable :
//
//   1 appel à la fois  ~16 min      3 à la fois  ~5 min      6 à la fois  ~2,6 min
//
// Trois garanties, chacune apprise d'un piège réel :
//  1. **Ne jamais rejeter.** Un item qui échoue rend son erreur ; les 58 autres aboutissent. Un
//     `Promise.all` perdrait 58 appels payés pour une rubrique en panne.
//  2. **Ne pas LANCER ce qui ne peut pas finir.** Sous échéance, un appel démarré trop tard est
//     tué par la plateforme : payé, inutile. On l'abandonne AVANT de le lancer et on le dit.
//  3. **Mesurer chaque item.** Sans durée par rubrique, on ne sait pas si un dépassement vient du
//     modèle, du réseau ou de nous.

/** Ce que devient un item : une valeur, une erreur, ou un abandon faute de temps. */
export interface PoolOutcome<T> {
  index: number
  value?: T
  error?: Error
  /** `true` quand l'item n'a jamais été lancé : l'échéance ne le permettait plus. */
  skipped: boolean
  /** Durée de l'item, en millisecondes. 0 pour un item abandonné. */
  ms: number
}

export interface PoolReport<T> {
  outcomes: PoolOutcome<T>[]
  /** Durée totale du lot — inférieure à la somme des items, c'est tout l'intérêt. */
  ms: number
  ok: number
  failed: number
  skipped: number
  /** Durée du plus long item : c'est elle qui doit rester sous le mur de la plateforme. */
  slowestMs: number
}

export interface PoolOptions {
  /**
   * Nombre d'items simultanés. Défaut 6 : au-delà, la limite de débit du fournisseur devient le
   * facteur limitant et les rejeux 429 annulent le gain.
   */
  concurrency?: number
  /** Échéance absolue (epoch ms). Aucun item ne sera LANCÉ après. */
  deadline?: number
  /**
   * Durée qu'un item doit pouvoir consommer pour valoir la peine d'être lancé. En deçà du temps
   * restant, l'item est abandonné plutôt que tué en vol.
   */
  minSliceMs?: number
  /** Horloge injectable (tests). */
  now?: () => number
  /** Appelé à la fin de chaque item — journalisation de progression, jamais dans la boucle chaude. */
  onSettled?: (outcome: PoolOutcome<unknown>) => void
  /**
   * Exécute le PREMIER item seul, puis parallélise le reste.
   *
   * Indispensable dès qu'un cache de préfixe est en jeu. Six appels lancés ensemble démarrent avant
   * que le premier n'ait écrit le cache : les six paient l'écriture (1,25×) au lieu d'une seule, et
   * cinq relectures à 0,1× sont perdues. Sur un RCP, ce préchauffage coûte la latence d'un appel
   * (~15 s) et épargne l'équivalent de cinq écritures d'un préfixe de 10 000 jetons.
   *
   * Sans cache de préfixe, il ne sert à rien : il ne fait que rallonger le lot.
   */
  warmupFirst?: boolean
}

export const DEFAULT_CONCURRENCY = 6

/**
 * Applique `worker` à chaque item, au plus `concurrency` à la fois, et rend un compte rendu mesuré.
 * L'ordre des résultats suit celui des items, jamais celui des achèvements.
 */
export async function boundedMap<I, O>(
  items: readonly I[],
  worker: (item: I, index: number) => Promise<O>,
  options: PoolOptions = {},
): Promise<PoolReport<O>> {
  const concurrency = Math.max(1, options.concurrency ?? DEFAULT_CONCURRENCY)
  const now = options.now ?? Date.now
  const minSlice = options.minSliceMs ?? 0
  const started = now()
  const outcomes: PoolOutcome<O>[] = new Array(items.length)

  let next = 0
  // Préchauffage : le premier item part SEUL, pour qu'il ait écrit le cache de préfixe avant que
  // les suivants ne démarrent. `next` étant déjà avancé, la vague parallèle reprend après lui.
  if (options.warmupFirst && items.length > 1) {
    next = 1
    const t0 = now()
    try {
      outcomes[0] = { index: 0, value: await worker(items[0], 0), skipped: false, ms: now() - t0 }
    } catch (e) {
      outcomes[0] = {
        index: 0,
        error: e instanceof Error ? e : new Error(String(e)),
        skipped: false,
        ms: now() - t0,
      }
    }
    options.onSettled?.(outcomes[0] as PoolOutcome<unknown>)
  }

  const runOne = async (): Promise<void> => {
    for (;;) {
      const index = next++
      if (index >= items.length) return

      // Garde-fou n°2 : ne pas lancer ce qui ne peut pas finir sous l'échéance.
      if (options.deadline !== undefined && options.deadline - now() < minSlice) {
        outcomes[index] = { index, skipped: true, ms: 0 }
        options.onSettled?.(outcomes[index] as PoolOutcome<unknown>)
        continue
      }

      const t0 = now()
      try {
        const value = await worker(items[index], index)
        outcomes[index] = { index, value, skipped: false, ms: now() - t0 }
      } catch (e) {
        // Garde-fou n°1 : l'échec d'un item ne fait pas tomber le lot.
        outcomes[index] = {
          index,
          error: e instanceof Error ? e : new Error(String(e)),
          skipped: false,
          ms: now() - t0,
        }
      }
      options.onSettled?.(outcomes[index] as PoolOutcome<unknown>)
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length - next) }, () => runOne()),
  )

  let ok = 0
  let failed = 0
  let skipped = 0
  let slowestMs = 0
  for (const o of outcomes) {
    if (o.skipped) skipped++
    else if (o.error) failed++
    else ok++
    if (o.ms > slowestMs) slowestMs = o.ms
  }
  return { outcomes, ms: now() - started, ok, failed, skipped, slowestMs }
}

/** Les valeurs abouties, dans l'ordre des items. Les échecs et abandons sont écartés. */
export function values<T>(report: PoolReport<T>): T[] {
  return report.outcomes.filter((o) => !o.skipped && !o.error).map((o) => o.value as T)
}

/**
 * Un lot est LIVRABLE quand aucun item n'a échoué ni été abandonné. Sur un dossier réglementaire,
 * livrer 27 rubriques sur 29 sans le dire serait un document tronqué présenté comme complet — le
 * défaut que le lot M0 avait déjà corrigé sur les documents.
 */
export function isComplete(report: PoolReport<unknown>): boolean {
  return report.failed === 0 && report.skipped === 0
}
