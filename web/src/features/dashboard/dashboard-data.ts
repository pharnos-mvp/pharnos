import { ADMIN_DOC_TYPES, requiresExpiry } from '@/features/catalogue/doc-types'
import {
  DOSSIER_STATUS_ORDER,
  dossierDisplayStatus,
  latestDossierCorrespondence,
  type DossierDisplayStatus,
} from '@/features/correspondence/correspondence-constants'
import { renewalLeadOverride } from './renewal-config'
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
 * Délai d'action avant expiration, par type de pièce (jours) — pilote le KPI « À renouveler ».
 * ALIGNÉ sur la règle de validité du Monitor (`regafy.ts`) pour qu'aucun écran ne se contredise sur
 * la même pièce : COA = 18 mois ; toute pièce ADMIN (AMM, GMP, COPP, FSC, ML, contrat…) = 6 mois ;
 * autres (info) = 3 mois par défaut. « Admin » dérive de `ADMIN_DOC_TYPES` (source unique).
 */
export const COA_LEAD_DAYS = 547 // ≈ 18 mois
export const ADMIN_LEAD_DAYS = 180 // 6 mois (= règle Monitor)
export const DEFAULT_LEAD_DAYS = 90 // 3 mois
const ADMIN_DOC_CODES = new Set(ADMIN_DOC_TYPES.map((d) => d.code))
export function renewalLeadDays(docType: string): number {
  // Préavis personnalisé de l'org (config `reminder_settings`, 0055) s'il existe, sinon les défauts.
  // Point de passage unique du monitoring → toutes les surfaces respectent la config d'un seul coup.
  const override = renewalLeadOverride(docType)
  if (override !== undefined) return override
  if (docType === 'coa') return COA_LEAD_DAYS
  if (ADMIN_DOC_CODES.has(docType)) return ADMIN_LEAD_DAYS
  return DEFAULT_LEAD_DAYS
}

/** Au-delà de cette fraction de la fenêtre consommée, l'échéance passe en « urgent » (rouge). */
export const EXPIRY_POOR_RATIO = 0.5

/** Tonalité de performance d'un KPI — mappée aux tokens de statut (success/info/warning/danger) côté UI. */
export type KpiTone = 'good' | 'fair' | 'passable' | 'poor' | 'neutral'

/**
 * Tonalité KPI → tonalité de `StatusBadge`. **Source unique** partagée (liste Produits + cockpit) —
 * évite la map dupliquée par surface (pur mapping, pas de React).
 */
export const KPI_BADGE_TONE: Record<
  KpiTone,
  'neutral' | 'success' | 'warning' | 'danger' | 'info'
> = {
  good: 'success',
  fair: 'info',
  passable: 'warning',
  poor: 'danger',
  neutral: 'neutral',
}

/**
 * Conformité (%) → tonalité. Barème CEO ALIGNÉ sur le taux binaire « dossiers à jour » : un seul
 * dossier en défaut doit se voir, quelle que soit la taille du portefeuille.
 *   100 % → vert (zéro dossier en défaut) · 80-99 % → orange · < 80 % → rouge.
 * `null` (aucun dossier) → neutre.
 */
export function conformityTone(pct: number | null): KpiTone {
  if (pct == null) return 'neutral'
  if (pct >= 100) return 'good'
  if (pct >= 80) return 'passable'
  return 'poor'
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

  // 1) Pièces expirées / dans leur fenêtre de renouvellement (délai requis par type)
  for (const d of documents) {
    if (!d.expiryDate) continue
    const daysLeft = Math.round((new Date(d.expiryDate).getTime() - now.getTime()) / 86_400_000)
    let kind: ActionKind
    if (daysLeft <= 0) kind = 'doc_expired'
    else if (daysLeft <= renewalLeadDays(d.docType)) kind = 'doc_expiring'
    else continue
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
    const latest = latestDossierCorrespondence(dos.id, correspondences)
    if (latest?.status === 'suspended') {
      items.push({
        id: `suspended:${dos.id}`,
        kind: 'dossier_suspended',
        priority: PRIORITY.dossier_suspended,
        href: `/workspace/${dos.id}`,
        label: dos.productName,
        country: dos.country,
        // Date de la décision « complément requis » (repli création) → tri chronologique de la cloche.
        date: latest.decidedAt ?? latest.createdAt,
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
      // Date de l'analyse Regafy → tri chronologique de la cloche (ne coule plus en bas, faute de date).
      date: a.analyzedAt,
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
  /** Délai d'action requis pour ce type de pièce (jours) — fenêtre de renouvellement. */
  lead: number
}

/**
 * Pièces datées DANS leur fenêtre de renouvellement (jours restants ≤ délai requis du type, ou
 * dépassée), triées par urgence relative (jours restants / délai du type — plus petit = plus urgent).
 */
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
        lead: renewalLeadDays(d.docType),
      }
    })
    .filter((x) => x.daysLeft <= x.lead)
    .sort((a, b) => a.daysLeft / a.lead - b.daysLeft / b.lead)
}

/**
 * Expirations → tonalité, selon la pièce la plus urgente RELATIVEMENT à sa fenêtre (jours restants /
 * délai requis). Vert = rien dans la fenêtre ; jaune = dans la fenêtre ; rouge = à mi-fenêtre ou expiré.
 */
export function expiryTone(items: ExpiryItem[]): KpiTone {
  if (items.length === 0) return 'good'
  let worst = Infinity
  for (const it of items) worst = Math.min(worst, it.daysLeft / it.lead)
  return worst <= EXPIRY_POOR_RATIO ? 'poor' : 'passable'
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
  // `docAnalysis` n'a pas de colonne orgId (clé = docId) et est chargé en entier : on RESTREINT
  // aux docs actifs de l'org, sinon nonConformDocs agrégerait d'autres orgs / docs supprimés et
  // le taux de conformité dérivé pourrait devenir négatif.
  const docIds = new Set(docs.map((d) => d.id))
  const analyzedIds = new Set(docAnalysis.map((a) => a.docId))
  let nonConformDocs = 0
  for (const a of docAnalysis) {
    if (!docIds.has(a.docId)) continue
    const findings = Array.isArray(a.findings) ? (a.findings as RegafyFinding[]) : []
    if (findings.some(isNonConform)) nonConformDocs++
  }
  return {
    nonConformDocs,
    analyzedDocs: docs.filter((d) => analyzedIds.has(d.id)).length,
    notAnalyzed: docs.filter((d) => !analyzedIds.has(d.id)).length,
  }
}

// ───────────────── Taux de conformité = dossiers À JOUR / dossiers ─────────────────

/**
 * Sévérité du panneau d'alerte (barème CEO) — la couleur descend d'un cran par gravité RÉELLE :
 * `danger` AMM expirée (produit non commercialisable) > `warning` pièce admin expirée (dette
 * documentaire, l'AMM tient) > `caution` rien d'expiré mais une pièce sous son préavis > `none`.
 */
export type UrgencyLevel = 'none' | 'caution' | 'warning' | 'danger'

/** Pièces à validité d'un produit, ventilées par gravité. Clé = productId. */
interface ValidityBuckets {
  expiredAmm: Map<string, number>
  expiredAdmin: Map<string, number>
  belowLead: Map<string, number>
}

/**
 * Ventile les pièces à VALIDITÉ (`requiresExpiry` : AMM, GMP, COPP, FSC, ML, CoA) par produit :
 * expirées — l'AMM à part, car son expiration sort le produit du marché — et encore valides mais
 * sous leur préavis. Le seuil vient de `renewalLeadDays` (source unique, configurable par l'org),
 * jamais d'une constante locale : sinon le dashboard contredirait la porte de compilation.
 */
function validityBuckets(documents: DocumentRecord[], now: Date): ValidityBuckets {
  const b: ValidityBuckets = {
    expiredAmm: new Map(),
    expiredAdmin: new Map(),
    belowLead: new Map(),
  }
  const bump = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1)
  for (const d of documents) {
    if (!d.expiryDate || !requiresExpiry(d.docType)) continue
    const daysLeft = Math.round((new Date(d.expiryDate).getTime() - now.getTime()) / 86_400_000)
    if (daysLeft <= 0) bump(d.docType === 'amm' ? b.expiredAmm : b.expiredAdmin, d.productId)
    else if (daysLeft <= renewalLeadDays(d.docType)) bump(b.belowLead, d.productId)
  }
  return b
}

/**
 * Un dossier est **À JOUR** si AUCUNE pièce à validité de son produit n'est expirée. Décision CEO :
 * un produit sans aucune pièce à validité compte À JOUR (rien n'est en défaut). « Sous préavis »
 * ne déclasse PAS — le taux dit la vérité légale (expiré / pas expiré), l'alerte reste au panneau.
 */
function productUpToDate(productId: string, b: ValidityBuckets): boolean {
  return (b.expiredAmm.get(productId) ?? 0) + (b.expiredAdmin.get(productId) ?? 0) === 0
}

export interface ComplianceRate {
  upToDate: number
  total: number
  /** % de dossiers à jour, arrondi et borné [0,100] ; `null` si aucun dossier. */
  pct: number | null
}

/**
 * **Taux de conformité global = dossiers à jour / dossiers totaux** (barème CEO : simple et
 * universel, aucune pondération à justifier — une AMM et un GMP pèsent pareil, seule la SÉVÉRITÉ
 * s'affiche, via le panneau). Agrégation sur le **pool de tous les dossiers**, jamais la moyenne
 * des taux pays (sinon un pays à 1 dossier pèserait autant qu'un pays à 12).
 */
export function complianceRate(
  dossiers: DossierRecord[],
  documents: DocumentRecord[],
  now: Date,
): ComplianceRate {
  const list = active(dossiers)
  const b = validityBuckets(active(documents), now)
  const upToDate = list.filter((d) => productUpToDate(d.productId, b)).length
  return {
    upToDate,
    total: list.length,
    pct: list.length > 0 ? Math.round((upToDate / list.length) * 100) : null,
  }
}

// ───────────────── Statistiques par pays (tuiles de couverture) ─────────────────

export interface CountryStat {
  /** Dossiers déposés pour ce pays. */
  dossiers: number
  /** Points urgents : pièces expirées / en fenêtre de renouvellement + dossiers en suspens. */
  urgent: number
  /** Messages d'agence NON LUS pour ce pays. */
  messages: number
  /** Taux de conformité du pays = dossiers À JOUR / dossiers du pays (%). Jamais null : un pays
   *  présent dans la Map a au moins un dossier. */
  conformity: number
  /** Dossiers à jour (numérateur) → permet l'affichage « 6/10 ». */
  upToDate: number
  /** Sévérité du panneau : AMM expirée > pièce admin expirée > sous préavis > rien. */
  urgency: UrgencyLevel
}

/**
 * Statistiques PAR PAYS des tuiles de couverture — 100 % dérivées des données locales.
 *
 * Les pièces (expiration, conformité) sont portées par le **produit**, jamais par le pays : un
 * produit déposé dans plusieurs pays fait donc compter ses pièces pour **chacun** de ces pays —
 * c'est bien le même jeu de pièces à maintenir valide dans chaque pays.
 *
 * VOLONTAIRE : seuls les pays ayant au moins un dossier ACTIF sont dans la Map (tuile « Aucun
 * dossier » sinon). Une correspondance orpheline (dossier supprimé, ou pays différent de celui de
 * son dossier) n'y crée donc pas d'entrée : la tuile mesure la COUVERTURE (où l'on a des dossiers),
 * la cloche et la carte Alertes restant la source pour les messages eux-mêmes.
 */
export function countryStats(input: DashboardInput, now: Date): Map<string, CountryStat> {
  const dossiers = active(input.dossiers)
  const documents = active(input.documents)
  const correspondences = active(input.correspondences)

  // Pays → produits qui y ont un dossier (+ nombre de dossiers par pays).
  const productsByCountry = new Map<string, Set<string>>()
  const dossierCount = new Map<string, number>()
  const dossierProducts = new Map<string, string[]>()
  for (const d of dossiers) {
    if (!d.country) continue
    dossierCount.set(d.country, (dossierCount.get(d.country) ?? 0) + 1)
    const set = productsByCountry.get(d.country) ?? new Set<string>()
    set.add(d.productId)
    productsByCountry.set(d.country, set)
    // Un élément PAR DOSSIER (doublons voulus, contrairement au Set) → numérateur « à jour ».
    const arr = dossierProducts.get(d.country) ?? []
    arr.push(d.productId)
    dossierProducts.set(d.country, arr)
  }

  // Pièces urgentes (expirées ou dans leur fenêtre de renouvellement), par produit.
  const urgentDocs = new Map<string, number>()
  for (const d of documents) {
    if (!d.expiryDate) continue
    const daysLeft = Math.round((new Date(d.expiryDate).getTime() - now.getTime()) / 86_400_000)
    if (daysLeft > renewalLeadDays(d.docType)) continue
    urgentDocs.set(d.productId, (urgentDocs.get(d.productId) ?? 0) + 1)
  }

  // Validité des pièces par produit → taux « dossiers à jour » + sévérité du panneau.
  const buckets = validityBuckets(documents, now)

  // Dossiers en suspens (« complément requis »), par pays.
  const suspended = new Map<string, number>()
  for (const dos of dossiers) {
    if (!dos.country) continue
    if (latestDossierCorrespondence(dos.id, correspondences)?.status === 'suspended') {
      suspended.set(dos.country, (suspended.get(dos.country) ?? 0) + 1)
    }
  }

  // Messages d'agence non lus, par pays. Messages groupés UNE fois (évite un balayage par corr.).
  const msgsByCorr = new Map<string, CorrespondenceMessageRecord[]>()
  for (const m of input.messages) {
    const arr = msgsByCorr.get(m.correspondenceId)
    if (arr) arr.push(m)
    else msgsByCorr.set(m.correspondenceId, [m])
  }
  const lastSeen = new Map(input.reads.map((r) => [r.id, r.lastSeenAt]))
  const unreadByCountry = new Map<string, number>()
  for (const c of correspondences) {
    if (!c.country) continue
    const seenAt = lastSeen.get(c.id)
    const n = (msgsByCorr.get(c.id) ?? []).filter(
      (m) => m.author === 'recipient' && (!seenAt || m.createdAt > seenAt),
    ).length
    if (n > 0) unreadByCountry.set(c.country, (unreadByCountry.get(c.country) ?? 0) + n)
  }

  const out = new Map<string, CountryStat>()
  for (const [code, productIds] of productsByCountry) {
    let urgent = suspended.get(code) ?? 0
    let expiredAmm = 0
    let expiredAdmin = 0
    let belowLead = 0
    for (const pid of productIds) {
      urgent += urgentDocs.get(pid) ?? 0
      expiredAmm += buckets.expiredAmm.get(pid) ?? 0
      expiredAdmin += buckets.expiredAdmin.get(pid) ?? 0
      belowLead += buckets.belowLead.get(pid) ?? 0
    }
    // Taux du pays : un dossier compte UNE fois (pool de ses dossiers), pas une moyenne de produits.
    const pids = dossierProducts.get(code) ?? []
    const upToDate = pids.filter((pid) => productUpToDate(pid, buckets)).length
    const total = pids.length
    out.set(code, {
      dossiers: dossierCount.get(code) ?? 0,
      urgent,
      messages: unreadByCountry.get(code) ?? 0,
      upToDate,
      // `total` ≥ 1 par construction : `productsByCountry` et `dossierProducts` sont peuplés dans
      // la MÊME boucle — un pays présent dans la Map a donc au moins un dossier.
      conformity: Math.round((upToDate / total) * 100),
      // PLANCHER : `urgent` (dossier en suspens, pièce hors `requiresExpiry`) et les seaux de
      // validité sont des ensembles DISJOINTS — un compteur non nul ne doit jamais s'afficher en
      // gris « aucune échéance ». On remonte donc au minimum en `caution`.
      urgency:
        expiredAmm > 0
          ? 'danger'
          : expiredAdmin > 0
            ? 'warning'
            : belowLead > 0 || urgent > 0
              ? 'caution'
              : 'none',
    })
  }
  return out
}

/**
 * Taux de conformité (% des documents analysés qui sont conformes), borné [0,100].
 * `null` si aucun document analysé. Source unique du calcul (dashboard + fiche produit).
 */
export function conformityPct(summary: ConformitySummary): number | null {
  if (summary.analyzedDocs <= 0) return null
  return Math.max(
    0,
    Math.min(
      100,
      Math.round(((summary.analyzedDocs - summary.nonConformDocs) / summary.analyzedDocs) * 100),
    ),
  )
}
