// Retry borné + circuit breaker pour les appels sortants des Edge Functions (T2, PLAN-V2).
// Politique : ne JAMAIS re-tenter une erreur déterministe (4xx ≠ 429) — seuls les transitoires
// (429, 5xx, erreurs réseau) méritent un nouvel essai, avec backoff exponentiel + jitter.

/** Erreur HTTP typée : permet à la politique de retry de décider sur le status. */
export class HttpError extends Error {
  readonly status: number
  readonly retryAfterMs?: number
  constructor(status: number, message: string, retryAfterMs?: number) {
    super(message)
    this.status = status
    this.retryAfterMs = retryAfterMs
  }
}

export interface RetryOptions {
  /** Nombre total de tentatives (1 = aucun retry). */
  attempts?: number
  /** Base du backoff exponentiel en ms (500 → ~500, ~1000, ~2000…). */
  baseMs?: number
  /** Plafond d'attente entre deux tentatives. */
  maxDelayMs?: number
}

const isTransient = (e: unknown): boolean => {
  if (e instanceof HttpError) return e.status === 429 || e.status >= 500
  // AbortError (timeout) et TypeError (réseau coupé) : transitoires.
  return e instanceof Error && (e.name === 'AbortError' || e.name === 'TypeError')
}

/** Exécute fn avec retry borné sur erreurs transitoires uniquement (respect de Retry-After). */
export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  const attempts = Math.max(1, opts.attempts ?? 3)
  const baseMs = opts.baseMs ?? 500
  const maxDelayMs = opts.maxDelayMs ?? 4000
  let lastErr: unknown
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn()
    } catch (e) {
      lastErr = e
      if (i === attempts - 1 || !isTransient(e)) throw e
      const retryAfter = e instanceof HttpError ? e.retryAfterMs : undefined
      const backoff = Math.min(maxDelayMs, baseMs * 2 ** i)
      const jitter = Math.random() * backoff * 0.3
      await new Promise((r) => setTimeout(r, retryAfter ?? backoff + jitter))
    }
  }
  throw lastErr
}

/**
 * Circuit breaker minimal (état par isolate) : après `threshold` échecs consécutifs, les appels
 * échouent immédiatement pendant `openMs` — protège Vertex (et le budget) d'un martèlement
 * inutile quand le service est durablement en panne.
 */
export class CircuitBreaker {
  #failures = 0
  #openedAt = 0
  readonly #threshold: number
  readonly #openMs: number

  constructor(threshold = 5, openMs = 30_000) {
    this.#threshold = threshold
    this.#openMs = openMs
  }

  get isOpen(): boolean {
    if (this.#failures < this.#threshold) return false
    if (Date.now() - this.#openedAt >= this.#openMs) {
      // Demi-ouverture : on laisse passer un essai (reset au succès, ré-ouverture à l'échec).
      this.#failures = this.#threshold - 1
      return false
    }
    return true
  }

  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.isOpen) {
      throw new HttpError(503, 'Circuit ouvert — service IA temporairement indisponible.')
    }
    try {
      const out = await fn()
      this.#failures = 0
      return out
    } catch (e) {
      this.#failures++
      if (this.#failures >= this.#threshold) this.#openedAt = Date.now()
      throw e
    }
  }
}
