// Titres ANGLAIS des rubriques du RCP — DONNÉE GÉNÉRÉE depuis le gabarit verrouillé
// `docs/gabarits/RCP/Gabarit-SmPC-EN-UEMOA.md`, jamais éditée à la main.
//
// POURQUOI UNE COPIE ET PAS UNE LECTURE. L'assemblage des livrables vit désormais côté serveur
// (`job-tick`, à la complétion), et une Edge Function n'embarque que son graphe d'imports : elle ne
// peut pas lire `docs/` à l'exécution. Le harnais U0 lisait le gabarit au lancement ; le serveur a
// besoin de la même table SANS le fichier.
//
// ⚠️ LA DÉRIVE EST IMPOSSIBLE PAR CONSTRUCTION, pas par discipline : `deliverable-titles.test.ts`
// RE-DÉRIVE cette table depuis le gabarit (même algorithme que le harnais) et compare entrée par
// entrée. Toute modification du gabarit non répercutée ici fait échouer `deno test` en CI.
//
// ⚠️ Un titre absent est une ERREUR à l'assemblage, jamais un repli sur le titre français : un
// livrable EN qui glisse un titre FR serait exactement le genre d'incohérence que la revue du
// client relève — sur un document qu'il a payé.
export const DELIVERABLE_TITLES_EN: ReadonlyMap<string, string> = new Map([
  ['1', "NAME OF THE MEDICINAL PRODUCT"],
  ['2', "QUALITATIVE AND QUANTITATIVE COMPOSITION"],
  ['3', "PHARMACEUTICAL FORM"],
  ['4', "CLINICAL PARTICULARS"],
  ['4.1', "Therapeutic indications"],
  ['4.2', "Posology and method of administration"],
  ['4.2-posologie', "Posology"],
  ['4.2-administration', "Method of administration"],
  ['4.3', "Contraindications"],
  ['4.4', "Special warnings and precautions for use"],
  ['4.5', "Interaction with other medicinal products and other forms of interaction"],
  ['4.6', "Fertility, pregnancy and lactation"],
  ['4.6-grossesse', "Pregnancy"],
  ['4.6-allaitement', "Breast-feeding"],
  ['4.6-fertilite', "Fertility"],
  ['4.7', "Effects on ability to drive and use machines"],
  ['4.8', "Undesirable effects"],
  ['4.9', "Overdose"],
  ['5', "PHARMACOLOGICAL PROPERTIES"],
  ['5.1', "Pharmacodynamic properties"],
  ['5.2', "Pharmacokinetic properties"],
  ['5.3', "Preclinical safety data"],
  ['6', "PHARMACEUTICAL PARTICULARS"],
  ['6.1', "List of excipients"],
  ['6.2', "Incompatibilities"],
  ['6.3', "Shelf life"],
  ['6.4', "Special precautions for storage"],
  ['6.5', "Nature and contents of container"],
  ['6.6', "Special precautions for disposal and other handling"],
  ['7', "MARKETING AUTHORISATION HOLDER"],
  ['8', "MARKETING AUTHORISATION NUMBER(S)"],
  ['9', "DATE OF FIRST AUTHORISATION/RENEWAL OF THE AUTHORISATION"],
  ['10', "DATE OF REVISION OF THE TEXT"],
  ['prescription', "CONDITIONS OF PRESCRIPTION AND SUPPLY"],
])
