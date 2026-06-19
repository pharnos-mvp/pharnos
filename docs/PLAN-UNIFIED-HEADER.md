# Plan — CTD Builder : en-tête de document UNIQUE + responsive

> Refactor de `web/src/features/workspace/DossierWorkspacePage.tsx` vers l'en-tête unique
> validé (mockup `docs/mockups/ctd-builder-unified-header.html`).
> Ne remplace PAS `docs/PLAN.md` (plan maître) ni `docs/PLAN-RESTANT.md`.

## État & reprise — au 2026-06-18 (fin de session)

**LIVRÉ EN PROD + RECETTÉ Chrome (merged sur `main`) :**

- **M1 — En-tête de document UNIQUE (desktop).** PR #201 (fondation : modèle pur `buildDocActions`
  + composant `DocumentHeader` + token `--brand` dual-mode), #202 (câblage : cascade pilule+barre+
  bandeau+format SUPPRIMÉE → une seule barre `sticky top-0 z-30`, revue code-reviewer = 1 blocker
  Signer-en-lecture-seule + 2 majors corrigés), #203 (fix : tout nœud sélectionné a un en-tête →
  Téléverser toujours). Recette 5 types OK.
- **Fidélité mockup — PASS 1.** PR #204 : métriques EXACTES de l'en-tête (`.act` h34/r9/px11/font13/
  gap6/icône17, conteneur, pastille numéro, chip) ; **« Modifier » ouvre la mise en forme B/I/H₂/•
  SUR LA MÊME LIGNE** dans l'en-tête ; **sélection d'arbre = surbrillance navy** ; panneau Structure
  286 px. Dark/light + EN/FR préservés.
- **Fidélité mockup — PASS 2 + onglets.** branche `feat/ctd-mockup-fidelity-2` : layout 3 colonnes
  **flush pleine hauteur** (en-tête full-bleed + Structure `border-r` / Copilote `border-l`, plus de
  cartes arrondies ni gaps) remplissant `<main>` (`h-[calc(100%+pb)]` + marges négatives → scroll
  interne par colonne, plus de scroll global) ; **poignées de rabat posées SUR les bordures**
  (`absolute -left/-right-[9px]`) ; **constat Regafy déplacé canevas → rail** (carte ambrée `.finding`,
  titre bouclier, Remplir/Traduire/Remplacer) ; rail 274 px, cartes mockup ; **barre d'onglets
  persistante façon navigateur** (`{Type} (n° CTD)` via `viewableTabType`, pilule navy active + « × »).
  Overlays sortis du conteneur `overflow-hidden` (fragment). Revue code-reviewer = **SHIP** (0 blocker/major) ;
  audit a11y = focus-ring design-system sur onglets/poignées + cible « × » 24 px, landmarks/labels OK.
  Gate local : typecheck/lint/format/build/budget + **273 vitest**. **RESTE : recette Chrome réelle**
  (sticky/scroll/flush NON vérifiables en headless) → merge → deploy.

**M2 + M3 — LIVRÉS** (branche `feat/ctd-builder-responsive-m2`, PR #207, CI 6/6) :

- **M2 responsive** : primitive `Sheet` (Radix) ; sous `lg`, Structure & Copilote en **tiroirs**
  (barre mobile, fermeture auto à la sélection) → document pleine largeur + **trou mobile bouché**
  (constat Regafy + Traduire atteignables via le tiroir Copilote) ; en-tête `@container` → libellés
  en icône seule + boutons **44 px** sous 48rem ; **« Compiler »** en barre basse mobile.
- **M3 a11y** : onglets = vraie **`tablist`** (roving + ←/→/Début/Fin + Suppr + `tabpanel`) ;
  **arbre = WAI-ARIA `tree`** (treeitem/group, aria-level/selected/expanded, roving tabindex,
  ↑↓→←/Début/Fin/Entrée ; `flattenVisible` pur + testé). 275 vitest, Lighthouse a11y vert.

**RESTE (mineur)** : roving tabindex de la **toolbar d'en-tête** — reporté volontairement (jeu de
boutons restreint déjà clavier-OK + axe-vert ; menus Radix portalisés + barre de format → roving
propre fragile pour valeur marginale). **+ recette Chrome réelle** (responsive/sticky NON vérifiables
en headless) avant merge → deploy.

**Garde-fous reprise :** `main` = prod ; brancher → CI 6/6 → **recette Chrome réelle** (sticky/responsive
NON vérifiables en headless) → merge → deploy. **Piège SW : double `update()`+reload** avant de recetter
un écran modifié. Stack verrouillé Vite/React19/TS strict/Tailwind v4/shadcn ; tout en tokens (dark/light).

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
