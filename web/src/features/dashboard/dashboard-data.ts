import {
  DOSSIER_STATUS_ORDER,
  dossierDisplayStatus,
  type DossierDisplayStatus,
} from '@/features/correspondence/correspondence-constants'
import type { RegafyFinding } from '@/features/workspace/regafy'
import type {
  AuditLogRecord,
  CorrespondenceMessageRecord,
  CorrespondenceReadRecord,
  CorrespondenceRecord,
  CorrespondenceStatus,
  DocAnalysisRecord,
  DocumentRecord,
  DossierRecord,
  ProductRecord,
} from '@/lib/db'

/**
 * Sélecteurs PURS du Dashboard RA (jalon J) — `(données Dexie) → view-models`.
 *
 * Aucune dépendance React/i18n/IA : toutes les valeurs sont **dérivées des données réelles**
 * (zéro hallucination par construction) et unit-testables. Les libellés i18n + drapeaux sont
 * résolus côté composant à partir des codes bruts portés ici.
 */

/** Seuil « bientôt » (jours) — aligné sur l'ancien Dashboard (validité des pièces). */
export const EXPIRY_SOON_DAYS = 90

export type ExpiryStatus = 'expired' | 'soon' | 'ok'

export function expiryStatus(expiryDate: string, now: Date): ExpiryStatus {
  const exp = new Date(expiryDate)
  const soon = new Date(now)
  soon.setDate(soon.getDate() + EXPIRY_SOON_DAYS)
  if (exp < now) return 'expired'
  return exp <= soon ? 'soon' : 'ok'
}

/**
 * Un constat Regafy est « non conforme » (actionnable) s'il est à upgrader (≠ template en vigueur)
 * OU de sévérité `error` — en excluant les remarques positives (`ok`).
 */
export function isNonConform(f: RegafyFinding): boolean {
  return !f.ok && (f.upgrade === true || f.severity === 'error')
}

export type ActionKind =
  | 'doc_expired'
  | 'dossier_suspended'
  | 'unread_reply'
  | 'non_conform'
  | 'doc_expiring'
  | 'agency_pending'

/** Urgence (plus petit = plus haut dans la liste). */
const PRIORITY: Record<ActionKind, number> = {
  doc_expired: 1,
  dossier_suspended: 2,
  unread_reply: 3,
  non_conform: 4,
  doc_expiring: 5,
  agency_pending: 6,
}

export interface ActionItem {
  id: string
  kind: ActionKind
  priority: number
  href: string
  /** Nom d'entité dénormalisé pour l'affichage (produit / dossier). */
  label: string
  /** Code de type de document (résolu côté UI) — pièces. */
  docType?: string
  /** Code pays ISO (résolu + drapeau côté UI). */
  country?: string
  /** Date pertinente (ISO) : échéance ou dernier message. */
  date?: string
  /** Compteur (messages non lus, pièces non conformes…). */
  count?: number
}

export interface DashboardInput {
  products: ProductRecord[]
  documents: DocumentRecord[]
  dossiers: DossierRecord[]
  correspondences: CorrespondenceRecord[]
  messages: CorrespondenceMessageRecord[]
  reads: CorrespondenceReadRecord[]
  docAnalysis: DocAnalysisRecord[]
}

const active = <T extends { deletedAt?: string | null }>(rows: T[]): T[] =>
  rows.filter((r) => r.deletedAt == null)

/**
 * Liste priorisée des « actions requises » — 100 % dérivée des données locales.
 * Tri : priorité (urgence), puis date la plus ancienne d'abord (échéance/attente la plus longue).
 */
export function buildActions(input: DashboardInput, now: Date): ActionItem[] {
  const items: ActionItem[] = []
  const products = active(input.products)
  const documents = active(input.documents)
  const dossiers = active(input.dossiers)
  const correspondences = active(input.correspondences)
  const productName = new Map(products.map((p) => [p.id, p.nomCommercial]))
  const docById = new Map(documents.map((d) => [d.id, d]))

  // 1) Pièces expirées / expirantes (validité administrative)
  for (const d of documents) {
    if (!d.expiryDate) continue
    const st = expiryStatus(d.expiryDate, now)
    if (st === 'ok') continue
    const kind: ActionKind = st === 'expired' ? 'doc_expired' : 'doc_expiring'
    items.push({
      id: `doc:${d.id}`,
      kind,
      priority: PRIORITY[kind],
      href: `/catalogue/${d.productId}`,
      label: productName.get(d.productId) ?? '—',
      docType: d.docType,
      date: d.expiryDate,
    })
  }

  // 2) Dossiers en suspens (décision agence = à retravailler) — état DÉRIVÉ
  for (const dos of dossiers) {
    if (dossierDisplayStatus(dos.id, correspondences) === 'suspended') {
      items.push({
        id: `suspended:${dos.id}`,
        kind: 'dossier_suspended',
        priority: PRIORITY.dossier_suspended,
        href: `/workspace/${dos.id}`,
        label: dos.productName,
        country: dos.country,
      })
    }
  }

  // 3) Réponses d'agence non lues (à traiter) ; sinon 6) en attente de réponse agence
  const lastSeen = new Map(input.reads.map((r) => [r.id, r.lastSeenAt]))
  for (const c of correspondences) {
    const recMsgs = input.messages.filter(
      (m) => m.correspondenceId === c.id && m.author === 'recipient',
    )
    const seenAt = lastSeen.get(c.id)
    const unread = recMsgs.filter((m) => !seenAt || m.createdAt > seenAt)
    if (unread.length > 0) {
      const latest = unread.reduce((a, b) => (a.createdAt > b.createdAt ? a : b))
      items.push({
        id: `unread:${c.id}`,
        kind: 'unread_reply',
        priority: PRIORITY.unread_reply,
        href: `/workspace/${c.dossierId}`,
        label: c.productName,
        country: c.country,
        date: latest.createdAt,
        count: unread.length,
      })
    } else if (c.status === 'in_review' && c.revokedAt == null) {
      items.push({
        id: `pending:${c.id}`,
        kind: 'agency_pending',
        priority: PRIORITY.agency_pending,
        href: `/workspace/${c.dossierId}`,
        label: c.productName,
        country: c.country,
        date: c.createdAt,
      })
    }
  }

  // 4) Documents non conformes (cache Regafy `docAnalysis` — AUCUNE relance d'IA)
  for (const a of input.docAnalysis) {
    const doc = docById.get(a.docId)
    if (!doc) continue
    const findings = Array.isArray(a.findings) ? (a.findings as RegafyFinding[]) : []
    const nc = findings.filter(isNonConform)
    if (nc.length === 0) continue
    items.push({
      id: `nc:${a.docId}`,
      kind: 'non_conform',
      priority: PRIORITY.non_conform,
      href: `/catalogue/${doc.productId}`,
      label: productName.get(doc.productId) ?? '—',
      docType: doc.docType,
      count: nc.length,
    })
  }

  return items.sort((x, y) => x.priority - y.priority || (x.date ?? '').localeCompare(y.date ?? ''))
}

// ───────────────────────── J2 : pipeline + correspondance ─────────────────────────

export interface PipelineCount {
  status: DossierDisplayStatus
  count: number
}

/** Compteur de dossiers par état affiché (état DÉRIVÉ des correspondances), ordre canonique. */
export function pipelineCounts(
  dossiers: DossierRecord[],
  correspondences: CorrespondenceRecord[],
): PipelineCount[] {
  const c = active(correspondences)
  const counts = new Map<DossierDisplayStatus, number>(DOSSIER_STATUS_ORDER.map((s) => [s, 0]))
  for (const dos of active(dossiers)) {
    const st = dossierDisplayStatus(dos.id, c)
    counts.set(st, (counts.get(st) ?? 0) + 1)
  }
  return DOSSIER_STATUS_ORDER.map((s) => ({ status: s, count: counts.get(s) ?? 0 }))
}

export type CorrSubState = 'unread' | 'awaiting_agency' | 'decided'

export interface CorrItem {
  id: string
  dossierId: string
  productName: string
  country: string
  state: CorrSubState
  status: CorrespondenceStatus
  unread: number
  /** Dernière activité (ISO) : dernier message ou création. */
  date: string
}

const CORR_ORDER: Record<CorrSubState, number> = { unread: 0, awaiting_agency: 1, decided: 2 }

/** Correspondances « en cours » avec sous-état dérivé (non lu / en attente d'agence / décidé). */
export function openCorrespondences(
  correspondences: CorrespondenceRecord[],
  messages: CorrespondenceMessageRecord[],
  reads: CorrespondenceReadRecord[],
): CorrItem[] {
  const lastSeen = new Map(reads.map((r) => [r.id, r.lastSeenAt]))
  const items = active(correspondences).map((corr) => {
    const corrMsgs = messages.filter((m) => m.correspondenceId === corr.id)
    const seenAt = lastSeen.get(corr.id)
    const unread = corrMsgs.filter(
      (m) => m.author === 'recipient' && (!seenAt || m.createdAt > seenAt),
    ).length
    const lastDate = corrMsgs.reduce(
      (acc, m) => (m.createdAt > acc ? m.createdAt : acc),
      corr.createdAt,
    )
    const state: CorrSubState =
      unread > 0
        ? 'unread'
        : corr.status === 'in_review' && corr.revokedAt == null
          ? 'awaiting_agency'
          : 'decided'
    return {
      id: corr.id,
      dossierId: corr.dossierId,
      productName: corr.productName,
      country: corr.country,
      state,
      status: corr.status,
      unread,
      date: lastDate,
    }
  })
  return items.sort(
    (a, b) => CORR_ORDER[a.state] - CORR_ORDER[b.state] || b.date.localeCompare(a.date),
  )
}

/** Dernières entrées du journal d'audit (activité récente), les plus récentes d'abord. */
export function recentActivity(auditLog: AuditLogRecord[], limit = 6): AuditLogRecord[] {
  return [...auditLog].sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit)
}

// ───────────────────────── J3 : échéances + portefeuille ─────────────────────────

export interface ExpiryItem {
  id: string
  productId: string
  productName: string
  docType: string
  expiryDate: string
  /** Jours restants (négatif = expiré). */
  daysLeft: number
}

/** Pièces datées dont l'échéance est ≤ 90 j (ou dépassée), triées par urgence (jours restants). */
export function expiringDocs(
  documents: DocumentRecord[],
  products: ProductRecord[],
  now: Date,
): ExpiryItem[] {
  const pn = new Map(active(products).map((p) => [p.id, p.nomCommercial]))
  return active(documents)
    .filter((d) => d.expiryDate)
    .map((d) => {
      const daysLeft = Math.round(
        (new Date(d.expiryDate as string).getTime() - now.getTime()) / 86_400_000,
      )
      return {
        id: d.id,
        productId: d.productId,
        productName: pn.get(d.productId) ?? '—',
        docType: d.docType,
        expiryDate: d.expiryDate as string,
        daysLeft,
      }
    })
    .filter((x) => x.daysLeft <= EXPIRY_SOON_DAYS)
    .sort((a, b) => a.daysLeft - b.daysLeft)
}

export interface CodeCount {
  code: string
  count: number
}

export interface Portfolio {
  productCount: number
  dossierCount: number
  /** Couverture par pays cible (codes ISO), du plus fréquent au moins fréquent. */
  byCountry: CodeCount[]
  /** Répartition par activité réglementaire. */
  byActivity: CodeCount[]
}

function tally(codes: string[]): CodeCount[] {
  const m = new Map<string, number>()
  for (const c of codes) if (c) m.set(c, (m.get(c) ?? 0) + 1)
  return [...m.entries()]
    .map(([code, count]) => ({ code, count }))
    .sort((a, b) => b.count - a.count || a.code.localeCompare(b.code))
}

/** Synthèse du portefeuille — produits + dossiers, couverture pays/activité. */
export function portfolio(products: ProductRecord[], dossiers: DossierRecord[]): Portfolio {
  const d = active(dossiers)
  return {
    productCount: active(products).length,
    dossierCount: d.length,
    byCountry: tally(d.map((x) => x.country)),
    byActivity: tally(d.map((x) => x.activity)),
  }
}

// ───────────────────────── J4 : conformité ─────────────────────────

export interface ConformitySummary {
  /** Documents avec au moins un constat non conforme (cache Regafy). */
  nonConformDocs: number
  /** Documents déjà analysés (présents dans le cache). */
  analyzedDocs: number
  /** Documents jamais analysés (analyse à la demande non encore lancée). */
  notAnalyzed: number
}

/** Synthèse de conformité dérivée du cache `docAnalysis` — AUCUNE relance d'IA. */
export function conformitySummary(
  documents: DocumentRecord[],
  docAnalysis: DocAnalysisRecord[],
): ConformitySummary {
  const docs = active(documents)
  const analyzedIds = new Set(docAnalysis.map((a) => a.docId))
  let nonConformDocs = 0
  for (const a of docAnalysis) {
    const findings = Array.isArray(a.findings) ? (a.findings as RegafyFinding[]) : []
    if (findings.some(isNonConform)) nonConformDocs++
  }
  return {
    nonConformDocs,
    analyzedDocs: docs.filter((d) => analyzedIds.has(d.id)).length,
    notAnalyzed: docs.filter((d) => !analyzedIds.has(d.id)).length,
  }
}
