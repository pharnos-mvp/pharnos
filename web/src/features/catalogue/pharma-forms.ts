import type { Translatable } from '@/lib/i18n-context'

/**
 * Formes pharmaceutiques les plus courantes (UEMOA / EMA), triées alphabétiquement (fr).
 * La `value` (libellé fr) est stockée telle quelle dans `product.forme` — déjà propagée aux lettres
 * cover (« Lettre de demande ») et PGHT via `TemplateContext.forme`, donc zéro plomberie côté CTD.
 */
export const PHARMA_FORMS: ReadonlyArray<{ value: string; label: Translatable }> = [
  { value: 'Capsule molle', label: { fr: 'Capsule molle', en: 'Soft capsule' } },
  { value: 'Collyre', label: { fr: 'Collyre', en: 'Eye drops' } },
  { value: 'Comprimé', label: { fr: 'Comprimé', en: 'Tablet' } },
  {
    value: 'Comprimé effervescent',
    label: { fr: 'Comprimé effervescent', en: 'Effervescent tablet' },
  },
  {
    value: 'Comprimé orodispersible',
    label: { fr: 'Comprimé orodispersible', en: 'Orodispersible tablet' },
  },
  { value: 'Comprimé pelliculé', label: { fr: 'Comprimé pelliculé', en: 'Film-coated tablet' } },
  { value: 'Crème', label: { fr: 'Crème', en: 'Cream' } },
  { value: 'Gel', label: { fr: 'Gel', en: 'Gel' } },
  { value: 'Gélule', label: { fr: 'Gélule', en: 'Hard capsule' } },
  { value: 'Gouttes buvables', label: { fr: 'Gouttes buvables', en: 'Oral drops' } },
  { value: 'Granulés', label: { fr: 'Granulés', en: 'Granules' } },
  { value: 'Ovule', label: { fr: 'Ovule', en: 'Pessary' } },
  { value: 'Patch transdermique', label: { fr: 'Patch transdermique', en: 'Transdermal patch' } },
  { value: 'Pommade', label: { fr: 'Pommade', en: 'Ointment' } },
  { value: 'Pommade ophtalmique', label: { fr: 'Pommade ophtalmique', en: 'Eye ointment' } },
  {
    value: 'Poudre pour solution injectable',
    label: { fr: 'Poudre pour solution injectable', en: 'Powder for solution for injection' },
  },
  { value: 'Sachet', label: { fr: 'Sachet', en: 'Sachet' } },
  { value: 'Sirop', label: { fr: 'Sirop', en: 'Syrup' } },
  { value: 'Solution buvable', label: { fr: 'Solution buvable', en: 'Oral solution' } },
  {
    value: 'Solution injectable',
    label: { fr: 'Solution injectable', en: 'Solution for injection' },
  },
  { value: 'Suppositoire', label: { fr: 'Suppositoire', en: 'Suppository' } },
  { value: 'Suspension buvable', label: { fr: 'Suspension buvable', en: 'Oral suspension' } },
]

/**
 * Sentinelle « saisie libre » (option en fin de liste). NON stockée : sélectionner « Autre » bascule
 * le champ en `<input>` texte in-place ; la valeur réelle (ce que l'utilisateur tape) part dans `forme`.
 */
export const AUTRE_FORME = '__autre__'

/** `value` correspond-elle à une forme du catalogue ? (sinon = saisie libre → mode « Autre »). */
export function isKnownForm(value: string): boolean {
  return PHARMA_FORMS.some((f) => f.value === value)
}
