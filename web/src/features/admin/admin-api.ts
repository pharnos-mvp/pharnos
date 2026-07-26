import { getSupabase } from '@/lib/supabase'
import type { FeatureMap } from '@/features/org/feature-state'

// Client de l'Edge `admin` (jalon M2). Tout passe par l'Edge (service-role, gated is_platform_admin) ;
// le front n'accède JAMAIS aux données cross-org directement. La session JWT est jointe par invoke().

export type PlanTier = 'free' | 'pro' | 'team' | 'business' | 'enterprise'

export interface PlanLimits {
  plan: PlanTier
  max_dossiers: number | null
  dossiers_period: 'lifetime' | 'month'
  monthly_ai_tokens: number | null
  max_seats: number | null
  max_storage_bytes: number | null
  features: FeatureMap
  updated_at?: string
}

export interface QuotaOverride {
  org_id: string
  max_dossiers: number | null
  monthly_ai_tokens: number | null
  max_storage_bytes: number | null
  features: FeatureMap | null
}

export interface AdminOverview {
  generated_at: string
  totals: {
    orgs: number
    orgs_active: number
    users: number
    dossiers: number
    products: number
    ai_tokens_month: number
    ai_calls_month: number
  }
  growth: {
    orgs_30d: number
    orgs_prev_30d: number
    users_30d: number
    users_prev_30d: number
    dossiers_30d: number
    dossiers_prev_30d: number
  }
  health: {
    db_bytes: number
    db_cap_bytes: number
    storage_bytes: number
    storage_cap_bytes: number
    storage_objects: number
  }
  ai_by_kind: Record<string, number>
  recent_audit: Array<{
    org_id: string
    actor_email: string
    entity: string
    action: string
    label: string
    at: string
  }>
}

export interface AdminOrg {
  id: string
  name: string
  plan: PlanTier
  disabled_at: string | null
  created_at: string
  users: number
  dossiers: number
  products: number
  ai_tokens_month: number
  storage_bytes: number
  override: QuotaOverride | null
  limits: PlanLimits
}

export interface AdminUser {
  id: string
  email: string
  created_at: string
  last_sign_in_at: string | null
  is_platform_admin: boolean
  memberships: Array<{ org: string; org_id: string; role: string }>
}

/** Entrée du journal d'audit COMPLET (RPC `admin_audit`, 0053) — `id`+`at` = curseur keyset. */
export interface AdminAuditEntry {
  id: string
  org_id: string
  org_name: string | null
  actor_email: string
  entity: string
  action: string
  label: string
  at: string
}

export interface AdminAuditParams {
  limit?: number
  /** Curseur : `at` + `id` de la DERNIÈRE ligne reçue (voyagent ensemble). */
  beforeAt?: string
  beforeId?: string
  orgId?: string
}

// ── Console Acquisition (0064) — leads, invitations, apport par expert ─────────────────────
export type DemoStatus = 'nouveau' | 'contacte' | 'demo_faite' | 'converti' | 'sans_suite'

export interface DemoRequestRow {
  id: string
  created_at: string
  updated_at: string
  full_name: string
  email: string
  org_type: string
  org_type_other: string | null
  company: string
  job_title: string
  country: string
  status: DemoStatus
  notes: string | null
}

export interface PlatformInviteRow {
  id: string
  code: string
  label: string
  max_uses: number
  used_count: number
  revoked_at: string | null
  expires_at: string | null
  note: string | null
  created_at: string
}

export interface AcquisitionReport {
  generated_at: string
  invites: Array<{
    id: string
    code: string
    label: string
    max_uses: number
    used_count: number
    revoked: boolean
    expires_at: string | null
    created_at: string
    signups: number
    distinct_users: number
    orgs_live: number
    orgs_active: number
  }>
}

// ── Référentiel réglementaire versionné (P4.4) ────────────────────────────────────────────────
export interface RefVersionRow {
  id: string
  label: string
  status: 'draft' | 'published' | 'archived'
  effective_date: string | null
  release_note: string
  published_at: string | null
  created_at: string
  is_baseline: boolean
}

export interface RefEntryLite {
  version_id: string
  country: string
  section: string
}

export interface RefEntryFull extends RefEntryLite {
  id: string
  payload: unknown
  provenance: unknown
  created_at: string
}

export interface RefAdoptionRow {
  org_id: string
  version_id: string
  adopted_at: string
  adopted_by_email: string
}

/** Version + agrégats calculés côté SQL (RPC `admin_ref_overview`, 0076) — jamais tronqués. */
export interface RefVersionSummary extends RefVersionRow {
  entry_count: number
  countries: string[]
  adoption_count: number
}

/**
 * Contenu RÉSOLU courant d'un couple (pays, section) — ce que l'éditeur doit préremplir.
 * Toujours issu de la version publiée la plus applicable, JAMAIS du socle code (préremplir
 * du socle puis publier annulerait la dernière version en silence).
 */
export interface RefCurrentEntry {
  country: string
  section: string
  payload: unknown
  provenance: unknown
  version_label: string
}

export interface RefOverview {
  versions: RefVersionSummary[]
  /** Version publiée la plus applicable AUJOURD'HUI (règle unique 0075/ref-state). */
  latest_id: string | null
  orgs: { id: string; name: string; disabled_at: string | null }[]
  adoptions: RefAdoptionRow[]
  current: RefCurrentEntry[]
  active_dossiers: number
  /** Dossiers actifs épinglés sur AUTRE CHOSE que la version applicable courante. */
  pinned_behind: number
}

export interface RefDraftEntryInput {
  country: string
  /** Miroir de `REF_SECTIONS` (`_shared/ref-payload.ts`) et de la liste blanche de la RPC 0078. */
  section: 'agency' | 'fees' | 'submission' | 'samples' | 'ctd_structure'
  payload: unknown
  /** Source officielle citée — OBLIGATOIRE (l'Edge refuse sans `texte`). */
  provenance: { texte: string; jo?: string; complements?: string; note?: string }
}

/** Levée quand l'appelant n'est pas super-admin Pharnos (403) — déclenche l'écran « accès refusé ». */
export class AdminForbiddenError extends Error {}

/**
 * Échec Edge avec un code métier exploitable (`label_taken`, `effective_date_backdated`…).
 * Le `message` de FunctionsHttpError est toujours générique — le vrai code est dans le CORPS
 * de la réponse (pattern `dossier-purge.ts`), d'où l'extraction asynchrone ci-dessous.
 */
export class AdminApiError extends Error {
  code: string
  constructor(code: string) {
    super(code)
    this.code = code
  }
}

/** Extrait le code d'erreur JSON d'un échec `functions.invoke` (FunctionsHttpError.context). */
async function invokeErrorCode(error: unknown): Promise<string> {
  try {
    const ctx = (error as { context?: Response }).context
    const body = (await ctx?.clone().json()) as { error?: string } | undefined
    if (body?.error) return String(body.error)
  } catch {
    // corps illisible → code générique
  }
  return 'admin_failed'
}

async function callAdmin<T>(action: string, params: Record<string, unknown> = {}): Promise<T> {
  const supabase = await getSupabase()
  if (!supabase) throw new Error('connexion requise')
  const { data, error } = await supabase.functions.invoke('admin', { body: { action, ...params } })
  if (error) {
    const ctx = (error as { context?: Response }).context
    if (ctx?.status === 403 || ctx?.status === 401) throw new AdminForbiddenError('forbidden')
    throw new AdminApiError(await invokeErrorCode(error))
  }
  return (data?.data ?? null) as T
}

export const adminApi = {
  overview: () => callAdmin<AdminOverview>('overview'),
  orgs: () => callAdmin<AdminOrg[]>('orgs'),
  users: () => callAdmin<AdminUser[]>('users'),
  plans: () => callAdmin<PlanLimits[]>('plans'),
  audit: (params: AdminAuditParams = {}) =>
    callAdmin<AdminAuditEntry[]>('audit', params as Record<string, unknown>),
  setPlan: (orgId: string, plan: PlanTier) => callAdmin('set_plan', { orgId, plan }),
  setQuota: (
    orgId: string,
    maxDossiers: number | null,
    monthlyAiTokens: number | null,
    maxStorageBytes: number | null,
  ) => callAdmin('set_quota', { orgId, maxDossiers, monthlyAiTokens, maxStorageBytes }),
  setDisabled: (orgId: string, disabled: boolean) => callAdmin('set_disabled', { orgId, disabled }),
  // Console Acquisition — la modération des leads et des codes reste 100 % côté Edge/service-role.
  acqDemos: () => callAdmin<DemoRequestRow[]>('acq_demos'),
  acqDemoStatus: (id: string, status: DemoStatus, notes?: string | null) =>
    callAdmin('acq_demo_status', { id, status, notes }),
  acqInvites: () => callAdmin<PlatformInviteRow[]>('acq_invites'),
  acqInviteCreate: (input: {
    label: string
    code?: string
    maxUses?: number
    expiresAt?: string | null
    note?: string | null
  }) => callAdmin<PlatformInviteRow>('acq_invite_create', input),
  acqInviteRevoke: (id: string) => callAdmin('acq_invite_revoke', { id }),
  acqReport: () => callAdmin<AcquisitionReport>('acq_report'),
  // Référentiel réglementaire versionné (P4.4) — le service role est le seul chemin d'écriture.
  refOverview: () => callAdmin<RefOverview>('ref_overview'),
  refEntries: (versionId: string) => callAdmin<RefEntryFull[]>('ref_entries', { versionId }),
  refSaveDraft: (input: {
    versionId?: string | null
    label: string
    effectiveDate?: string | null
    releaseNote: string
    entries: RefDraftEntryInput[]
  }) => callAdmin<{ versionId: string }>('ref_save_draft', input),
  refPublish: (versionId: string) => callAdmin('ref_publish', { versionId }),
  refDeleteDraft: (versionId: string) => callAdmin('ref_delete_draft', { versionId }),
  setPlanLimits: (
    plan: PlanTier,
    maxDossiers: number | null,
    dossiersPeriod: 'lifetime' | 'month',
    monthlyAiTokens: number | null,
    maxSeats: number | null,
    maxStorageBytes: number | null,
    features: FeatureMap | null,
  ) =>
    callAdmin('set_plan_limits', {
      plan,
      maxDossiers,
      dossiersPeriod,
      monthlyAiTokens,
      maxSeats,
      maxStorageBytes,
      features,
    }),
}

// ── Formatage & saisie (déterministes, sans dépendance) ────────────────────────────────────
// Les octets s'affichent via la source unique `lib/format-bytes` (FR/EN) — le formatteur local
// Ko/Mo a été résorbé au LOT 8 (dette tracée PLAN-RESTANT).

const BYTES_PER_GB = 1024 * 1024 * 1024
/** Go (saisie admin) → octets. */
export function gbToBytes(gb: number): number {
  return Math.round(gb * BYTES_PER_GB)
}
/** Octets → Go pour pré-remplir un champ (vide = illimité). */
export function bytesToGbInput(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined) return ''
  const gb = bytes / BYTES_PER_GB
  return Number.isInteger(gb) ? String(gb) : String(Math.round(gb * 100) / 100)
}

export function formatInt(n: number, lang: 'fr' | 'en' = 'fr'): string {
  return new Intl.NumberFormat(lang === 'en' ? 'en-US' : 'fr-FR').format(n)
}

// Décimal positif STRICT : `Number()` seul accepterait 0x10/0b11/1e3 — surprenant en god mode.
const DECIMAL_INPUT = /^\d+(\.\d+)?$/

/**
 * Saisie de plafond (dossiers/tokens/sièges) : `''` → `null` (illimité ou défaut du plan) ;
 * entier ≥ 0 → valeur (décimales tronquées) ; **sinon `undefined` = saisie invalide** — l'appelant
 * bloque l'enregistrement (avant LOT 8, « abc » devenait silencieusement ∞ : dangereux en god mode).
 */
export function parseCapInput(s: string): number | null | undefined {
  const v = s.trim()
  if (v === '') return null
  if (!DECIMAL_INPUT.test(v)) return undefined
  const n = Number(v)
  if (!Number.isFinite(n)) return undefined
  return Math.floor(n)
}

/** Saisie stockage en Go (décimales admises) → octets ; mêmes règles que `parseCapInput`. */
export function parseStorageGbInput(s: string): number | null | undefined {
  const v = s.trim()
  if (v === '') return null
  if (!DECIMAL_INPUT.test(v)) return undefined
  const n = Number(v)
  if (!Number.isFinite(n)) return undefined
  return gbToBytes(n)
}

/** Pourcentage borné [0,100] pour les jauges. */
export function pct(value: number, cap: number): number {
  if (cap <= 0) return 0
  return Math.max(0, Math.min(100, Math.round((value / cap) * 100)))
}

/**
 * Recherche client insensible à la casse ET aux accents (« Bénin » ⊇ « benin ») — les listes
 * admin (orgs/users) arrivent COMPLÈTES de l'Edge, le filtre en mémoire est donc honnête
 * (pas de pagination serveur à contourner). Requête vide = tout passe.
 */
const fold = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
export function matchesSearch(query: string, ...fields: (string | null | undefined)[]): boolean {
  const q = fold(query.trim())
  if (!q) return true
  return fields.some((f) => !!f && fold(f).includes(q))
}

// ── Présentation du journal d'audit (partagée Overview / Journal complet) ──────────────────
export type AuditTone = 'success' | 'warning' | 'danger' | 'info'

/** Ton sémantique d'une action d'audit — les actions plateforme (admin_*) ressortent en info. */
export function auditTone(action: string): AuditTone {
  if (action.startsWith('admin_')) return 'info'
  if (action === 'delete' || action === 'purge') return 'danger'
  if (action === 'create') return 'success'
  return 'warning'
}

/** Libellé FR/EN d'une action d'audit (data org + actions god mode des RPC 0021). */
export function auditActionLabel(action: string): { fr: string; en: string } {
  switch (action) {
    case 'create':
      return { fr: 'Créé', en: 'Created' }
    case 'delete':
      return { fr: 'Supprimé', en: 'Deleted' }
    case 'update':
      return { fr: 'Modifié', en: 'Updated' }
    case 'admin_set_plan':
      return { fr: 'Plan (admin)', en: 'Plan (admin)' }
    case 'admin_set_quota':
      return { fr: 'Dérogation quota', en: 'Quota override' }
    case 'admin_set_disabled':
      return { fr: 'Coupe-circuit', en: 'Kill-switch' }
    case 'admin_set_plan_limits':
      return { fr: 'Barème plan', en: 'Plan limits' }
    // Rétention LOT 9 : purge définitive (cron retention-purge actor system / purge-dossier membre).
    case 'purge':
      return { fr: 'Purgé', en: 'Purged' }
    case 'archive':
      return { fr: 'Archivé', en: 'Archived' }
    case 'restore':
      return { fr: 'Restauré', en: 'Restored' }
    default:
      return { fr: 'Modifié', en: 'Updated' }
  }
}

/** Tendance signée (delta vs période précédente) pour la growth. */
export function trend(current: number, previous: number): { delta: number; up: boolean } {
  return { delta: current - previous, up: current >= previous }
}
