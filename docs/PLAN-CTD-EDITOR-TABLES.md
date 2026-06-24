# PLAN — CTD builder : uniformisation annexe + éditeur (tableaux & undo/redo)

> CTO · 2026-06-24 · branche de feature → PR sur `main` (= prod). Front/édition uniquement, **0 migration**.
> Plan-maître intact ([PLAN.md](PLAN.md)) ; ce doc couvre les 3 demandes CEO du jour.

## 1. Objectif & métrique de succès

- **Objectif** — Uniformiser les actions de l'annexe de variation avec celles de la lettre, et faire de
  l'éditeur de document un vrai éditeur (tableaux + annuler/rétablir), pour que le RA ajuste le document
  **directement** sans cases-formulaire parasites.
- **Métrique** — Un RA peut : (a) piloter le tableau comparatif depuis la **même barre d'actions** que la
  lettre ; (b) insérer/éditer un **tableau** dans un document et le retrouver **identique** après
  enregistrement → rechargement → **compilation PDF** et **téléchargement DOCX** (zéro perte) ; (c)
  **annuler/rétablir** une modification au bouton. CI 6/6 + recette navigateur réelle.

## 2. Périmètre (tranches verticales, chacune livrable seule)

- **T1 — Annexe = mêmes boutons que la lettre.** Les actions du tableau comparatif (PDF / DOCX /
  Enregistrer) quittent la mini-barre interne de `VariationTableEditor` et passent dans l'**en-tête de
  document unique** (`DocumentHeader` ≥ lg / `DocumentActionsBar` < lg), via le modèle **pur**
  `buildDocActions` — exactement le rendu des boutons de la lettre. **Suppression de la case « N° d'AMM »**
  de l'en-tête du prévisualiseur (édition directe sur la feuille).
- **T2 — Undo/redo dans l'éditeur.** Deux boutons Annuler/Rétablir dans `FormatToolbar` (l'historique est
  déjà fourni par StarterKit) avec état désactivé réactif. Raccourcis clavier déjà actifs.
- **T3 — Tableaux dans l'éditeur (bout en bout).** Extension TipTap `table` dans `RichTextEditor` +
  bouton « Insérer un tableau » et opérations lignes/colonnes dans la barre + **validation de schéma**
  (anti-perte/anti-forge) + **export DOCX** + **rendu PDF de compilation** + **CSS** (écran + impression A4).

## 3. Non-objectifs (volontairement hors périmètre)

- Pas de tableaux **avancés** (fusion de cellules, redimensionnement à la souris, colonne d'en-tête
  basculable) — insertion + ajout/suppression ligne/colonne + suppression tableau suffisent au MVP.
- Pas de refonte du moteur de compilation ni du métré (`record_compilation` intact) — ajout **additif**
  d'un `case 'table'` seulement.
- Pas de fusion du tableau comparatif d'annexe **dans** TipTap (il reste son composant `VariationTableSheet`
  dédié — découplage assumé du livrable métré).
- Aucune migration DB ; aucun changement Edge.

## 4. Architecture & stack (réutilise l'existant, choix « ennuyeux »)

| Décision | Pourquoi |
|---|---|
| T1 : lever les actions via **ref impératif + prop `controlsInBar`** | Pattern **déjà en place** pour `TemplateFillForm` (`fillFormRef.current?.pdf()/.docx()/.reset()`) → cohérence totale, zéro nouveau concept. |
| T1 : ajouter `'variation-table'` à `DocKind` + `buildDocActions` | Source unique pure des boutons (Télécharger ▾ PDF/DOCX + Enregistrer) → **mêmes** composants/styles que la lettre, testable isolément. |
| T1 : retirer l'`<input>` AMM ; AMM affichée depuis le dossier, éditable **inline** sur la feuille | « édition directe du document » (philosophie CEO), comme les `field-input` de la lettre. |
| T2 : `editor.chain().focus().undo()/redo()` + `useEditorState` pour `can()` | History inclus dans StarterKit v3 → 2 boutons, aucun dep ajouté. |
| T3 : `@tiptap/extension-table` (Table/Row/Cell/Header) `^3.26` | Aligné sur TipTap 3.26 déjà installé ; chargé dans le **chunk lazy** du workspace (zéro impact bundle initial). |
| T3 : rendu PDF = **réutiliser** la logique de dessin de `variation-table-pdf.ts` | Dessin pdf-lib de tableau (wrap par cellule, sauts de page, ré-affichage en-tête) **déjà prouvé** en prod → on n'invente rien sur le chemin métré. |
| T3 : DOCX = `Table/TableRow/TableCell` de la lib `docx` (déjà dép.) | Sections `docx` acceptent `(Paragraph|Table)[]` → ajout localisé dans `tiptapToDocxBlob`. |
| T3 : étendre le **zod** de `tiptap-schema.ts` aux nœuds table | Le contenu serveur est revalidé au montage ; sans ça, un doc à tableau serait **mis en quarantaine = perte**. Bornes (profondeur/taille) déjà présentes. |

**Fichiers touchés (prévision)** — T1 : `VariationTableEditor.tsx`, `VariationTableSheet.tsx`,
`components/document-header-model.ts`, `DossierWorkspacePage.tsx`. T2 : `components/toolbar.tsx`. T3 :
`RichTextEditor.tsx`, `components/toolbar.tsx`, `tiptap-schema.ts`, `tiptap-docx.ts`,
`pdf/compile-dossier.ts`, `index.css`, `package.json`. Tests : `document-header-model`,
`tiptap-schema`, `tiptap-docx`, `compile-dossier`, + e2e offline.

## 5. Jalons (ordonnés, chacun = une PR shippable)

1. **T1 — Annexe uniformisée** (~0,5 j). Ref+`controlsInBar` sur `VariationTableEditor`, `variation-table`
   dans `buildDocActions`, câblage `DocumentHeader`, suppression case AMM, AMM inline sur la feuille.
   Tests modèle + recette navigateur (tab annexe à côté de la lettre).
2. **T2 — Undo/redo** (~0,25 j). Boutons Annuler/Rétablir + état réactif. Le plus petit, indépendant.
3. **T3 — Tableaux bout en bout** (~1,5–2 j). Extension + barre (insertion/ligne/colonne) + schéma +
   DOCX + PDF compile + CSS. Tests unitaires sur les 4 chemins + e2e insertion→save→reload→compile.

Ordre d'exécution recommandé : **T1 → T2 → T3** (valeur livrée tôt, risque concentré en dernier).

## 6. Risques & mitigations (top 3)

1. **Régression du PDF métré** (on touche `renderTiptap` du livrable). → Ajout **purement additif**
   (`case 'table'`), dessin calqué sur `variation-table-pdf.ts`, test de compilation avec tableau +
   sauts de page, `record_compilation` non touché.
2. **Perte de données au round-trip** (tableau rejeté par `parseTiptapContent`). → Étendre le schéma zod
   **avant** d'activer l'insertion + test asserant qu'un doc à tableau parse et survit save→reload.
3. **Spécifimités TipTap v3 / dep offline** (exports du paquet table, réactivité `can()`). → Vérifier la
   version `^3.26` au démarrage, garder l'extension dans le chunk lazy, repli « boutons toujours actifs »
   si la réactivité `can()` coince (undo/redo no-op sûrs).

## 7. Definition of Done

- `npm run format:check` + typecheck + lint + **vitest** (255+ existants verts + nouveaux) + build + e2e offline.
- **Zéro perte tableau** : insertion → Enregistrer → rechargement → **compilation PDF** ET **DOCX** fidèles.
- Annexe : PDF/DOCX/Enregistrer rendus par `DocumentHeader` (parité visuelle lettre), case AMM absente.
- Undo/redo fonctionnels (bouton + Ctrl+Z/Y), désactivés à bon escient.
- Bundle initial **non** régressé (extension table en chunk lazy). CI 6/6 verte.
- **Recette navigateur réelle** (Chrome, app prod ou dev local) — pas seulement preview headless.

## 8. Prochaine étape recommandée

Démarrer **T1** : exposer `pdf()/docx()/save()` sur `VariationTableEditor` (ref + `controlsInBar`), ajouter
le `case 'variation-table'` à `buildDocActions`, câbler `DocumentHeader`, retirer la case AMM.

---

# ROUND 2 — Unification (retour recette CEO 2026-06-24, PR #226)

> T1-T3 livrés + verts (PR #226). Recette CEO concluante mais 7 points → chantier d'**unification**.
> Décisions confirmées : docx = **conversion mammoth** (édition native) ; **GO tout, une PR** (réusine l'annexe de T1).

## Cap
**Tout devient un document TipTap natif dans UN seul cadre A4** (modèle `.tplform-sheet` 62 rem retenu par le
CEO), avec **le jeu complet d'actions de la lettre** partout. Front/édition, 0 migration.

## Tranches
- **R2-A — Prévisualiseur A4 unique** (points 3, 4). `.editor-page` aligné sur `.tplform-sheet` ;
  `InlineDocPreview` + page de garde dans le même cadre ; **retrait** de l'en-tête redondant nom+download
  des pièces (déjà dans la barre d'actions). → plus de cadre qui bouge.
- **R2-B — Annexe = document natif** (points 1, 2, 6). Le tableau comparatif devient un **doc généré
  TipTap** (templateKey `variation-annex`, nœud `table` seedé depuis `variationItems`) → hérite de
  Modifier/Signer/En-tête/Pied/Télécharger/Téléverser/Supprimer ; **1.4.1 ≡ onglet annexe** ; **compilé**
  juste après la lettre (drawTable de T3) → corrige point 6. Retire le special-casing `variation-table` (T1).
- **R2-C — doc/docx éditable** (point 7). `.doc`/`.docx` acceptés (fiche produit + CTD) ; **mammoth**
  docx→TipTap à l'upload → édition native ; validation `parseTiptapContent` ; chunk lazy.

## Definition of Done (round 2)
Cadre A4 **identique** sous toutes les arborescences (zéro décalage onglet/onglet) ; annexe = doc natif
avec actions complètes, **visible dans le PDF compilé** ; docx téléversé **éditable nativement** ; CI 6/6 +
recette navigateur réelle (preview headless non fiable pour ce flux). `/cto:review` + `/accessibility-review`.
