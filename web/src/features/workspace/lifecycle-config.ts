import type { Lang, Translatable } from '@/lib/i18n-context'

/**
 * `country_regulatory_config` — config réglementaire PAR PAYS du cycle de vie (ADR-0004). Référentiel
 * TS statique VERSIONNÉ (maintenu par PR — décision Lot 0 du plan), qui ÉTEND `roadmap-data.ts`
 * (agence, langue officielle, barème/échantillons) avec les invariants opérationnels africains : mode
 * de dépôt/soumission réel, agent local requis, autorisation d'importation d'échantillons.
 *
 * Les 6 jalons du parcours sont CODÉS EN DUR (anti-dérive) ; SEULS ces paramètres varient par pays.
 * Modes semés d'après la liste validée par le CEO (expert RA UEMOA/CEDEAO). Pays « à confirmer » →
 * défaut prudent (dépôt physique) marqué `unconfirmed`.
 */

export type SubmissionMode = 'portal' | 'physical' | 'portal_physical' | 'paper'

export interface CountryLifecycleConfig {
  /** Mode de dépôt/soumission réel auprès de l'agence nationale. */
  submissionMode: SubmissionMode
  /** Un mandataire/agent local est-il requis pour soumettre ? (UEMOA/CEDEAO : oui partout au MVP.) */
  localAgentRequired: boolean
  /** Une autorisation d'importation d'échantillons est-elle requise ? */
  sampleImportAuthRequired: boolean
  /** `true` quand le mode est un DÉFAUT prudent (mode réel non encore confirmé). */
  unconfirmed?: boolean
}

export const SUBMISSION_MODE_LABELS: Record<SubmissionMode, Translatable> = {
  portal: { fr: 'Portail national', en: 'National portal' },
  physical: { fr: 'Dépôt physique', en: 'Physical filing' },
  portal_physical: { fr: 'Portail + dossier physique', en: 'Portal + physical dossier' },
  paper: { fr: 'Papier (CTD)', en: 'Paper (CTD)' },
}

export const submissionModeLabel = (mode: SubmissionMode, lang: Lang = 'fr'): string =>
  SUBMISSION_MODE_LABELS[mode][lang]

/**
 * 10 pays du MVP (8 UEMOA + Ghana + Nigeria), clés ISO alpha-2 (mêmes codes que `COUNTRIES` /
 * `AGENCIES`). Tous : agent local requis + autorisation d'import d'échantillons.
 */
const COUNTRY_LIFECYCLE_CONFIG: Record<string, CountryLifecycleConfig> = {
  // Portail national + dossier physique.
  BJ: {
    submissionMode: 'portal_physical',
    localAgentRequired: true,
    sampleImportAuthRequired: true,
  },
  CI: {
    submissionMode: 'portal_physical',
    localAgentRequired: true,
    sampleImportAuthRequired: true,
  },
  // Portail (NAPAMS, entité locale).
  NG: { submissionMode: 'portal', localAgentRequired: true, sampleImportAuthRequired: true },
  // Dépôt physique.
  TG: { submissionMode: 'physical', localAgentRequired: true, sampleImportAuthRequired: true },
  ML: { submissionMode: 'physical', localAgentRequired: true, sampleImportAuthRequired: true },
  NE: { submissionMode: 'physical', localAgentRequired: true, sampleImportAuthRequired: true },
  // Papier (CTD, pas d'eCTD ; statut vérifié physiquement).
  GH: { submissionMode: 'paper', localAgentRequired: true, sampleImportAuthRequired: true },
  // À confirmer → défaut prudent : dépôt physique.
  BF: {
    submissionMode: 'physical',
    localAgentRequired: true,
    sampleImportAuthRequired: true,
    unconfirmed: true,
  },
  GW: {
    submissionMode: 'physical',
    localAgentRequired: true,
    sampleImportAuthRequired: true,
    unconfirmed: true,
  },
  SN: {
    submissionMode: 'physical',
    localAgentRequired: true,
    sampleImportAuthRequired: true,
    unconfirmed: true,
  },
}

/** Config par défaut (pays hors référentiel) : dépôt physique prudent, à confirmer. */
const DEFAULT_CONFIG: CountryLifecycleConfig = {
  submissionMode: 'physical',
  localAgentRequired: true,
  sampleImportAuthRequired: true,
  unconfirmed: true,
}

export function lifecycleConfigFor(country: string): CountryLifecycleConfig {
  return COUNTRY_LIFECYCLE_CONFIG[country] ?? DEFAULT_CONFIG
}

/** Codes des pays dont le mode de soumission est CONFIRMÉ (≠ défaut prudent) — pour QA/seed. */
export const CONFIRMED_LIFECYCLE_COUNTRIES: string[] = Object.entries(COUNTRY_LIFECYCLE_CONFIG)
  .filter(([, c]) => !c.unconfirmed)
  .map(([code]) => code)

/** Tous les codes du référentiel cycle de vie (10 pays MVP). */
export const LIFECYCLE_COUNTRIES: string[] = Object.keys(COUNTRY_LIFECYCLE_CONFIG)
