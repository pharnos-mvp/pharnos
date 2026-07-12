import { expiringDocs } from '@/features/dashboard/dashboard-data'
import type { DossierDisplayStatus } from '@/features/correspondence/correspondence-constants'
import type { DocumentRecord, DossierRecord, ProductRecord } from '@/lib/db'
import type { Lang, Translatable } from '@/lib/i18n-context'
import { countryLabel } from './dossier-constants'
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
  transfer: { fr: 'Transfert', en: 'Transfer' }, // legacy (retiré du sélecteur de création)
  notif_response: { fr: 'Réponse aux notifications', en: 'Notification response' },
}
/** Pastille catégorielle (hex décoratif, ≥3:1 non requis : porte aussi un libellé texte). */
export const PROCEDURE_DOT: Record<string, string> = {
  new_ma: '#1a56db',
  renewal: '#0891b2',
  variation: '#7c3aed',
  transfer: '#6b7280',
  notif_response: '#0d9488',
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
  // `accepted` = l'issue de l'étape DÉCISION (l'agent local accepte le DOSSIER CTD) — pas l'AMM,
  // qui relève de l'agence nationale bien plus tard (spine `amm_granted` → « Enregistré »).
  // Recette CEO LOT 9 : « Octroyé » laissait croire à une AMM octroyée à ce stade.
  accepted: { fr: 'Accepté', en: 'Accepted' },
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
/**
 * N° d'opération CANONIQUE « OP-AAAA-NNNN » attribué CÔTÉ SERVEUR (séquentiel, unique par org+année,
 * migration 0046). `null` tant que le dossier n'a pas été synchronisé (brouillon local) → l'UI
 * affiche `DOSSIER_REF_PENDING` (« n° en cours d'attribution… »). (Remplace l'ancien hash
 * déterministe, non séquentiel et collisionnable.)
 */
export function dossierRef(d: DossierRecord): string | null {
  if (d.opNumber != null && d.opYear != null) {
    return `OP-${d.opYear}-${String(d.opNumber).padStart(4, '0')}`
  }
  return null
}

/**
 * Libellé affiché tant que `dossierRef` est `null` (n° pas encore attribué). Formulé « en cours
 * d'attribution » — et NON « en attente » : c'est un état TRANSITOIRE qui se résout seul dès la
 * 1re synchro (le trigger serveur 0046 attribue le n° au push, il descend au pull), pas un blocage.
 */
export const DOSSIER_REF_PENDING: Translatable = {
  fr: 'n° en cours d’attribution…',
  en: 'no. being assigned…',
}

// ───────────────────────── Ligne d'opération ─────────────────────────
export interface OpsRow {
  dossier: DossierRecord
  /** N° d'opération « OP-AAAA-NNNN » ou `null` si pas encore attribué (brouillon non synchronisé). */
  ref: string | null
  status: DossierDisplayStatus
  /** Complétude CTD (% de feuilles Module 1 documentées). */
  completionPct: number
  /** Jours avant l'échéance la plus urgente (pièce produit) ; null si aucune datée. Négatif = dépassée. */
  deadlineDays: number | null
  /** Dernière activité (correspondance la plus récente du dossier) — ISO ou null. */
  lastActivityAt: string | null
}

const ECHEANCE_URGENT_DAYS = 7

/** Construit les lignes d'opérations, triées du plus RÉCENT au plus ancien (date de création). */
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

  return (
    dossiers
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
      // Tri du plus RÉCENT au plus ancien par date de création (demande CEO) — `createdAt` ISO,
      // toujours défini, donc comparaison lexicographique stable et totale.
      .sort((a, b) => b.dossier.createdAt.localeCompare(a.dossier.createdAt))
  )
}

export const isDeadlineUrgent = (days: number | null): boolean =>
  days !== null && days <= ECHEANCE_URGENT_DAYS

/** Libellé d'avancement (sous la barre) — dérivé HONNÊTEMENT du % de complétude de l'arbre M1. */
export function avancementLabel(pct: number): Translatable {
  if (pct >= 100) return { fr: 'CTD complet', en: 'CTD complete' }
  if (pct <= 0) return { fr: 'Montage', en: 'Assembly' }
  return { fr: 'CTD en cours', en: 'CTD in progress' }
}

// ───────────────────────── Pipeline ─────────────────────────
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

// ───────────────────────── Recherche du board ─────────────────────────
/** Normalisation pour la recherche : sans accents, minuscule (insensible casse/diacritiques). */
export const normalizeSearch = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()

/** Un dossier matche la requête (nom produit, n° d'opération, pays, procédure). `q` déjà normalisé. */
export function matchesDossierQuery(r: OpsRow, q: string, lang: Lang): boolean {
  const hay = normalizeSearch(
    `${r.dossier.productName} ${r.ref ?? ''} ${countryLabel(r.dossier.country, lang)} ${procedureLabel(r.dossier.activity, lang)}`,
  )
  return hay.includes(q)
}
