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
  { code: 'coa', label: "COA (Certificat d'analyse)", en: 'CoA (Certificate of Analysis)' },
  { code: 'other_admin', label: 'Autre pièce administrative', en: 'Other administrative document' },
]

export function docTypesFor(category: DocumentCategory): DocTypeOption[] {
  return category === 'info' ? INFO_DOC_TYPES : ADMIN_DOC_TYPES
}

/**
 * Pièces ADMINISTRATIVES qu'une ORGANISATION peut porter en propre, selon ses rôles (matrice CEO,
 * `PLAN-ORG-REFERENTIEL.md` §1). AMM exclue partout : elle a son propre onglet/session (MAH).
 *  • titulaire → le CONTRAT titulaire-fabricant seulement (amendement CEO : le contrat vit des
 *    deux côtés) ; les GMP/COA/ML… relèvent du fabricant.
 *  • fabricant / agent (agence locale) → tout sauf AMM (GMP, ML, COPP, FSC, COA, contrat…).
 * Rôles cumulés = UNION. Rôle sans pièce admin (distributeur) → vide.
 */
export function adminDocTypesForPartyRoles(roles: readonly string[]): DocTypeOption[] {
  const codes = new Set<string>()
  for (const role of roles) {
    if (role === 'titulaire') codes.add('contract')
    if (role === 'fabricant' || role === 'agent') {
      for (const d of ADMIN_DOC_TYPES) if (d.code !== 'amm') codes.add(d.code)
    }
  }
  return ADMIN_DOC_TYPES.filter((d) => codes.has(d.code))
}

/** Option AMM seule (session/onglet AMM du MAH — carte avec pays + n° d'AMM). */
export const AMM_DOC_TYPE: DocTypeOption[] = ADMIN_DOC_TYPES.filter((d) => d.code === 'amm')

const INFO_DOC_TYPE_CODES = new Set(INFO_DOC_TYPES.map((d) => d.code))
const ADMIN_DOC_TYPE_CODES = new Set(ADMIN_DOC_TYPES.map((d) => d.code))

/**
 * Catégorie CANONIQUE d'une pièce, déduite de son `docType` (taxonomie ci-dessus) et NON du champ
 * `category` stocké. Une COA déposée avant sa reclassification en pièce admin (#252) porte encore
 * `category: 'info'` en base : classer par `docType` la range correctement en « Pièces admin »
 * partout (onglets de la fiche Organisation). Repli sur la catégorie stockée pour un `docType`
 * inconnu (données futures/legacy hors taxonomie).
 */
export function categoryForDocType(docType: string, fallback: DocumentCategory): DocumentCategory {
  if (INFO_DOC_TYPE_CODES.has(docType)) return 'info'
  if (ADMIN_DOC_TYPE_CODES.has(docType)) return 'admin'
  return fallback
}

export function docTypeLabel(code: string, lang: Lang = 'fr'): string {
  const opt = [...INFO_DOC_TYPES, ...ADMIN_DOC_TYPES].find((d) => d.code === code)
  if (!opt) return code
  return lang === 'en' && opt.en ? opt.en : opt.label
}

/**
 * Pièces dont la date d'expiration est REQUISE au save (Monitor — jalon O) : pièces administratives
 * à validité réglementaire (AMM/GMP/COPP/FSC/ML) + COA. Monitor compare ces dates DÉCLARÉES aux
 * validités requises (admin ≥ 6 mois, COA ≥ 18 mois).
 */
export const EXPIRY_REQUIRED_TYPES = new Set(['coa', 'amm', 'gmp', 'copp', 'fsc', 'ml'])
export function requiresExpiry(docType: string): boolean {
  return EXPIRY_REQUIRED_TYPES.has(docType)
}
