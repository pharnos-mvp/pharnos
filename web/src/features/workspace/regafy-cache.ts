import { db, type DocAnalysisRecord } from '@/lib/db'

import type { RegafyFinding } from './regafy'

/**
 * Version du schéma des constats en cache. **À incrémenter à CHAQUE évolution de l'analyse** —
 * nouveau type de constat, nouveau libellé, nouvelle capacité côté Edge — sinon les documents
 * déjà analysés servent leurs constats figés et ne bénéficient JAMAIS de la nouveauté (bug
 * recette : la conformité U3 n'était pas vérifiée sur les pièces analysées avant déploiement).
 * v2 : « langue cible » → « langue officielle du <Pays> ».
 * v3 : extraction de validité 1 document/appel.
 * v4 : constat de conformité au template (toutes langues) + langue détectée portée.
 * v5 : message de conformité en une phrase (sans énumération des rubriques).
 */
const CACHE_VERSION = 'v5'
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
