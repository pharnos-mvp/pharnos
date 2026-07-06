import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'

import { setRenewalLeadOverrides } from '@/features/dashboard/renewal-config'
import { getActiveOrgId } from '@/features/org/active-org'
import { getSupabase } from '@/lib/supabase'

/**
 * Config des RELANCES par organisation (page « Relances ») — RPC `get/set_reminder_settings` (0055).
 * Deux natures : domaine A (Roadmap, seuils APRÈS inactivité) et domaine B (Monitoring, préavis AVANT
 * expiration). Lecture cachée 5 min (comme `useOrgPlan`) ; écriture admin-only côté serveur.
 */

/** Types de pièces à préavis (domaine B) — vocabulaire contrôlé, aligné migration 0055 + doc-types. */
export const MONITORING_PIECE_TYPES = ['gmp', 'copp', 'fsc', 'ml', 'amm', 'coa'] as const
export type MonitoringPieceType = (typeof MONITORING_PIECE_TYPES)[number]

export type LeadDaysMap = Record<string, number>

export interface ReminderSettings {
  /** Domaine A — relances auto Roadmap activées. */
  roadmap_auto_enabled: boolean
  /** Jours d'inactivité avant relance de l'agent local (revue/dépôt/soumission). */
  roadmap_agent_days: number
  /** Jours d'inactivité avant relance de l'agence nationale (instruction). */
  roadmap_agency_days: number
  /** Canal e-mail de la relance auto (l'affichage in-app reste toujours actif). */
  roadmap_email_enabled: boolean
  /** Domaine B — relance auto du fabricant activée (envoi à venir ; les préavis pilotent déjà les alertes). */
  monitoring_auto_enabled: boolean
  /** Préavis (jours avant expiration) par type de pièce. */
  monitoring_lead_days: LeadDaysMap
}

/** Préavis par défaut (jours), clés littérales → indexation garantie `number` (noUncheckedIndexedAccess). */
export const DEFAULT_LEAD_DAYS: Record<MonitoringPieceType, number> = {
  gmp: 180,
  copp: 180,
  fsc: 180,
  ml: 180,
  amm: 180,
  coa: 547,
}

/** Défauts — MIROIR EXACT de la migration 0055 (repli hors-ligne + valeurs initiales du formulaire). */
export const REMINDER_DEFAULTS: ReminderSettings = {
  roadmap_auto_enabled: true,
  roadmap_agent_days: 14,
  roadmap_agency_days: 60,
  roadmap_email_enabled: true,
  monitoring_auto_enabled: true,
  monitoring_lead_days: { ...DEFAULT_LEAD_DAYS },
}

/** Bornes du domaine A (jours). */
export const REMINDER_DAYS_MIN = 1
export const REMINDER_DAYS_MAX = 365
/** Plancher LÉGAL du domaine B : lancer un renouvellement ≥ 90 j avant l'expiration. */
export const MONITORING_LEAD_FLOOR = 90
export const MONITORING_LEAD_MAX = 3650

const clampInt = (v: unknown, min: number, max: number, fallback: number): number => {
  const n = typeof v === 'number' ? v : Number(v)
  if (!Number.isFinite(n)) return fallback
  return Math.min(Math.max(Math.round(n), min), max)
}

/** Normalise la sortie du RPC vers un `ReminderSettings` complet et borné (défense en profondeur). */
export function normalizeReminderSettings(raw: unknown): ReminderSettings {
  const r = (raw ?? {}) as Partial<Record<keyof ReminderSettings, unknown>>
  const leadRaw = (r.monitoring_lead_days ?? {}) as Record<string, unknown>
  const lead: LeadDaysMap = {}
  for (const key of MONITORING_PIECE_TYPES) {
    lead[key] = clampInt(
      leadRaw[key],
      MONITORING_LEAD_FLOOR,
      MONITORING_LEAD_MAX,
      DEFAULT_LEAD_DAYS[key],
    )
  }
  return {
    roadmap_auto_enabled: r.roadmap_auto_enabled !== false,
    roadmap_agent_days: clampInt(
      r.roadmap_agent_days,
      REMINDER_DAYS_MIN,
      REMINDER_DAYS_MAX,
      REMINDER_DEFAULTS.roadmap_agent_days,
    ),
    roadmap_agency_days: clampInt(
      r.roadmap_agency_days,
      REMINDER_DAYS_MIN,
      REMINDER_DAYS_MAX,
      REMINDER_DEFAULTS.roadmap_agency_days,
    ),
    roadmap_email_enabled: r.roadmap_email_enabled !== false,
    monitoring_auto_enabled: r.monitoring_auto_enabled !== false,
    monitoring_lead_days: lead,
  }
}

/** Config effective de l'org active — RPC `get_reminder_settings` (org explicite CS1). Repli = défauts. */
export function useReminderSettings() {
  const orgId = getActiveOrgId()
  return useQuery<ReminderSettings>({
    queryKey: ['reminder-settings', orgId],
    queryFn: async () => {
      const supabase = await getSupabase()
      if (!supabase) return REMINDER_DEFAULTS
      const { data, error } = await supabase.rpc('get_reminder_settings', { p_org: orgId })
      if (error || !data) return REMINDER_DEFAULTS
      return normalizeReminderSettings(data)
    },
    staleTime: 5 * 60_000,
  })
}

/** Écrit la config (admin-only côté serveur). Lève en cas d'échec (offline, non-admin, réseau). */
export async function saveReminderSettings(s: ReminderSettings): Promise<void> {
  const supabase = await getSupabase()
  if (!supabase) throw new Error('offline')
  const { error } = await supabase.rpc('set_reminder_settings', {
    p_roadmap_auto: s.roadmap_auto_enabled,
    p_agent_days: s.roadmap_agent_days,
    p_agency_days: s.roadmap_agency_days,
    p_roadmap_email: s.roadmap_email_enabled,
    p_monitoring_auto: s.monitoring_auto_enabled,
    p_lead_days: s.monitoring_lead_days,
    p_org: getActiveOrgId(),
  })
  if (error) throw new Error((error as { message?: string }).message || 'failed')
}

/**
 * Alimente l'override des préavis du monitoring (domaine B) depuis la config org — à monter UNE fois
 * dans l'app-shell. `renewalLeadDays` lit ensuite ces valeurs partout (dashboard, cockpit, fiche
 * produit…). Change rarement ; la réactivité fine se fait au remontage de surface après sauvegarde.
 */
export function useApplyReminderLeadDays(): void {
  const { data } = useReminderSettings()
  useEffect(() => {
    setRenewalLeadOverrides(data?.monitoring_lead_days)
  }, [data])
}
