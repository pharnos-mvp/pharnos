# Plan d'exécution — Variations : flux intégré

> Statut : design aligné (CEO, plusieurs tours) → plan d'EXÉCUTION. Build approuvé (« le reste go ! » + /cto:build).
> Réutilise l'acquis : `variation-catalog.ts`, `variation-table.ts` + renderers PDF/DOCX, `buildVariation` (lettre), `variation-request.ts`, Dexie v12.

## 1. Objectif & métrique de succès
- **Objectif** : depuis le CTD Workspace, activité = **Variation** → l'expert RA coche les natures (mineures/majeures), obtient une **arborescence Module 1 taillée**, ouvre le builder, et génère **lettre de variation + tableau comparatif (annexe)** ; le même sélecteur alimente la carte « Lettre de variation » de la Bibliothèque.
- **Métrique** : produire en < 2 min un dossier Variation compilable + lettre + annexe comparative (vrai A4, FR & EN), **0 régression** sur les activités Nouvelle AMM / Renouvellement (suite verte + recette navigateur).

## 2. Scope (tranche de valeur d'abord)
1ʳᵉ valeur = **M1** : sélecteur deux colonnes + arbre Module 1 Variation à la création de dossier. Puis lettre + annexe (M2), Bibliothèque (M3), RCP conscient du renouvellement (M4), nettoyage (M5).

## 3. Non-goals (pas maintenant)
- eCTD lifecycle (replace/append) — on reste CTD PDF focalisé.
- Calcul automatique des redevances / délais (l'annexe ne définit que le contenu).
- Refonte du moteur de compilation métré (intouché).
- Tableaux **natifs** dans l'éditeur in-place (tâche séparée déjà chipée).
- Auto-remplissage exhaustif de la colonne « ancien » (best-effort selon données disponibles).

## 4. Architecture & stack
- **Réutilisé** : catalogue (données), `variation-table` + renderers PDF/DOCX (annexe vrai A4, hors moteur compilation), `buildVariation` (lettre), modèle `variation-request`, Dexie v12.
- **Nouveau** : `VariationPicker` (UI 2 colonnes, pure, FR/EN) ; `variationTree(format, refs)` dans `module1-tree.ts` ; `DossierRecord.variations?: number[]` (additif, rétro-compat) ; RCP « conscient de l'opération ».
- **Stack** : React 19 + Vite + Tailwind v4 + radix-ui + Dexie (inchangé, éprouvé) — **aucune nouvelle dépendance**.
- **Décisions arrêtées** : tableau = **annexe séparée** (référencée dans la lettre) ; lettre identification **limitée** (Nom commercial · DCI · N° AMM · Date) ; **pas** de template RCP dédié au renouvellement (drapeau d'opération, pattern cover→renewal).

## 5. Milestones (tranches verticales, chacune livrable)
- **M1 (M)** — `VariationPicker` 2 colonnes + `variationTree(format, refs)` câblés à la création de dossier (NewDossierPage : activité Variation → sélecteur → dossier créé avec arbre taillé + `variations[]` persistées). *Shippable : créer un dossier Variation, voir l'arbre focalisé.*
- **M2 (M)** — Lettre de variation (identification limitée) + **tableau comparatif en annexe** générés dans le dossier (nœuds 1.1.1 / 1.4.1) ; colonne « ancien » préremplie si Pharnos a la donnée.
- **M3 (M)** — Bibliothèque : carte **« Lettre de variation »** → même sélecteur → formulaire template (sélection produit du catalogue) → lettre + annexe.
- **M4 (S/M)** — RCP **conscient de l'opération** : renouvellement → §8 (N° AMM) & §9 (date 1ʳᵉ autorisation/renouvellement) préremplies/signalées. Vérifier leur présence dans `rcp-form-model.ts`.
- **M5 (S)** — Repurpose : retirer l'UX builder autonome (superseded), garder renderers/modèle ; encyclopédie `/variations` conservée.

## 6. Risks & mitigations
1. **Champ `DossierRecord.variations` sur base existante** → optionnel + additif, pas de bump Dexie destructif, dossiers anciens sans le champ = OK.
2. **Densité du sélecteur (42 natures, libellés longs)** → 2 colonnes scrollables, libellé tronqué + titre complet au survol, recherche optionnelle ; recette visuelle < lg.
3. **Toucher la création de dossier (chemin critique)** → strictement additif, gardé derrière `activity==='variation'` ; 0 changement pour new_ma / renewal ; tests + e2e.

## 7. Definition of done
- typecheck + eslint + prettier + **vitest (≥ 346)** + e2e verts ; budget bundle OK.
- Recette navigateur réelle (port 4319) : dossier Variation créé, cases → arbre taillé, **lettre + annexe A4** téléchargées, **FR & EN**.
- 0 régression Nouvelle AMM / Renouvellement ; offline-first ; moteur de compilation intact.

## 8. Recommended next step
**M1** — coder `variationTree(format, refs)` + `VariationPicker` + intégration `NewDossierPage` (activité Variation → sélecteur → dossier + arbre taillé), avec tests vitest.
