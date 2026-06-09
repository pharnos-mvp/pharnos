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
