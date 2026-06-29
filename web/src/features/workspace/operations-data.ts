import { expiringDocs } from '@/features/dashboard/dashboard-data'
import type { DossierDisplayStatus } from '@/features/correspondence/correspondence-constants'
import type { DocumentRecord, DossierRecord, ProductRecord } from '@/lib/db'
import type { Lang, Translatable } from '@/lib/i18n-context'
import { buildDocsByNode, completionStats, docsForNode } from './dossier-selectors'
import { flattenTree } from './tree-utils'

/**
 * Données du board « Opérations » (mockup CTD Workspace Premium, DA Pharnos) — PUR, testable.
 * Une OPÉRATION = un dossier vu par sa procédure réglementaire, son statut RA (dérivé des
 * correspondances), son avancement CTD (complétude de l'arbre Module 1) et son échéance la plus
 * urgente (pièce produit à expirer). Aucune nouvelle table : tout est dérivé.
 */

// ───────────────────────── Procédure réglementaire ─────────────────────────
// L'`activity` du dossier porte la procédure. Libellé/teinte CATÉGORIELLE (≠ statut sémantique).
export const PROCEDURE_LABEL: Record<string, Translatable> = {
  new_ma: { fr: 'Enregistrement', en: 'Registration' },
  renewal: { fr: 'Renouvellement', en: 'Renewal' },
  variation: { fr: 'Variation', en: 'Variation' },
  transfer: { fr: 'Transfert', en: 'Transfer' },
}
/** Pastille catégorielle (hex décoratif, ≥3:1 non requis : porte aussi un libellé texte). */
export const PROCEDURE_DOT: Record<string, string> = {
  new_ma: '#1a56db',
  renewal: '#0891b2',
  variation: '#7c3aed',
  transfer: '#6b7280',
}
export const PROCEDURE_ORDER = ['new_ma', 'renewal', 'variation', 'transfer'] as const

export const procedureLabel = (activity: string, lang: Lang): string =>
  (PROCEDURE_LABEL[activity] ?? { fr: activity, en: activity })[lang]

// ───────────────────────── Statut RA (vocabulaire mockup) ─────────────────────────
// Relabel des 5 états dérivés (`dossierDisplayStatus`) dans le vocabulaire réglementaire du board.
export const OPS_STATUS_ORDER: DossierDisplayStatus[] = [
  'draft',
  'in_review',
  'suspended',
  'accepted',
  'rejected',
]
export const OPS_STATUS_LABEL: Record<DossierDisplayStatus, Translatable> = {
  draft: { fr: 'Brouillon', en: 'Draft' },
  in_review: { fr: 'En évaluation', en: 'Under review' },
  suspended: { fr: 'Complément', en: 'Information requested' },
  accepted: { fr: 'Octroyé', en: 'Granted' },
  rejected: { fr: 'Rejeté', en: 'Rejected' },
}
export const OPS_STATUS_TONE: Record<
  DossierDisplayStatus,
  'neutral' | 'info' | 'warning' | 'success' | 'danger'
> = {
  draft: 'neutral',
  in_review: 'info',
  suspended: 'warning',
  accepted: 'success',
  rejected: 'danger',
}
export const opsStatusLabel = (s: DossierDisplayStatus, lang: Lang): string =>
  OPS_STATUS_LABEL[s][lang]

// ───────────────────────── Référence d'opération ─────────────────────────
/** Référence lisible stable « OP-AAAA-NNNN » dérivée de l'id + de l'année de création (déterministe). */
export function dossierRef(d: DossierRecord): string {
  let h = 0
  for (let i = 0; i < d.id.length; i++) h = (h * 31 + d.id.charCodeAt(i)) >>> 0
  const year = d.createdAt.slice(0, 4)
  return `OP-${year}-${String(h % 10000).padStart(4, '0')}`
}

// ───────────────────────── Ligne d'opération ─────────────────────────
export interface OpsRow {
  dossier: DossierRecord
  ref: string
  status: DossierDisplayStatus
  /** Complétude CTD (% de feuilles Module 1 documentées). */
  completionPct: number
  /** Jours avant l'échéance la plus urgente (pièce produit) ; null si aucune datée. Négatif = dépassée. */
  deadlineDays: number | null
  /** Dernière activité (correspondance la plus récente du dossier) — ISO ou null. */
  lastActivityAt: string | null
}

const ECHEANCE_URGENT_DAYS = 7

/** Construit les lignes d'opérations (triées : échéance la plus urgente d'abord, puis récence). */
export function buildOpsRows(
  dossiers: DossierRecord[],
  statusById: Map<string, DossierDisplayStatus>,
  products: ProductRecord[],
  documents: DocumentRecord[],
  lastActivityById: Map<string, string>,
  now: Date,
): OpsRow[] {
  const docsByProduct = new Map<string, DocumentRecord[]>()
  for (const d of documents) {
    if (d.deletedAt !== null) continue
    docsByProduct.set(d.productId, [...(docsByProduct.get(d.productId) ?? []), d])
  }
  const productById = new Map(products.map((p) => [p.id, p]))

  return dossiers
    .map((dossier) => {
      const pdocs = docsByProduct.get(dossier.productId) ?? []
      // Avancement CTD : feuilles de l'arbre Module 1 du dossier documentées par les pièces produit.
      const byNode = buildDocsByNode(dossier, pdocs)
      const flat = flattenTree(dossier.tree)
      const completionPct = completionStats(flat, (n) => docsForNode(byNode, n).length).pct
      // Échéance : la pièce produit datée la PLUS PROCHE (jours bruts). `expiringDocs` trie par
      // urgence relative (jours/fenêtre) → on reprend le minimum brut pour la colonne « Échéance ».
      const product = productById.get(dossier.productId)
      const exp = product ? expiringDocs(pdocs, [product], now) : []
      const deadlineDays = exp.length > 0 ? Math.min(...exp.map((e) => e.daysLeft)) : null
      return {
        dossier,
        ref: dossierRef(dossier),
        status: statusById.get(dossier.id) ?? 'draft',
        completionPct,
        deadlineDays,
        lastActivityAt: lastActivityById.get(dossier.id) ?? null,
      } satisfies OpsRow
    })
    .sort((a, b) => {
      // Échéances urgentes d'abord (les non datées en dernier), puis activité récente.
      const da = a.deadlineDays ?? Infinity
      const dbb = b.deadlineDays ?? Infinity
      if (da !== dbb) return da - dbb
      return (b.lastActivityAt ?? '').localeCompare(a.lastActivityAt ?? '')
    })
}

export const isDeadlineUrgent = (days: number | null): boolean =>
  days !== null && days <= ECHEANCE_URGENT_DAYS

/** Libellé d'avancement (sous la barre) — dérivé HONNÊTEMENT du % de complétude de l'arbre M1. */
export function avancementLabel(pct: number): Translatable {
  if (pct >= 100) return { fr: 'CTD complet', en: 'CTD complete' }
  if (pct <= 0) return { fr: 'Montage', en: 'Assembly' }
  return { fr: 'CTD en cours', en: 'CTD in progress' }
}

// ───────────────────────── KPI + pipeline ─────────────────────────
export interface OpsKpis {
  active: number
  inReview: number
  complement: number
  granted: number
  dueSoon: number
}

export function opsKpis(rows: OpsRow[]): OpsKpis {
  let inReview = 0,
    complement = 0,
    granted = 0,
    dueSoon = 0
  for (const r of rows) {
    if (r.status === 'in_review') inReview++
    if (r.status === 'suspended') complement++
    if (r.status === 'accepted') granted++
    if (isDeadlineUrgent(r.deadlineDays)) dueSoon++
  }
  return { active: rows.length, inReview, complement, granted, dueSoon }
}

/** Répartition par statut (ordre canonique) — alimente la barre Pipeline. */
export function opsPipeline(rows: OpsRow[]): { status: DossierDisplayStatus; count: number }[] {
  const counts = new Map<DossierDisplayStatus, number>()
  for (const r of rows) counts.set(r.status, (counts.get(r.status) ?? 0) + 1)
  return OPS_STATUS_ORDER.map((status) => ({ status, count: counts.get(status) ?? 0 }))
}

/** Comptes par procédure (ordre canonique) — alimente les chips de filtre. */
export function opsProcedureCounts(rows: OpsRow[]): { activity: string; count: number }[] {
  const counts = new Map<string, number>()
  for (const r of rows) counts.set(r.dossier.activity, (counts.get(r.dossier.activity) ?? 0) + 1)
  return PROCEDURE_ORDER.map((activity) => ({ activity, count: counts.get(activity) ?? 0 })).filter(
    (x) => x.count > 0 || x.activity !== 'transfer',
  )
}
