import type { LifecycleEventRecord } from '@/lib/db'

/**
 * Alerte de RENOUVELLEMENT (jalon M6) — dérivation PURE depuis le journal append-only : l'AMM
 * accordée (`amm_granted`, payload `{ amm_number, valid_until }`) ouvre une fenêtre d'alerte à
 * **valid_until − 6 mois** (délai réglementaire usuel de préparation d'un renouvellement UEMOA/
 * CEDEAO). Rien n'est stocké ni planifié : l'alerte se recalcule à chaque rendu, comme le reste
 * de la spine (ADR-0004). La création du renouvellement reprend le n° d'AMM et la date d'octroi
 * SANS ressaisie — même spine 7 étapes, pas de workflow séparé.
 */

export type RenewalPhase =
  /** AMM valide, fenêtre de préparation pas encore ouverte. */
  | 'ok'
  /** Dans la fenêtre J−6 mois : préparer le renouvellement. */
  | 'due'
  /** `valid_until` dépassé : AMM expirée. */
  | 'expired'
  /** AMM accordée sans `valid_until` exploitable : pas d'échéance calculable. */
  | 'unknown'

export interface RenewalAlert {
  /** N° d'AMM (payload de l'événement) — repris à la création du renouvellement. */
  ammNumber: string | null
  /** Date d'octroi (occurredAt de l'événement, ISO) — reprise à la création. */
  grantedAt: string
  /** Échéance de validité (ISO) ; null si non renseignée à l'octroi. */
  validUntil: string | null
  /** Ouverture de la fenêtre d'alerte (validUntil − 6 mois, ISO) ; null si pas d'échéance. */
  alertFrom: string | null
  phase: RenewalPhase
  /** Jours ENTIERS restants avant expiration (≥ 0) ; null si pas d'échéance. */
  daysLeft: number | null
}

const DAY_MS = 86_400_000

/** `date − n mois` en UTC — l'overflow JS (ex. 31 août − 6 → « 31 février » → début mars) reste
 *  déterministe et sans importance pour une OUVERTURE de fenêtre d'alerte. */
function minusMonthsUtc(iso: string, months: number): string {
  const d = new Date(iso)
  d.setUTCMonth(d.getUTCMonth() - months)
  return d.toISOString()
}

/**
 * Alerte de renouvellement du dossier — `null` tant que l'AMM n'est pas ACCORDÉE (un refus ne se
 * renouvelle pas). Source = DERNIER `amm_granted` du dossier (une AMM re-journalisée corrige la
 * précédente, pattern append-only).
 */
export function deriveRenewalAlert(
  events: LifecycleEventRecord[],
  dossierId: string,
  now: Date,
): RenewalAlert | null {
  let granted: LifecycleEventRecord | undefined
  for (const e of events) {
    if (e.dossierId !== dossierId || e.type !== 'amm_granted') continue
    if (
      !granted ||
      e.occurredAt > granted.occurredAt ||
      (e.occurredAt === granted.occurredAt && e.createdAt > granted.createdAt)
    ) {
      granted = e
    }
  }
  if (!granted) return null

  const p = granted.payload as Record<string, unknown>
  const ammNumber = typeof p.amm_number === 'string' && p.amm_number.trim() ? p.amm_number : null
  const rawUntil = typeof p.valid_until === 'string' ? Date.parse(p.valid_until) : NaN
  if (Number.isNaN(rawUntil)) {
    return {
      ammNumber,
      grantedAt: granted.occurredAt,
      validUntil: null,
      alertFrom: null,
      phase: 'unknown',
      daysLeft: null,
    }
  }

  const validUntil = new Date(rawUntil).toISOString()
  const alertFrom = minusMonthsUtc(validUntil, 6)
  const phase: RenewalPhase =
    now.getTime() >= rawUntil ? 'expired' : now.toISOString() >= alertFrom ? 'due' : 'ok'
  return {
    ammNumber,
    grantedAt: granted.occurredAt,
    validUntil,
    alertFrom,
    phase,
    daysLeft: Math.max(0, Math.ceil((rawUntil - now.getTime()) / DAY_MS)),
  }
}
