// Bornes de temps communes à TOUS les fournisseurs LLM — indépendantes de l'implémentation.
// Extraites de vertex.ts au lot M1 : un module Anthropic ne doit pas importer le module Google
// pour connaître le mur de la plateforme. `vertex.ts` les ré-exporte (appelants inchangés).

/**
 * Mur de la plateforme Edge (plan `free`) : le worker est tué à 150 s de wall clock, quel que soit
 * NOTRE timeout. Un garde-fou au-delà de ce mur ne peut donc JAMAIS se déclencher — la requête
 * meurt en 546 côté plateforme au lieu de rendre un 502 propre au client.
 */
export const EDGE_WALL_CLOCK_MS = 150_000

/**
 * Plafond de tout appel sortant : 120 s. Les 30 s restantes couvrent ce qui se passe AVANT et
 * APRÈS l'appel dans la même invocation (JWT, téléchargement Storage, base64, écriture de la
 * réponse). Voir PLAN-MOTEUR-IA.md §2 (S0) et §9 (M0).
 */
export const MAX_CALL_TIMEOUT_MS = 120_000

/**
 * Timeout effectif d'un appel : défaut du mode, borné au plafond plateforme. La garantie vit ici,
 * dans le code qui LANCE l'appel — aucun appelant ne peut poser un garde-fou mort.
 */
export function boundedTimeout(requested: number | undefined, fallbackMs: number): number {
  const wanted = Number.isFinite(requested) && (requested as number) > 0
    ? (requested as number)
    : fallbackMs
  return Math.min(wanted, MAX_CALL_TIMEOUT_MS)
}
