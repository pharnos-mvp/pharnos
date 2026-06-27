import {
  conformityPct,
  conformitySummary,
  expiringDocs,
  isNonConform,
  type ExpiryItem,
} from '@/features/dashboard/dashboard-data'
import type { RegafyFinding } from '@/features/workspace/regafy'
import type {
  AuditLogRecord,
  DocAnalysisRecord,
  DocumentRecord,
  DossierRecord,
  ProductRecord,
} from '@/lib/db'

const active = <T extends { deletedAt?: string | null }>(rows: T[]): T[] =>
  rows.filter((r) => r.deletedAt == null)

export interface ProductCockpitVm {
  /** Codes pays distincts couverts (depuis les dossiers actifs). */
  countries: string[]
  /** Pièces dans leur fenêtre de renouvellement (échéance par type). */
  expiring: ExpiryItem[]
  /** Le produit a au moins une pièce AMM. */
  hasAmm: boolean
  /** AMM active = au moins une AMM non expirée (sans date d'expiration = considérée active). */
  ammActive: boolean
}

/**
 * Vue de la fiche produit-cockpit — dérivée PURE des enregistrements (attendus actifs).
 * Aucune dépendance React : unit-testable. Réutilise le sélecteur d'expirations du dashboard.
 */
export function productCockpitVm(
  product: ProductRecord,
  documents: DocumentRecord[],
  dossiers: DossierRecord[],
  now: Date,
): ProductCockpitVm {
  const countries = [...new Set(dossiers.map((d) => d.country).filter(Boolean))]
  const expiring = expiringDocs(documents, [product], now)
  const ammDocs = documents.filter((d) => d.docType === 'amm')
  const ammActive =
    ammDocs.length > 0 && ammDocs.some((d) => !d.expiryDate || new Date(d.expiryDate) >= now)
  return { countries, expiring, hasAmm: ammDocs.length > 0, ammActive }
}

/**
 * Entrées d'audit dont l'entité est dans `entityIds` (produit + ses documents + dossiers + documents
 * compilés — l'appelant fournit l'ensemble), récentes d'abord. NB : la MODIFICATION de champ d'un
 * document n'est pas encore auditée en amont (documents-repository n'audite que create/delete).
 */
export function productHistory(
  auditLog: AuditLogRecord[],
  entityIds: Set<string>,
): AuditLogRecord[] {
  return auditLog.filter((a) => entityIds.has(a.entityId)).sort((a, b) => b.at.localeCompare(a.at))
}

export type DocConformityStatus = 'conform' | 'nonconform' | 'unanalyzed'

export interface DocConformity {
  docId: string
  docType: string
  status: DocConformityStatus
  /** Nombre de constats non conformes (cache Regafy). */
  findings: number
}

export interface ProductConformity {
  /** Taux de conformité (% des documents analysés conformes), borné [0,100] ; null si 0 analysé. */
  pct: number | null
  analyzed: number
  nonConform: number
  notAnalyzed: number
  perDoc: DocConformity[]
}

/** Conformité du produit dérivée du cache `docAnalysis` — AUCUNE relance d'IA. */
export function productConformity(
  documents: DocumentRecord[],
  docAnalysis: DocAnalysisRecord[],
): ProductConformity {
  const docs = active(documents)
  const summary = conformitySummary(docs, docAnalysis)
  const byDoc = new Map(docAnalysis.map((a) => [a.docId, a]))
  const perDoc: DocConformity[] = docs.map((d) => {
    const a = byDoc.get(d.id)
    if (!a) return { docId: d.id, docType: d.docType, status: 'unanalyzed', findings: 0 }
    const nc = (Array.isArray(a.findings) ? (a.findings as RegafyFinding[]) : []).filter(
      isNonConform,
    )
    return {
      docId: d.id,
      docType: d.docType,
      status: nc.length > 0 ? 'nonconform' : 'conform',
      findings: nc.length,
    }
  })
  return {
    pct: conformityPct(summary),
    analyzed: summary.analyzedDocs,
    nonConform: summary.nonConformDocs,
    notAnalyzed: summary.notAnalyzed,
    perDoc,
  }
}
