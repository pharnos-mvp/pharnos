// Verrou de quota IA par organisation (jalon M1) — partagé par regafy-ai / translate / upgrade.
// Gate AVANT l'appel Vertex (consume_ai_quota, fail-closed) ; enregistrement APRÈS (record_ai_usage).
import type { Usage } from './usage.ts'

interface RpcClient {
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }>
}

export interface QuotaVerdict {
  allowed: boolean
  reason?: string
  cap?: number | null
  remaining?: number | null
  /** Code HTTP à renvoyer si bloqué. */
  status: number
}

const STATUS_BY_REASON: Record<string, number> = {
  quota_exceeded: 429,
  feature_disabled: 403,
  org_disabled: 403,
  no_org: 403,
  quota_check_failed: 503,
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Org ACTIVE déclarée par le client (header `x-pharnos-org`) — CS1 : un utilisateur multi-org
 * (agence servant plusieurs labos) impute sa consommation à l'org active, pas à la plus ancienne.
 * Déclaratif seulement : la RPC (`caller_org_id(p_org)`, 0049) vérifie l'appartenance côté SQL
 * (fail-closed) ; un header forgé donne `no_org` → 403. Absent = héritage (plus ancienne org).
 */
export function activeOrgFromRequest(req: Request): string | null {
  const raw = req.headers.get('x-pharnos-org')?.trim() ?? ''
  return UUID_RE.test(raw) ? raw.toLowerCase() : null
}

/**
 * Gate de quota : interroge `consume_ai_quota`. **Fail-closed** — si le compteur est injoignable,
 * on refuse (un outage du compteur ne doit pas distribuer du Gemini illimité).
 */
export async function checkAiQuota(
  supabase: RpcClient,
  kind: string,
  orgId: string | null = null,
): Promise<QuotaVerdict> {
  try {
    const { data, error } = await supabase.rpc('consume_ai_quota', { p_kind: kind, p_org: orgId })
    if (error || !data || typeof data !== 'object') {
      return { allowed: false, reason: 'quota_check_failed', status: 503 }
    }
    const d = data as {
      allowed?: boolean
      reason?: string
      cap?: number | null
      remaining?: number | null
    }
    if (d.allowed) {
      return { allowed: true, cap: d.cap ?? null, remaining: d.remaining ?? null, status: 200 }
    }
    const reason = d.reason ?? 'quota_exceeded'
    return {
      allowed: false,
      reason,
      cap: d.cap ?? null,
      remaining: d.remaining ?? null,
      status: STATUS_BY_REASON[reason] ?? 429,
    }
  } catch {
    return { allowed: false, reason: 'quota_check_failed', status: 503 }
  }
}

/**
 * Enregistre les tokens consommés (best-effort). Survit à la réponse via `EdgeRuntime.waitUntil`
 * quand il est disponible (chemin streaming : l'enregistrement a lieu après l'envoi du flux).
 */
export function recordAiUsage(
  supabase: RpcClient,
  kind: string,
  usage: Usage,
  orgId: string | null = null,
): void {
  if (usage.in <= 0 && usage.out <= 0) return
  const p = Promise.resolve(
    supabase.rpc('record_ai_usage', { p_kind: kind, p_in: usage.in, p_out: usage.out, p_org: orgId }),
  )
    .then(() => {})
    .catch(() => {})
  try {
    ;(
      globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }
    ).EdgeRuntime?.waitUntil?.(p)
  } catch {
    /* waitUntil indisponible : la promesse tourne quand même (best-effort) */
  }
}
