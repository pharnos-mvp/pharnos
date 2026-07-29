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

/** Fournisseurs capables d'un DÉCODAGE CONTRAINT par schéma (M2), et pas seulement de « du JSON ». */
const STRUCTURED_OUTPUT: readonly Provider[] = ['anthropic'] as const

/**
 * Refuse un appel à sortie structurée adressé à un fournisseur qui n'en fait pas.
 *
 * Vertex n'a ici que `responseMimeType: application/json` — du JSON LIBRE. Servir cet appel rendrait
 * un texte non contraint là où l'appelant attend un schéma respecté : le pire mode de panne, car il
 * ne ressemble pas à une panne. Le garde-fou vit dans l'aiguillage, pas chez l'appelant (§8.7).
 */
export function assertStructuredOutputSupported(provider: Provider, hasSchema: boolean): void {
  if (!hasSchema || STRUCTURED_OUTPUT.includes(provider)) return
  throw new Error(
    `sortie structurée (\`jsonSchema\`) demandée sur le fournisseur \`${provider}\` : non ` +
      'supportée — la génération par rubrique exige un décodage contraint (PLAN-MOTEUR-IA §3.2)',
  )
}
