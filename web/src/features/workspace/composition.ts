/**
 * Composition d'un produit : apparie chaque **DCI** à son **dosage** pour les produits
 * **multi-molécules** (forme officielle « DCI₁ dose₁ + DCI₂ dose₂ + … »).
 *
 * `dci` et `dosage` sont deux champs texte libres saisis avec le même séparateur « + »
 * (ex. « METRONIDAZOLE + SULFATE DE NEOMYCINE » / « 200 mg + 35 000 UI »). Quand les deux listes
 * ont la **même longueur (> 1)**, on les **zippe** ; sinon (mono-molécule, ou comptes incohérents)
 * on retombe sur la concaténation simple « DCI dosage » — jamais d'erreur, jamais de perte d'info.
 */
function splitMolecules(s: string): string[] {
  return s
    .split('+')
    .map((p) => p.trim())
    .filter(Boolean)
}

export function formatComposition(dci: string, dosage: string): string {
  const dcis = splitMolecules(dci)
  const doses = splitMolecules(dosage)
  if (dcis.length > 1 && dcis.length === doses.length) {
    return dcis.map((d, i) => `${d} ${doses[i]}`).join(' + ')
  }
  return [dci.trim(), dosage.trim()].filter(Boolean).join(' ')
}
