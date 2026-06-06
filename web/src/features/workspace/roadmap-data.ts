export interface AgencyInfo {
  /** Sigle de l'agence. */
  name: string
  /** Nom complet. */
  full: string
}

/**
 * Agences nationales de réglementation pharmaceutique (référence).
 * À valider/compléter par l'expert RA — seules quelques agences sont renseignées avec certitude.
 */
const AGENCIES: Record<string, AgencyInfo> = {
  BJ: { name: 'ABMed', full: 'Agence Béninoise du Médicament et des autres produits de santé' },
  CI: { name: 'AIRP', full: 'Autorité Ivoirienne de Régulation Pharmaceutique' },
  SN: { name: 'ARP', full: 'Agence de Réglementation Pharmaceutique (Sénégal)' },
  BF: { name: 'ANRP', full: 'Agence Nationale de Régulation Pharmaceutique (Burkina Faso)' },
  NG: { name: 'NAFDAC', full: 'National Agency for Food and Drug Administration and Control' },
  GH: { name: 'FDA Ghana', full: 'Food and Drugs Authority (Ghana)' },
}

export function agencyFor(country: string): AgencyInfo {
  return (
    AGENCIES[country] ?? {
      name: 'ANRP',
      full: 'Autorité nationale de réglementation pharmaceutique (à confirmer)',
    }
  )
}
