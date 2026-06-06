import { z } from 'zod'

/** Schéma d'identification du produit (session 1 du formulaire Catalogue). */
export const productSchema = z.object({
  nomCommercial: z.string().trim().min(1, 'Le nom commercial est requis').max(200),
  dci: z.string().trim().min(1, 'La DCI est requise').max(200),
  dosage: z.string().trim().max(100).default(''),
  forme: z.string().trim().max(100).default(''),
  presentation: z.string().trim().max(200).default(''),
  classeTherapeutique: z.string().trim().max(200).default(''),
  codeAtc: z.string().trim().max(20).default(''),
})

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
}
