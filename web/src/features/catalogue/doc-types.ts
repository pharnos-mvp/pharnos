import type { DocumentCategory } from '@/lib/db'

export interface DocTypeOption {
  code: string
  label: string
}

/** Documents d'information produit (session 2). Vocabulaire contrôlé eCTD-ready. */
export const INFO_DOC_TYPES: DocTypeOption[] = [
  { code: 'rcp', label: 'RCP (Résumé des Caractéristiques du Produit)' },
  { code: 'notice', label: 'Notice' },
  { code: 'labeling', label: 'Étiquetage' },
  { code: 'artwork', label: 'Artwork' },
  { code: 'coa', label: "COA (Certificat d'analyse)" },
  { code: 'other_info', label: 'Autre document d’information' },
]

/** Pièces administratives (session 3). Vocabulaire contrôlé eCTD-ready. */
export const ADMIN_DOC_TYPES: DocTypeOption[] = [
  { code: 'amm', label: 'AMM (Autorisation de Mise sur le Marché)' },
  { code: 'gmp', label: 'GMP (Bonnes Pratiques de Fabrication)' },
  { code: 'copp', label: 'COPP (Certificat de Produit Pharmaceutique)' },
  { code: 'fsc', label: 'FSC (Free Sale Certificate)' },
  { code: 'ml', label: "ML (Licence d'Établissement)" },
  { code: 'contract', label: 'Contrat titulaire–fabricant' },
  { code: 'other_admin', label: 'Autre pièce administrative' },
]

export function docTypesFor(category: DocumentCategory): DocTypeOption[] {
  return category === 'info' ? INFO_DOC_TYPES : ADMIN_DOC_TYPES
}

export function docTypeLabel(code: string): string {
  return [...INFO_DOC_TYPES, ...ADMIN_DOC_TYPES].find((d) => d.code === code)?.label ?? code
}
