import { z } from 'zod'

import type { I18nValue } from '@/lib/i18n-context'

/** Devises proposées pour le PGHT (ISO — `XOF` = FCFA). Ordre = ordre du sélecteur. */
export const PGHT_CURRENCIES = ['XOF', 'EUR'] as const

/**
 * Une ligne de la table PGHT (Prix Grossiste Hors Taxe) — pays + devise + montant SAISI (string).
 * Structurellement compatible avec `PghtEntry` (lib/db) : le repository l'écrit tel quel dans le
 * `ProductRecord`. Champs lâches (défauts vides) : une ligne en cours de saisie ne bloque jamais.
 */
// Champs REQUIS (pas de `.default()`) : l'UI construit toujours des lignes complètes (chaînes,
// éventuellement vides) → le type d'entrée RHF reste `PghtEntry` (lib/db), pas des champs optionnels.
const pghtEntrySchema = z.object({
  country: z.string().trim().max(3),
  currency: z.enum(PGHT_CURRENCIES),
  amount: z.string().trim().max(24),
})

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
    // Table PGHT multi-pays (0..n lignes) — dernier bloc de l'identification, synchronisé lettre PGHT.
    // Les lignes vides (pays ET montant vides) sont abandonnées à l'enregistrement : jamais de bruit
    // persisté côté serveur ni affiché en lecture seule. L'UI garde une ligne en cours de saisie.
    pght: z
      .array(pghtEntrySchema)
      .max(30)
      .default([])
      .transform((rows) => rows.filter((r) => r.country !== '' || r.amount.trim() !== '')),
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
  pght: [],
  titulaire: '',
  titulaireAdresse: '',
  fabricant: '',
  fabricantAdresse: '',
}
