import { env } from '@/lib/env'

type Capturer = (error: unknown, context?: Record<string, unknown>) => void

// No-op tant que Sentry n'est pas initialisé (DSN absent).
let capture: Capturer = () => {}

/**
 * Initialise Sentry **uniquement** si un DSN est fourni. `@sentry/react` est chargé en
 * import dynamique → totalement exclu du bundle initial quand l'observabilité est désactivée.
 *
 * Posture pharma / confidentialité : pas de PII par défaut, pas de session replay,
 * échantillonnage de traces faible.
 */
export async function initSentry(): Promise<void> {
  if (!env.sentryDsn) return
  const Sentry = await import('@sentry/react')
  Sentry.init({
    dsn: env.sentryDsn,
    environment: import.meta.env.MODE,
    sendDefaultPii: false,
    // Sans cette intégration, tracesSampleRate est inerte : aucune transaction n'était créée
    // → zéro Web Vitals (LCP/INP/CLS) côté Sentry. Chunk déjà lazy, impact bundle initial nul.
    integrations: [Sentry.browserTracingIntegration()],
    tracesSampleRate: 0.1,
  })
  capture = (error, context) =>
    Sentry.captureException(error, context ? { extra: context } : undefined)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/**
 * Normalise une valeur capturée en vraie `Error` exploitable par Sentry.
 *
 * Sans ça, un objet d'erreur **Supabase/PostgREST** (`{ code, details, hint, message }`) passé tel
 * quel produit le titre opaque « Object captured as exception with keys: code, details, hint, message »
 * — illisible et mal regroupé. On en fait une `Error(message)` nommée `SupabaseError(<code>)`, et on
 * verse `code`/`details`/`hint` dans le contexte (diagnostic préservé). Une `Error` passe telle quelle.
 */
export function normalizeError(
  error: unknown,
  context?: Record<string, unknown>,
): { error: Error; extra?: Record<string, unknown> } {
  if (error instanceof Error) return { error, extra: context }
  if (isRecord(error)) {
    const rec = error
    const message =
      typeof rec.message === 'string' && rec.message ? rec.message : 'Erreur non-Error capturée'
    const normalized = new Error(message)
    if (typeof rec.code === 'string' && rec.code) normalized.name = `SupabaseError(${rec.code})`
    const extra: Record<string, unknown> = { ...context }
    for (const key of ['code', 'details', 'hint']) {
      if (rec[key] != null) extra[key] = rec[key]
    }
    return { error: normalized, extra: Object.keys(extra).length ? extra : undefined }
  }
  const message = typeof error === 'string' ? error : `Valeur non-Error capturée : ${String(error)}`
  return { error: new Error(message), extra: context }
}

/** Remonte une erreur à Sentry si configuré ; no-op sinon. Normalise les non-`Error` (cf. Supabase). */
export function reportError(error: unknown, context?: Record<string, unknown>): void {
  const { error: normalized, extra } = normalizeError(error, context)
  capture(normalized, extra)
}
