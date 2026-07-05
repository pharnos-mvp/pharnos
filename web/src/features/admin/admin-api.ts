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

/** Levée quand l'appelant n'est pas super-admin Pharnos (403) — déclenche l'écran « accès refusé ». */
export class AdminForbiddenError extends Error {}

async function callAdmin<T>(action: string, params: Record<string, unknown> = {}): Promise<T> {
  const supabase = await getSupabase()
  if (!supabase) throw new Error('connexion requise')
  const { data, error } = await supabase.functions.invoke('admin', { body: { action, ...params } })
  if (error) {
    const ctx = (error as { context?: Response }).context
    if (ctx?.status === 403 || ctx?.status === 401) throw new AdminForbiddenError('forbidden')
    throw new Error((error as Error).message || 'admin_failed')
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
  if (action === 'delete') return 'danger'
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
    default:
      return { fr: 'Modifié', en: 'Updated' }
  }
}

/** Tendance signée (delta vs période précédente) pour la growth. */
export function trend(current: number, previous: number): { delta: number; up: boolean } {
  return { delta: current - previous, up: current >= previous }
}
