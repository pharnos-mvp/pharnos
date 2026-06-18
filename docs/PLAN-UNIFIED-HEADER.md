# Plan — CTD Builder : en-tête de document UNIQUE + responsive

> Refactor de `web/src/features/workspace/DossierWorkspacePage.tsx` vers l'en-tête unique
> validé (mockup `docs/mockups/ctd-builder-unified-header.html`).
> **Plan only — aucun code écrit.** Ce fichier ne remplace PAS `docs/PLAN.md` (plan maître) ni
> `docs/PLAN-RESTANT.md`.

## Réponses directes aux questions CEO

1. **Barre latérale gauche / panneaux.** On garde **deux panneaux indépendamment rétractables** :
   - **Gauche = Structure** (arbre CTD) — repli vers rail d'icônes puis masquage (poignée existante `PanelHandle`).
   - **Droite = Copilote** (Complétude + Notes + **constats Regafy**) — rétractable aussi.
   - Repli des deux = **mode focus** (document pleine largeur). C'est aussi le socle du responsive
     (panneau replié = tiroir sur mobile). → **Oui, on maintient les deux, rétractables.**

2. **Dark / Light.** **Reste 100 % opérationnel.** L'app utilise déjà `next-themes` + tokens
   (`bg-card`, `text-foreground`, `border`, `--primary`…). Le refactor est **token-only** : le navy
   de la marque est lié au token de thème (jamais de hex en dur, contrairement au mockup qui était une
   maquette). Dark et Light héritent automatiquement.

3. **Analyser & Traduire (IA Regafy).** Règle claire pour ne pas encombrer l'en-tête :
   - **Analyser** = action **primaire dans l'en-tête** (bouton accent « IA »), affichée quand Regafy
     est activé et qu'il y a une cible — exactement la logique actuelle.
   - **Traduire** (+ « Remplir le template », « Remplacer ») = **dans le constat Regafy du panneau
     Copilote** (droite), car ce sont des **remédiations** issues de l'analyse (pattern `NonConformCard`
     actuel). Le **gating 3 états** (Masquée / Vitrine / Activée) est préservé : en Vitrine, Analyser/
     Traduire restent visibles comme accroche → upsell.

4. **Estimation « au propre ».** ≈ **1 session de build dédiée**, livrée en **3 tranches**
   indépendantes, **chacune mergée + recettée en prod le jour même** (CI 6/6, recette Chrome réelle).
   Découpage : M1 en-tête desktop, M2 responsive, M3 a11y + finitions.

5. **Stack responsive (laptop / tablette / téléphone).** Tailwind v4 (utilitaires + **container
   queries `@container`**) + primitives shadcn existantes. Breakpoints :
   - **≥ 1024 px (laptop+)** : 3 colonnes — Structure (rétractable) │ Document │ Copilote (rétractable) ;
     toutes les actions visibles dans l'en-tête.
   - **640–1023 px (tablette)** : document pleine largeur ; Structure & Copilote en **tiroirs**
     (shadcn `Sheet`) ouverts par des boutons « Structure » / « Copilote » ; actions secondaires de
     l'en-tête repliées dans le menu **⋯**.
   - **< 640 px (téléphone)** : document pleine largeur ; deux panneaux en tiroirs plein écran ;
     en-tête compact = identité + action primaire + ⋯ ; **cibles tactiles ≥ 44 px** ; « Compiler »
     en barre basse sticky.
   - **Container queries** : le cluster d'actions déborde selon la **largeur disponible** (pas le seul
     viewport) → robuste quand un panneau s'ouvre/ferme.

---

## 1. Objectif & métrique de succès
- **Objectif** : remplacer la pile de barres (pilule + barre d'actions + bandeau navy + barre de
  format) par **un en-tête de document unique** à cadre constant et **boutons adaptatifs par type**,
  responsive laptop→téléphone, dark/light intact.
- **Métrique** : les **5 types** de document (lettre, formulaire, pièce PDF, page de garde, nœud vide)
  rendent **un seul en-tête** avec les bonnes actions ; **0 régression sticky/layout** ; CI 6/6 ;
  Lighthouse a11y ≥ seuil actuel ; OK aux **3 breakpoints** × **dark+light** ; recette prod verte.

## 2. Scope (tranche verticale de valeur d'abord)
**M1** : composant `DocumentHeader` + **modèle de descripteur d'actions** par document, câblé dans
`DossierWorkspacePage` pour **tous les types** en **desktop**, remplaçant les 4 barres. Panneaux
rétractables conservés. Tokens dark/light. C'est le cœur de valeur, déjà livrable seul.

## 3. Non-goals (ce qu'on NE fait PAS maintenant)
- Pas de changement des **rendus** de document (TipTap `RichTextEditor`, internes de
  `TemplateFillForm` au-delà du `controlsInBar` déjà fait, `InlineDocPreview`).
- Pas de changement de la **logique Regafy / Edge** ni du gating 3 états.
- Pas de refonte de l'**arbre** lui-même, ni nouvelles fonctionnalités produit.
- On conserve **i18n FR/EN, offline PWA, code-split** (lazy TipTap / form engine).

## 4. Architecture & stack
- **`DocumentHeader`** (présentation pure) piloté par un **`DocActionDescriptor`** :
  `{ id, number, title, subtitle, status, primaryActions[], overflowActions[] }`. **Source unique**
  des actions. Chaque surface de document expose son descripteur/poignée (généralise le pattern
  `useImperativeHandle` déjà introduit en Pt2). → ajout/évolution d'un type = un descripteur, layout
  inchangé.
- **`WorkspaceShell`** : layout 3 zones, gauche/droite rétractables (`PanelHandle` existant) +
  **`Sheet`** shadcn pour les tiroirs mobiles (Radix Dialog — focus-trap/ESC/ARIA gratuits ; Radix
  déjà présent via `dropdown-menu`).
- **Menus** : `dropdown-menu` existant pour **Télécharger ▾** (PDF/DOCX — le menu que le CEO veut
  garder) et l'**overflow ⋯**.
- **Thème** : navy marque → token (`--primary`/brand) ; **aucun hex en dur** → dark/light auto.
- **Responsive** : Tailwind v4 + `@container` (overflow d'actions piloté par largeur dispo).
- _Subagent solution-architect non sollicité : design déjà cadré (mockup validé + connaissance fine
  du composant). On reste sur le stack verrouillé, zéro nouvelle techno hors `Sheet`._

## 5. Milestones (tranches ordonnées, chacune livrable)
- **M1 — En-tête unique (desktop)** _(~1 tranche)_ : `DocumentHeader` + descripteurs des 5 types ;
  câblage dans `DossierWorkspacePage` ; suppression de la cascade de barres ; tokens dark/light ;
  panneaux rétractables conservés. Tests unitaires descripteur + rendu par type. **Recette Chrome
  prod** sur les 5 types.
- **M2 — Responsive laptop/tablette/téléphone** _(~1 tranche)_ : `Sheet` pour tiroirs mobiles ;
  overflow ⋯ via container queries ; cibles tactiles ; barre « Compiler » basse sur mobile. **Recette
  prod aux 3 largeurs**.
- **M3 — A11y + finitions** _(~1 tranche)_ : clavier WAI-ARIA arbre (flèches), `toolbar` roving
  tabindex, gestion du focus à l'ouverture de tiroir, audit Lighthouse ; câblage Analyser (en-tête) /
  Traduire (Copilote) ; **audit dark+light** ; recette prod finale tous types × breakpoints.

## 6. Risques & mitigations
- **R1 — Régression sur l'écran central (critique).** → Tranches petites + revertables, derrière
  branche, **recette prod réelle par type** (sticky/responsive non vérifiables en headless — leçon
  P0-1), merge seulement si vert.
- **R2 — Bugs sticky/responsive (la douleur d'origine).** → Supprimés **par construction** (un seul
  en-tête, plus de cascade) ; container queries ; vérif navigateur réel aux 3 largeurs.
- **R3 — Régressions dark mode (hex en dur).** → **Token-only**, audit des 2 thèmes, check visuel.

## 7. Definition of done
typecheck · lint · format · build verts ; **CI 6/6** ; tests unitaires (descripteur + rendu
par type + a11y type `controlsInBar`) ; **Lighthouse a11y ≥ seuil actuel** ; **recette Chrome prod**
sur les 5 types × {laptop, tablette, téléphone} × {dark, light} ; **0 erreur console** ; bundle
code-split préservé (pas de régression de poids/route).

## 8. Prochaine étape recommandée
**M1** : extraire `DocumentHeader` + le modèle de descripteur, câbler le desktop pour les 5 types,
livrer derrière branche, recetter en prod. (Go/no-go CEO avant de coder.)
