// Choix du fournisseur — module SANS aucune dépendance (ni SDK, ni réseau), pour rester testable
// en pur : le job `deno test` des modules partagés ne doit pas télécharger le SDK Anthropic.
import type { Provider } from './types.ts'

const PROVIDERS: readonly Provider[] = ['vertex', 'anthropic'] as const

/**
 * Fournisseur effectif : option d'appel > variable d'environnement `AI_PROVIDER` > `vertex`.
 * Une valeur inconnue retombe sur `vertex` — un environnement mal renseigné ne doit pas couper
 * le service, il doit garder le comportement d'avant.
 */
export function resolveProvider(requested?: string, envValue?: string): Provider {
  const wanted = (requested ?? envValue ?? '').trim().toLowerCase()
  return (PROVIDERS as readonly string[]).includes(wanted) ? (wanted as Provider) : 'vertex'
}
