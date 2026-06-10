import { db, type DocAnalysisRecord } from '@/lib/db'

import type { RegafyFinding } from './regafy'

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
    if (!rec || rec.sig !== sig) return null
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
      sig,
      findings,
      analyzedAt: new Date().toISOString(),
    }
    await db.docAnalysis.put(rec)
  } catch {
    // cache best-effort
  }
}
