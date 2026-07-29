// Lecture du repli serveur (`fallbacks`) — module PUR, sans SDK ni réseau, pour rester testable
// dans le job `deno test` des modules partagés (aucun téléchargement npm).
//
// Pourquoi c'est nécessaire : quand Opus 5 décline une requête, l'API la rejoue sur le modèle de
// repli DANS LE MÊME APPEL et rend une réponse normale. Sans lecture explicite, ce rattrapage est
// invisible — or il signale qu'un document CLIENT a été refusé par le modèle principal. Un
// classificateur qui se déclenche sur un dossier d'AMM légitime doit se voir dans les journaux.

/** Une entrée du décompte par tentative (`usage.iterations`). */
export interface UsageIteration {
  type?: string
}

/**
 * Vrai si un modèle de repli a produit la réponse. Couvre aussi les tours « collants » (routage
 * persistant), qui ne portent AUCUN bloc `fallback` — s'en remettre aux blocs de contenu laisserait
 * passer ces tours-là silencieusement.
 */
export function servedByFallback(iterations: readonly UsageIteration[] | null | undefined): boolean {
  if (!Array.isArray(iterations)) return false
  return iterations.some((entry) => entry?.type === 'fallback_message')
}
