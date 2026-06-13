import type { DossierFormat } from './module1-tree'

export interface Option {
  code: string
  label: string
}

export const DOSSIER_FORMATS: { code: DossierFormat; label: string }[] = [
  { code: 'ctd', label: 'CTD (PDF)' },
  { code: 'ectd', label: 'eCTD v4' },
]

export const REG_ACTIVITIES: Option[] = [
  { code: 'new_ma', label: 'Nouvelle AMM' },
  { code: 'renewal', label: 'Renouvellement' },
  { code: 'variation', label: 'Variation / Modification' },
]

/** Pays de l'espace UEMOA puis autres CEDEAO. */
export const COUNTRIES: Option[] = [
  { code: 'BJ', label: 'Bénin' },
  { code: 'BF', label: 'Burkina Faso' },
  { code: 'CI', label: "Côte d'Ivoire" },
  { code: 'GW', label: 'Guinée-Bissau' },
  { code: 'ML', label: 'Mali' },
  { code: 'NE', label: 'Niger' },
  { code: 'SN', label: 'Sénégal' },
  { code: 'TG', label: 'Togo' },
  { code: 'NG', label: 'Nigeria' },
  { code: 'GH', label: 'Ghana' },
  { code: 'GN', label: 'Guinée' },
  { code: 'LR', label: 'Liberia' },
  { code: 'SL', label: 'Sierra Leone' },
  { code: 'GM', label: 'Gambie' },
  { code: 'CV', label: 'Cap-Vert' },
]

const labelOf = (opts: Option[], code: string) => opts.find((o) => o.code === code)?.label ?? code
export const activityLabel = (code: string) => labelOf(REG_ACTIVITIES, code)
export const countryLabel = (code: string) => labelOf(COUNTRIES, code)
export const formatLabel = (code: string) => (code === 'ectd' ? 'eCTD v4' : 'CTD (PDF)')

/**
 * Drapeau emoji d'un pays depuis son code ISO alpha-2 (regional indicator symbols).
 * Pur, hors-ligne, déterministe — pas de dépendance. Repli '' si code invalide.
 */
export const countryFlag = (code: string): string =>
  /^[A-Za-z]{2}$/.test(code)
    ? String.fromCodePoint(...[...code.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65))
    : ''
