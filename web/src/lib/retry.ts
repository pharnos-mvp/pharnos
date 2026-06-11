// Retry borné pour la sync offline-first (T8, PLAN-V2). Terrain Afrique de l'Ouest : les
// coupures réseau de quelques secondes sont la norme — re-tenter 2 fois avec backoff évite
// d'attendre le prochain déclencheur (montage/reconnexion/mutation) pour synchroniser.
// Politique : ne re-tenter QUE le transitoire (réseau, timeout, 429, 5xx) — jamais une erreur
// déterministe (RLS, validation, 4xx) qui rééchouera à l'identique.

export interface RetryOptions {
  /** Nombre total de tentatives (1 = aucun retry). */
  attempts?: number
  /** Base du backoff exponentiel en ms (1000 → ~1 s, ~2 s). */
  baseMs?: number
}

function isTransient(e: unknown): boolean {
  // supabase-js : PostgrestError/StorageError exposent status ou statusCode (parfois string).
  const raw =
    (e as { status?: unknown; statusCode?: unknown })?.status ??
    (e as { statusCode?: unknown })?.statusCode
  const status = Number(raw)
  if (Number.isFinite(status) && status > 0) return status === 429 || status >= 500
  // fetch réseau coupé → TypeError ; timeout → AbortError.
  return e instanceof TypeError || (e instanceof Error && e.name === 'AbortError')
}

/** Exécute fn avec retry borné sur erreurs transitoires uniquement (backoff expo + jitter). */
export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  const attempts = Math.max(1, opts.attempts ?? 3)
  const baseMs = opts.baseMs ?? 1000
  let lastErr: unknown
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn()
    } catch (e) {
      lastErr = e
      if (i === attempts - 1 || !isTransient(e)) throw e
      const backoff = baseMs * 2 ** i
      await new Promise((r) => setTimeout(r, backoff + Math.random() * backoff * 0.3))
    }
  }
  throw lastErr
}
