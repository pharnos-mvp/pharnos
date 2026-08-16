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
  /**
   * Prix affiché (barème) — OPTIONNEL tant que la grille chiffrée n'est pas validée par le CEO
   * (input LOT 0 du PLAN-LANCEMENT). Dès le go : renseigner ici (ex. { fr: '25 000 FCFA/mois' })
   * et le Compte + la landing l'affichent sans autre changement. Display only, pas d'encaissement.
   */
  price?: Translatable
  /**
   * Même prix, avec l'équivalent en FCFA — affiché À LA PLACE de `price` aux visiteurs de la zone
   * FCFA (règle CEO du 2026-08-16 : « euro (FCFA) pour l'Afrique, euro seul ailleurs », cf.
   * `zoneFcfa()` dans `@/lib/money`). Chaîne complète et non un fragment à concaténer : un prix
   * est ce qu'on relit le plus souvent et le moins volontiers en morceaux.
   */
  priceXof?: Translatable
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
    price: { fr: '149 € / mois', en: '149 € / mo' },
    priceXof: { fr: '149 € (100 000 FCFA) / mois', en: '149 € (100,000 FCFA) / mo' },
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
    price: { fr: '179 € / utilisateur / mois', en: '179 € / user / mo' },
    priceXof: {
      fr: '179 € (120 000 FCFA) / utilisateur / mois',
      en: '179 € (120,000 FCFA) / user / mo',
    },
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
    price: { fr: '599 € / mois', en: '599 € / mo' },
    priceXof: { fr: '599 € (400 000 FCFA) / mois', en: '599 € (400,000 FCFA) / mo' },
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
    price: { fr: 'Sur devis', en: 'Custom quote' },
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
