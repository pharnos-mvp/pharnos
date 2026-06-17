import type { Translatable } from '@/lib/i18n-context'
import type { PlanTier } from './use-org-plan'

/**
 * Catalogue des plans pour la présentation (cartes d'inscription + mise à niveau).
 * Données d'affichage uniquement — la VÉRITÉ des plafonds/features est côté serveur
 * (`plan_limits`, migration 0025) ; on duplique ici les arguments de vente, pas l'enforcement.
 * `team` = la fonctionnalité Équipe (invitations) est-elle incluse (cf. features.team du seed).
 */
export interface PlanCatalogEntry {
  tier: PlanTier
  tagline: Translatable
  highlights: Translatable[]
  team: boolean
  recommended?: boolean
}

export const PLAN_CATALOG: PlanCatalogEntry[] = [
  {
    tier: 'free',
    tagline: { fr: 'Pour découvrir', en: 'To get started' },
    highlights: [
      {
        fr: '1 dépôt / mois · brouillons illimités',
        en: '1 submission / month · unlimited drafts',
      },
      { fr: 'Monitor — vérifications gratuites', en: 'Monitor — free checks' },
      { fr: 'Correspondance', en: 'Correspondence' },
    ],
    team: false,
  },
  {
    tier: 'pro',
    tagline: { fr: 'Pour un expert RA', en: 'For a single RA expert' },
    highlights: [
      {
        fr: '5 dépôts / mois · brouillons illimités',
        en: '5 submissions / month · unlimited drafts',
      },
      { fr: '200 000 tokens IA (Regafy)', en: '200,000 AI tokens (Regafy)' },
      { fr: 'Traduction, audit, modèles avancés', en: 'Translation, audit, advanced templates' },
    ],
    team: false,
    recommended: true,
  },
  {
    tier: 'team',
    tagline: { fr: 'Pour une équipe', en: 'For a team' },
    highlights: [
      { fr: '15 dépôts / mois', en: '15 submissions / month' },
      { fr: '1 000 000 tokens IA', en: '1,000,000 AI tokens' },
      { fr: 'Équipe & rôles (invitations)', en: 'Team & roles (invitations)' },
      { fr: 'Tout le plan Pro', en: 'Everything in Pro' },
    ],
    team: true,
  },
  {
    tier: 'business',
    tagline: { fr: 'Pour un laboratoire établi', en: 'For an established lab' },
    highlights: [
      { fr: '50 dépôts / mois', en: '50 submissions / month' },
      { fr: '5 000 000 tokens IA', en: '5,000,000 AI tokens' },
      { fr: 'Équipe illimitée', en: 'Unlimited team' },
      { fr: 'Tout le plan Team', en: 'Everything in Team' },
    ],
    team: true,
  },
  {
    tier: 'enterprise',
    tagline: { fr: 'Sur-mesure', en: 'Tailored' },
    highlights: [
      { fr: 'Dépôts illimités', en: 'Unlimited submissions' },
      { fr: 'Tokens IA illimités', en: 'Unlimited AI tokens' },
      { fr: 'Accompagnement dédié', en: 'Dedicated support' },
    ],
    team: true,
  },
]

/** La fonctionnalité Équipe est-elle incluse dans ce plan ? (gate UI du bloc invitation). */
export function planHasTeam(tier: PlanTier): boolean {
  return PLAN_CATALOG.find((p) => p.tier === tier)?.team ?? false
}
