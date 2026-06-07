export interface WatchItem {
  id: string
  /** Période (YYYY ou YYYY-MM). */
  date: string
  fr: string
  en: string
  source: string
  url?: string
}

/**
 * Veille réglementaire — références en vigueur (zone UEMOA/CEDEAO + international).
 * MVP : liste curatée ; l'ingestion automatique (flux agences / RSS) viendra ensuite.
 */
export const REGULATORY_WATCH: WatchItem[] = [
  {
    id: 'ecowas-ectd-v1',
    date: '2023-08',
    fr: 'Spécifications eCTD ECOWAS-WAHO v1.0',
    en: 'ECOWAS-WAHO eCTD Specifications v1.0',
    source: 'CEDEAO / OOAS',
  },
  {
    id: 'uemoa-04-2020',
    date: '2020',
    fr: 'Règlement UEMOA n°04/2020 — contenu du dossier technique (CTD)',
    en: 'UEMOA Regulation No. 04/2020 — technical dossier content (CTD)',
    source: 'UEMOA',
  },
  {
    id: 'ich-m4',
    date: 'ICH',
    fr: 'ICH M4 — organisation du Common Technical Document (CTD)',
    en: 'ICH M4 — Common Technical Document (CTD) organisation',
    source: 'ICH',
  },
  {
    id: 'who-copp',
    date: 'OMS',
    fr: 'Système OMS de certification (COPP) du commerce international des médicaments',
    en: 'WHO Certification Scheme (COPP) for pharmaceutical products in international commerce',
    source: 'OMS / WHO',
  },
  {
    id: 'bioequiv',
    date: 'UEMOA',
    fr: 'Lignes directrices sur les dispenses d’études de bioéquivalence',
    en: 'Guidelines on bioequivalence study waivers',
    source: 'UEMOA / OOAS',
  },
]
