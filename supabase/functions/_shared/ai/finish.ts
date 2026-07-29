// Interprétation du motif d'arrêt d'un fournisseur — module PUR (ni SDK, ni réseau), testable
// dans le job `deno test` des modules partagés.
//
// Pourquoi ce fichier existe : une génération peut s'arrêter AVANT la fin sans qu'aucune erreur ne
// soit levée. Le corps de réponse est alors parfaitement valide — mais incomplet. C'est le pire
// mode de panne pour un document réglementaire : il ne ressemble pas à une panne.

/** Motif d'arrêt exploitable, ou nature du problème quand la sortie ne l'est pas. */
export type FinishProblem = 'truncated' | 'blocked'

/**
 * Rend `null` quand la sortie est complète et exploitable, sinon la nature du problème.
 *
 * - `MAX_TOKENS` → **tronqué** : le budget de sortie est épuisé, le texte s'arrête en plein milieu.
 * - `STOP` / absent / non spécifié → sortie normale.
 * - tout le reste (`SAFETY`, `RECITATION`, `PROHIBITED_CONTENT`, `BLOCKLIST`, `SPII`, `OTHER`…)
 *   → **bloqué** : le modèle a interrompu la génération, le contenu rendu est vide ou partiel.
 *
 * Le défaut par défaut est volontairement PESSIMISTE : un motif inconnu est traité comme un blocage
 * plutôt que comme un succès. Sur un livrable réglementaire, se tromper dans ce sens coûte un
 * message d'erreur ; se tromper dans l'autre livre un document faux au client.
 */
export function finishProblem(reason: string | null | undefined): FinishProblem | null {
  if (!reason) return null
  const r = String(reason).trim().toUpperCase()
  if (r === 'STOP' || r === 'FINISH_REASON_UNSPECIFIED') return null
  if (r === 'MAX_TOKENS') return 'truncated'
  return 'blocked'
}

/** Message destiné aux journaux et à l'appelant — jamais au document rendu. */
export function finishProblemMessage(problem: FinishProblem, where: string): string {
  return problem === 'truncated'
    ? `${where} : réponse tronquée (budget de sortie épuisé) — contenu incomplet, non exploitable`
    : `${where} : génération interrompue par le fournisseur — contenu non exploitable`
}
