import type { DocumentCategory } from '@/lib/db'
import type { Lang } from '@/lib/i18n-context'

export interface DocTypeOption {
  code: string
  /** FR — étiquette par défaut (affichage direct dans les listes non encore i18n). */
  label: string
  /** EN — utilisé par `docTypeLabel(code, 'en')`. */
  en?: string
}

/** Documents d'information produit (session 2). Vocabulaire contrôlé eCTD-ready. */
export const INFO_DOC_TYPES: DocTypeOption[] = [
  {
    code: 'rcp',
    label: 'RCP (Résumé des Caractéristiques du Produit)',
    en: 'SmPC (Summary of Product Characteristics)',
  },
  { code: 'notice', label: 'Notice', en: 'Package leaflet' },
  { code: 'labeling', label: 'Étiquetage', en: 'Labeling' },
  { code: 'artwork', label: 'Artwork', en: 'Artwork' },
  { code: 'coa', label: "COA (Certificat d'analyse)", en: 'CoA (Certificate of Analysis)' },
  { code: 'other_info', label: 'Autre document d’information', en: 'Other product information' },
]

/** Pièces administratives (session 3). Vocabulaire contrôlé eCTD-ready. */
export const ADMIN_DOC_TYPES: DocTypeOption[] = [
  {
    code: 'amm',
    label: 'AMM (Autorisation de Mise sur le Marché)',
    en: 'MA (Marketing Authorization)',
  },
  {
    code: 'gmp',
    label: 'GMP (Bonnes Pratiques de Fabrication)',
    en: 'GMP (Good Manufacturing Practice)',
  },
  {
    code: 'copp',
    label: 'COPP (Certificat de Produit Pharmaceutique)',
    en: 'CPP (Certificate of Pharmaceutical Product)',
  },
  { code: 'fsc', label: 'FSC (Free Sale Certificate)', en: 'FSC (Free Sale Certificate)' },
  { code: 'ml', label: "ML (Licence d'Établissement)", en: 'ML (Establishment Licence)' },
  { code: 'contract', label: 'Contrat titulaire–fabricant', en: 'Holder–manufacturer agreement' },
  { code: 'other_admin', label: 'Autre pièce administrative', en: 'Other administrative document' },
]

export function docTypesFor(category: DocumentCategory): DocTypeOption[] {
  return category === 'info' ? INFO_DOC_TYPES : ADMIN_DOC_TYPES
}

export function docTypeLabel(code: string, lang: Lang = 'fr'): string {
  const opt = [...INFO_DOC_TYPES, ...ADMIN_DOC_TYPES].find((d) => d.code === code)
  if (!opt) return code
  return lang === 'en' && opt.en ? opt.en : opt.label
}
