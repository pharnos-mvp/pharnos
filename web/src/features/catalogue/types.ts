import { z } from 'zod'

import type { I18nValue } from '@/lib/i18n-context'

/**
 * Construit le schéma d'identification produit avec messages de validation localisés.
 * Le formulaire le recrée à la langue courante ; les usages non-UI emploient `productSchema`.
 */
export function makeProductSchema(t: I18nValue['t']) {
  return z.object({
    nomCommercial: z
      .string()
      .trim()
      .min(1, t({ fr: 'Le nom commercial est requis', en: 'Trade name is required' }))
      .max(200),
    dci: z
      .string()
      .trim()
      .min(1, t({ fr: 'La DCI est requise', en: 'INN (DCI) is required' }))
      .max(200),
    dosage: z.string().trim().max(100).default(''),
    forme: z.string().trim().max(100).default(''),
    presentation: z.string().trim().max(200).default(''),
    classeTherapeutique: z.string().trim().max(200).default(''),
    codeAtc: z.string().trim().max(20).default(''),
    titulaire: z.string().trim().max(300).default(''),
    titulaireAdresse: z.string().trim().max(300).default(''),
    fabricant: z.string().trim().max(300).default(''),
    fabricantAdresse: z.string().trim().max(300).default(''),
  })
}

/** Schéma canonique (messages FR) — inférence de type + usages non-UI (repository). */
export const productSchema = makeProductSchema((s) => s.fr)

/** Valeurs de sortie (validées, défauts appliqués) — utilisées par le formulaire. */
export type ProductFormValues = z.infer<typeof productSchema>

/** Valeurs d'entrée (champs optionnels grâce aux défauts) — acceptées par le repository. */
export type ProductInput = z.input<typeof productSchema>

export const EMPTY_PRODUCT: ProductFormValues = {
  nomCommercial: '',
  dci: '',
  dosage: '',
  forme: '',
  presentation: '',
  classeTherapeutique: '',
  codeAtc: '',
  titulaire: '',
  titulaireAdresse: '',
  fabricant: '',
  fabricantAdresse: '',
}
