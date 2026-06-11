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

/** Remonte une erreur à Sentry si configuré ; no-op sinon. */
export function reportError(error: unknown, context?: Record<string, unknown>): void {
  capture(error, context)
}
