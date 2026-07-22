/**
 * Composition d'un produit : apparie chaque **DCI** à son **dosage** pour les produits
 * **multi-molécules** (forme officielle « DCI₁ dose₁ + DCI₂ dose₂ + … »).
 *
 * `dci` et `dosage` sont deux champs texte libres. On les **zippe** quand les deux listes ont la
 * **même longueur (> 1)** ; sinon (mono-molécule, ou comptes incohérents) on retombe sur la
 * concaténation simple « DCI dosage » — jamais d'erreur, jamais de perte d'info.
 *
 * SÉPARATEURS asymétriques (volontaire) : la liste de **DCI** se coupe sur `+`, `,` ou `;` (les
 * dénominations n'ont pas de virgule interne), mais le **dosage** UNIQUEMENT sur `+`/`;` — en
 * français la virgule est un séparateur **décimal** (« 2,5 mg »), la découper casserait les valeurs.
 * → « Hydroxyde d'aluminium, … + Oxéthazaïne » / « 250 mg + … + 10 mg » s'apparie correctement.
 */
function splitMolecules(s: string, sep: RegExp): string[] {
  return s
    .split(sep)
    .map((p) => p.trim())
    .filter(Boolean)
}

export function formatComposition(dci: string, dosage: string): string {
  const dcis = splitMolecules(dci, /[+,;]/)
  const doses = splitMolecules(dosage, /[+;]/)
  if (dcis.length > 1 && dcis.length === doses.length) {
    return dcis.map((d, i) => `${d} ${doses[i]}`).join(' + ')
  }
  return [dci.trim(), dosage.trim()].filter(Boolean).join(' ')
}
