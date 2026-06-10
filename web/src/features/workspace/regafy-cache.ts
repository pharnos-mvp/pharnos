import { db, type DocAnalysisRecord } from '@/lib/db'

import type { RegafyFinding } from './regafy'

/**
 * Version du schéma des constats en cache. **À incrémenter** quand le libellé ou la logique des
 * constats change (côté Edge ou front) → invalide les analyses figées pour qu'elles soient
 * recalculées avec le nouveau format, sans attendre que le document change.
 * v2 : « langue cible » → « langue officielle du <Pays> ».
 */
const CACHE_VERSION = 'v2'
const versioned = (sig: string) => `${CACHE_VERSION}:${sig}`

/**
 * Cache d'analyse IA par document (ÉCO) — l'extraction Gemini n'est faite qu'une fois par document.
 * Les constats sont figés tant que le document ne change pas (`sig` = updatedAt). Un même produit
 * soumis à plusieurs pays réutilise le cache ; seuls les documents nouveaux/remplacés sont ré-analysés.
 */
export async function getCachedAnalysis(
  docId: string,
  sig: string,
): Promise<RegafyFinding[] | null> {
  try {
    const rec = await db.docAnalysis.get(docId)
    if (!rec || rec.sig !== versioned(sig)) return null
    return (rec.findings as RegafyFinding[]) ?? []
  } catch {
    return null
  }
}

export async function cacheAnalysis(
  docId: string,
  sig: string,
  findings: RegafyFinding[],
): Promise<void> {
  try {
    const rec: DocAnalysisRecord = {
      docId,
      sig: versioned(sig),
      findings,
      analyzedAt: new Date().toISOString(),
    }
    await db.docAnalysis.put(rec)
  } catch {
    // cache best-effort
  }
}
