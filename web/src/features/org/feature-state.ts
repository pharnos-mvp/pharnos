import type { Translatable } from '@/lib/i18n-context'
import type { PlanTier } from './use-org-plan'

/**
 * Modèle de gestion des features à 3 états (god mode, migration 0038). Chaque feature d'un plan vaut :
 *   - `hidden`  (Masquée)  — invisible côté front ;
 *   - `teaser`  (Vitrine)  — visible, clic → upsell « Incluse dès le plan X » (tunnel de conversion) ;
 *   - `enabled` (Activée)  — opérationnelle.
 * Distinction d'or : la FEATURE est le robinet (offre on/off) ; le QUOTA est le débit (tokens/dossiers/
 * stockage). L'IA « Activée » = `features.regafy = 'enabled'` ET `monthly_ai_tokens > 0`.
 */
export type FeatureState = 'hidden' | 'teaser' | 'enabled'

/** Carte d'états par clé de feature, telle que renvoyée par le serveur (`plan_limits.features`). */
export type FeatureMap = Record<string, FeatureState>

/** Source tolérante : la nouvelle carte d'états OU l'ancien format booléen (fenêtre de bascule / rollback). */
type FeatureSource = Record<string, FeatureState | boolean> | null | undefined

/**
 * État effectif d'une feature, TOLÉRANT à l'ancien format booléen (le temps que tout le parc bascule, et
 * en cas de rollback) : `true → enabled`, `false → teaser`, état → lui-même, absent/inconnu → `hidden`.
 */
export function featureState(features: FeatureSource, key: string): FeatureState {
  const v = features?.[key]
  if (v === true) return 'enabled'
  if (v === false) return 'teaser'
  if (v === 'enabled' || v === 'teaser' || v === 'hidden') return v
  return 'hidden'
}

/** La feature est-elle opérationnelle (Activée) ? — gate des actions réelles. */
export function isEnabled(features: FeatureSource, key: string): boolean {
  return featureState(features, key) === 'enabled'
}

/** La feature est-elle en Vitrine (visible mais clic → upsell) ? */
export function isTeaser(features: FeatureSource, key: string): boolean {
  return featureState(features, key) === 'teaser'
}

/** La feature est-elle visible (Vitrine OU Activée) ? — gate de l'affichage du bouton/entrée. */
export function isVisible(features: FeatureSource, key: string): boolean {
  return featureState(features, key) !== 'hidden'
}

/** Libellés du vocabulaire validé CEO (admin god mode). */
export const FEATURE_STATE_LABEL: Record<FeatureState, Translatable> = {
  hidden: { fr: 'Masquée', en: 'Hidden' },
  teaser: { fr: 'Vitrine', en: 'Preview' },
  enabled: { fr: 'Activée', en: 'Enabled' },
}

/** Ordre d'affichage des états dans les menus admin. */
export const FEATURE_STATES: FeatureState[] = ['hidden', 'teaser', 'enabled']

/**
 * Métadonnées des features connues — source UNIQUE partagée par l'admin (god mode), l'upsell et les gates UI.
 * `minPlan` = plan le plus bas où la feature est Activée par défaut : argument de vente pour l'upsell
 * (DISPLAY ONLY, comme `plan-catalog` ; la VÉRITÉ de l'entitlement reste 100 % serveur via `plan_limits`).
 */
export interface FeatureMeta {
  key: string
  label: Translatable
  minPlan: PlanTier
}

export const FEATURES: FeatureMeta[] = [
  {
    key: 'team',
    label: { fr: 'Équipe (multi-utilisateurs)', en: 'Team (multi-user)' },
    minPlan: 'team',
  },
  {
    key: 'regafy',
    label: { fr: 'Regafy (copilote IA)', en: 'Regafy (AI copilot)' },
    minPlan: 'pro',
  },
  { key: 'translation', label: { fr: 'Traduction', en: 'Translation' }, minPlan: 'pro' },
  { key: 'correspondence', label: { fr: 'Correspondance', en: 'Correspondence' }, minPlan: 'free' },
  { key: 'audit_global', label: { fr: 'Audit global', en: 'Global audit' }, minPlan: 'pro' },
  {
    key: 'upgrade_templates',
    label: { fr: 'Mise en conformité', en: 'Template upgrade' },
    minPlan: 'pro',
  },
  {
    key: 'cloud_sync',
    label: { fr: 'Sauvegarde & synchro cloud', en: 'Cloud backup & sync' },
    minPlan: 'pro',
  },
]

export const FEATURE_BY_KEY: Record<string, FeatureMeta> = Object.fromEntries(
  FEATURES.map((f) => [f.key, f]),
)
