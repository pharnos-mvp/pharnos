import type { Translatable } from '@/lib/i18n-context'

export interface AgencyInfo {
  /** Sigle de l'agence. */
  name: string
  /** Nom complet. */
  full: string
  /** Directeur / Responsable (avec titre, ex. « Dr … » / « Pr … »). */
  directeur: string
  /** Sexe du directeur — pour la civilité (« Monsieur le Directeur » / « Madame la Directrice »). */
  sexe: 'M' | 'F'
  /** Adresse postale (sans téléphone/email) — destinataire des lettres. */
  adresse: string
}

/**
 * Agences / directions nationales du médicament — **UEMOA** (source : liste officielle du CEO,
 * `RA-source/Agence Reglementaire Nationale _UEMOA.pdf`). Renseigne le **destinataire** des lettres
 * (agence + directeur + adresse) selon le pays du dossier. Reste éditable in-place.
 */
const AGENCIES: Record<string, AgencyInfo> = {
  BJ: {
    name: 'ABMed',
    full: 'Agence Béninoise du Médicament et des autres produits de santé',
    directeur: 'Dr Yossounon Chabi',
    sexe: 'M',
    adresse: 'Cotonou, Zone résidentielle',
  },
  BF: {
    name: 'ANRP',
    full: 'Agence Nationale de Régulation Pharmaceutique',
    directeur: 'Dr Aminata P. Nacoulma',
    sexe: 'F',
    adresse: 'Ouagadougou, 01 BP 7009',
  },
  CI: {
    name: 'AIRP',
    full: 'Autorité Ivoirienne de Régulation Pharmaceutique',
    directeur: 'Dr Assane Coulibaly',
    sexe: 'M',
    adresse: 'Abidjan, Cocody',
  },
  GW: {
    name: 'DIFALRM',
    full: 'Direção dos Serviços de Farmácia e Medicamentos',
    directeur: 'Dr. Edson Moniz',
    sexe: 'M',
    adresse: 'Bissau, Ministère de la Santé Publique',
  },
  ML: {
    name: 'DPM',
    full: 'Direction de la Pharmacie et du Médicament',
    directeur: 'Pr Fanta Sangho',
    sexe: 'F',
    adresse: 'Bamako, Darsalam, BPE 5202',
  },
  NE: {
    name: 'DPM/MT',
    full: 'Direction de la Pharmacie et de la Médecine Traditionnelle',
    directeur: 'Dr Abdou Bagoudou Rakia',
    sexe: 'F',
    adresse: 'Niamey, Ministère de la Santé',
  },
  SN: {
    name: 'ARP',
    full: 'Agence Sénégalaise de Réglementation Pharmaceutique',
    directeur: 'Dr Oumy Kalsoum Ndiaye Ndao',
    sexe: 'F',
    adresse: 'Dakar, Point E, Rue A x Rue 6',
  },
  TG: {
    name: 'DPML',
    full: 'Direction de la Pharmacie, du Médicament et des Laboratoires',
    directeur: 'Dr NYANSA A. T. Atany',
    sexe: 'M',
    adresse: 'Lomé, Avenue du 2 Février',
  },
  // CEDEAO hors UEMOA — directeur/adresse à compléter (destinataire en marqueurs éditables).
  NG: {
    name: 'NAFDAC',
    full: 'National Agency for Food and Drug Administration and Control',
    directeur: '',
    sexe: 'M',
    adresse: '',
  },
}

/**
 * Langue officielle du pays cible (détection de langue des documents). UEMOA = français par
 * défaut ; exceptions lusophones (Guinée-Bissau, Cap-Vert) et anglophones (CEDEAO non-UEMOA).
 */
const OFFICIAL_LANG: Record<string, string> = {
  GW: 'pt',
  CV: 'pt',
  GH: 'en',
  NG: 'en',
  GM: 'en',
  SL: 'en',
  LR: 'en',
}
export function officialLanguage(country: string): string {
  return OFFICIAL_LANG[country] ?? 'fr'
}

/**
 * Barème & exigences **nationales** réparties par **activité réglementaire** (redevances, échantillons,
 * délais) — alimentent la Roadmap du dossier. Source CEO. **Bénin (ABMed)** renseigné ; les autres pays
 * retombent sur un texte générique tant que leurs barèmes officiels ne sont pas fournis.
 */
export interface RegulatoryProfile {
  /** Devise des redevances (ex. « FCFA »). */
  currency: string
  /** Redevances par activité (montant dans `currency`). Variation scindée mineure/majeure. */
  fees: {
    new_ma?: number
    renewal?: number
    variation_minor?: number
    variation_major?: number
  }
  /** Exigences d'échantillons (lignes bilingues), réparties par activité. */
  samples: {
    /** Nouvelle AMM. */
    new_ma?: Translatable[]
    /** Renouvellement & variation nécessitant des échantillons. */
    renewal_variation?: Translatable[]
    /** Réserve applicable à tous les cas. */
    reserve?: Translatable
  }
  /** Délai de traitement indicatif (jours). */
  processingDays?: number
}

const REG_PROFILES: Record<string, RegulatoryProfile> = {
  BJ: {
    currency: 'FCFA',
    fees: { new_ma: 500000, renewal: 250000, variation_minor: 50000, variation_major: 100000 },
    samples: {
      new_ma: [
        {
          fr: 'Cinq (05) échantillons modèle vente pour toutes les formes galéniques des conditionnements officinaux',
          en: 'Five (05) sales-model samples for all galenic forms of retail (officinal) packaging',
        },
        {
          fr: 'Trois (03) échantillons modèle vente pour toutes les formes galéniques des conditionnements hospitaliers',
          en: 'Three (03) sales-model samples for all galenic forms of hospital packaging',
        },
      ],
      renewal_variation: [
        {
          fr: 'Trois (03) échantillons modèle lors du renouvellement des autorisations et des variations nécessitant des échantillons',
          en: 'Three (03) model samples for the renewal of authorisations and for variations requiring samples',
        },
      ],
      reserve: {
        fr: 'L’ABMed se réserve, selon le cas, le droit de demander des échantillons complémentaires.',
        en: 'ABMed reserves the right, as the case may be, to request additional samples.',
      },
    },
    processingDays: 120,
  },
}

/** Barème national réparti par activité (`undefined` → repli générique sur la Roadmap). */
export function regulatoryProfileFor(country: string): RegulatoryProfile | undefined {
  return REG_PROFILES[country]
}

export function agencyFor(country: string): AgencyInfo {
  return (
    AGENCIES[country] ?? {
      name: 'ANRP',
      full: 'Autorité nationale de réglementation pharmaceutique (à confirmer)',
      directeur: '',
      sexe: 'M',
      adresse: '',
    }
  )
}

/** Civilité du destinataire selon le sexe du directeur (générique si directeur inconnu). */
export function agencyCivilite(a: AgencyInfo): string {
  if (!a.directeur) return 'Monsieur / Madame le Directeur Général'
  return a.sexe === 'F' ? 'Madame la Directrice Générale' : 'Monsieur le Directeur Général'
}

/** Civilité EN du destinataire (le titre « Director General » n'est pas genré en anglais). */
export function agencyCiviliteEn(): string {
  return 'The Director General'
}
