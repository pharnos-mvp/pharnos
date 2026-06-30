import type { DossierFormat } from './module1-tree'
import type { Lang } from '@/lib/i18n-context'

export interface Option {
  code: string
  /** FR — étiquette par défaut. */
  label: string
  /** EN — utilisé quand `lang === 'en'`. */
  en?: string
}

export const DOSSIER_FORMATS: { code: DossierFormat; label: string }[] = [
  { code: 'ctd', label: 'CTD (PDF)' },
  { code: 'ectd', label: 'eCTD v4' },
]

export const REG_ACTIVITIES: Option[] = [
  { code: 'new_ma', label: 'Nouvelle AMM', en: 'New MA' },
  { code: 'renewal', label: 'Renouvellement', en: 'Renewal' },
  { code: 'variation', label: 'Variation / Modification', en: 'Variation / Change' },
  // `transfer` retiré du sélecteur (gardé en lecture pour les anciens dossiers, cf. PROCEDURE_LABEL).
  // `notif_response` = répondre à une notification d'agence sur un dossier DÉJÀ soumis (pas de nouveau
  // dossier créé : on rattache la réponse au dossier existant). Cf. [[dossier-lifecycle]] étape 6.
  { code: 'notif_response', label: 'Réponse aux notifications', en: 'Notification response' },
]

/** Pays de l'espace UEMOA puis autres CEDEAO. */
export const COUNTRIES: Option[] = [
  { code: 'BJ', label: 'Bénin', en: 'Benin' },
  { code: 'BF', label: 'Burkina Faso', en: 'Burkina Faso' },
  { code: 'CI', label: "Côte d'Ivoire", en: "Côte d'Ivoire" },
  { code: 'GW', label: 'Guinée-Bissau', en: 'Guinea-Bissau' },
  { code: 'ML', label: 'Mali', en: 'Mali' },
  { code: 'NE', label: 'Niger', en: 'Niger' },
  { code: 'SN', label: 'Sénégal', en: 'Senegal' },
  { code: 'TG', label: 'Togo', en: 'Togo' },
  { code: 'NG', label: 'Nigeria', en: 'Nigeria' },
  { code: 'GH', label: 'Ghana', en: 'Ghana' },
  { code: 'GN', label: 'Guinée', en: 'Guinea' },
  { code: 'LR', label: 'Liberia', en: 'Liberia' },
  { code: 'SL', label: 'Sierra Leone', en: 'Sierra Leone' },
  { code: 'GM', label: 'Gambie', en: 'Gambia' },
  { code: 'CV', label: 'Cap-Vert', en: 'Cape Verde' },
]

const labelOf = (opts: Option[], code: string, lang: Lang) => {
  const o = opts.find((x) => x.code === code)
  if (!o) return code
  return lang === 'en' && o.en ? o.en : o.label
}
export const activityLabel = (code: string, lang: Lang = 'fr') =>
  labelOf(REG_ACTIVITIES, code, lang)
export const countryLabel = (code: string, lang: Lang = 'fr') => labelOf(COUNTRIES, code, lang)
export const formatLabel = (code: string) => (code === 'ectd' ? 'eCTD v4' : 'CTD (PDF)')

/**
 * Drapeau emoji d'un pays depuis son code ISO alpha-2 (regional indicator symbols).
 * Pur, hors-ligne, déterministe — pas de dépendance. Repli '' si code invalide.
 */
export const countryFlag = (code: string): string =>
  /^[A-Za-z]{2}$/.test(code)
    ? String.fromCodePoint(...[...code.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65))
    : ''
