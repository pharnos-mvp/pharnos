// Logs JSON structurés des Edge Functions (T2, PLAN-V2) — visibles dans le dashboard Supabase
// (Functions → Logs). Une ligne par événement, parsable, sans jamais exposer d'identifiant brut
// ni de contenu documentaire (posture pharma : zéro PII dans les logs).

export const newReqId = (): string => crypto.randomUUID()

/** Pseudonymise l'ID utilisateur : SHA-256 tronqué (corrélable entre requêtes, non réversible). */
export async function userHash(userId: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(userId))
  return Array.from(new Uint8Array(digest).slice(0, 6))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/** Émet une ligne de log JSON : logJson({ fn: 'regafy-ai', reqId, op: 'letters', ms, status }). */
export function logJson(fields: Record<string, unknown>): void {
  console.log(JSON.stringify({ at: new Date().toISOString(), ...fields }))
}

/** Mesure la durée d'une opération et logge son issue (ok/erreur) — renvoie le résultat. */
export async function timed<T>(
  base: Record<string, unknown>,
  op: string,
  fn: () => Promise<T>,
): Promise<T> {
  const start = Date.now()
  try {
    const out = await fn()
    logJson({ ...base, op, ms: Date.now() - start, status: 'ok' })
    return out
  } catch (e) {
    logJson({
      ...base,
      op,
      ms: Date.now() - start,
      status: 'error',
      err: String(e instanceof Error ? e.message : e).slice(0, 300),
    })
    throw e
  }
}
