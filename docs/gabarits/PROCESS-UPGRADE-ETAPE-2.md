# Upgrade — Étape 2 : la traduction

> **Statut : VERROUILLÉ** par le CEO le 29 juillet 2026, sur la référence RCP Gynoril.
> Prérequis : étape 1 validée (`PROCESS-UPGRADE-ETAPE-1.md`). Étape 3 (mise en page) à verrouiller.

---

## 0. Qui traduit

Le traducteur est un **docteur en pharmacie, expert senior en traduction réglementaire**, maîtrisant
ICH, MedDRA, QRD, EDQM et le cadre UEMOA. Ce n'est pas une traduction générale : c'est un exercice
terminologique où chaque libellé a une forme officielle unique dans chaque langue.

## 1. La règle absolue — le gabarit ne change pas

**La version traduite conserve EXACTEMENT le gabarit UEMOA.** Le livrable est destiné au marché
UEMOA, quelle que soit sa langue : on ne bascule jamais vers la structure QRD européenne parce
qu'on écrit en anglais.

Conséquences concrètes :

- Numérotation identique, y compris `7.1 Titulaire / 7.2 Fabricant` — que le QRD européen ne connaît pas.
- La rubrique « Conditions de prescription et de délivrance » reste **dans le corps du document**,
  alors que le QRD la renvoie à l'annexe étiquetage.
- Aucune rubrique ajoutée, aucune supprimée, aucun ordre modifié.

## 2. Le statut se recopie, jamais ne se recalcule

Une rubrique sans information dans la langue source **ne peut pas** devenir renseignée dans la
langue cible. Le marqueur se traduit, la lacune se conserve :

| FR | EN |
|---|---|
| `[Non fourni, à compléter]` | `[Not provided, to be completed]` |

**Contrôle de recette, mécanique** : le nombre de rubriques, de sous-rubriques et de marqueurs est
identique des deux côtés. Sur la référence Gynoril : **11 rubriques, 20 sous-rubriques,
24 marqueurs**. Un écart signale une rubrique inventée ou perdue à la traduction.

## 3. La terminologie prime sur la traduction littérale

Chaque langue possède **sa** formule officielle. Traduire mot à mot produit un texte compréhensible
et non conforme.

| Français | Anglais | Référentiel |
|---|---|---|
| Excipient(s) à effet notoire | Excipient(s) with known effect | QRD |
| conformément à la réglementation en vigueur | in accordance with local requirements | QRD, rubrique 6.6 |
| Classe pharmacothérapeutique | Pharmacotherapeutic group | QRD, rubrique 5.1 |
| Déclaration des effets indésirables suspectés | Reporting of suspected adverse reactions | QRD, rubrique 4.8 |
| Troubles généraux et anomalies au site d'administration | General disorders and administration site conditions | MedDRA |
| Ovule | **Pessary** | EDQM |
| Voie vaginale | Vaginal use | EDQM |

Sources verrouillées : `_shared/pharma-glossary.ts` (MedDRA SOC, fréquences CIOMS, formes et voies
EDQM, formules consacrées).

## 4. Anglais britannique

Usage OMS et UEMOA : *authorisation*, *gynaecological*, *paediatric*, *leucorrhoea*,
*sensitisation*, *colour*. Jamais l'orthographe américaine.

## 5. Ce qui ne se traduit pas

- **Les noms d'organismes** gardent leur désignation légale d'origine. « Agence béninoise du
  Médicament et des autres produits de Santé » reste en français dans un RCP anglais : traduire
  créerait un destinataire de pharmacovigilance qui n'existe juridiquement pas.
- **Les dénominations commerciales**, les DCI, les raisons sociales et les adresses.
- **Les valeurs chiffrées.** Seule la convention typographique s'adapte : `35 000 UI` → `35,000 IU`.

## 6. Recette de l'étape 2

- [ ] Gabarit UEMOA conservé à l'identique, aucune bascule vers la structure QRD
- [ ] Rubriques, sous-rubriques et marqueurs en nombre identique dans les deux langues
- [ ] Aucune rubrique vide en source devenue renseignée en cible
- [ ] Libellés MedDRA, EDQM et formules QRD repris dans leur forme officielle cible
- [ ] Orthographe britannique
- [ ] Organismes, dénominations et adresses non traduits
- [ ] Valeurs chiffrées identiques, seule la typographie adaptée
