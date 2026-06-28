# Plan — LOT 1 : Fondation Design-System premium (la « nouvelle DA » dans le code)

> Cadré par le CTO (`/cto:plan`, 2026-06-28). **Doc d'EXÉCUTION du LOT 1** du
> [PLAN-LANCEMENT.md](PLAN-LANCEMENT.md) ; il met en œuvre le contrat de
> [DESIGN-SYSTEM.md](DESIGN-SYSTEM.md). Ne remplace pas `PLAN.md` (vision).
>
> **Statut : M0 + M1 LIVRÉS EN PROD — gate CEO signé** (PR #249 squash `2619ae4`, Deploy ✅, 2026-06-28).
> Fondation : variante `Button primary` bleue, primitive `ListRow`, `Page` (24 px en-tête),
> `useHideTopbarSearch` (1 recherche/écran), **liste Produits sur canvas `#f9fafb`**. Produits migré
> 100 % primitives (`catalogue-list.css` supprimé). Dashboard + cockpit **inchangés** (additif).
> **Recette en VRAI Chrome (compte Glory Pharma, vraies données)** : canvas `rgb(249,250,251)` clair +
> transparent→canvas sombre + anneau de focus clavier OK ; CI 6/6 + budget 133,6/135.
> **M2 LIVRÉ EN PROD** (PR #250 squash `82f6ac6`, Deploy ✅, 2026-06-28) : cockpit converge — `BLUE_BTN`
> éliminé partout (→ `Button variant="primary"`) + map `KPI_BADGE_TONE` partagée ; **refactor invisible**
> (cockpit golden master inchangé, vérifié vrai Chrome). **Reste : déroulé M3–M10** (1 PR + review/surface).

## 0. Pourquoi (le problème, prouvé dans le code)
La DA premium validée (Dashboard, 2026-06-27) n'est **pas** componentisée : elle vit en **CSS
dupliqué par surface** (`dashboard-mockup.css` `.pharnos-dash`, `product-cockpit.css` `.rim-cockpit`,
`catalogue-list.css` `.pharnos-cat` — chacun redéfinit `.card`/`.doc-row`/`.cat-row`/`.kpi`), le CTA
bleu est une **chaîne magique** `BLUE_BTN` copiée dans 2 fichiers, et `Button` n'a **aucune variante
bleue**. Conséquence : **chaque surface ré-improvise** → itérations à répétition (bouton pas bleu,
titre collé, double recherche). **Le remède = installer la DA en primitives réutilisables.**

## 1. Objectif & métrique de succès
- **Objectif** : transformer la DA premium en **primitives composables** (`components/ui/`), de sorte
  que **toute surface se compose** au lieu d'improviser du CSS.
- **MVP livré (LOT 1)** = les primitives existent **+** une **surface de référence (Produits)** est
  **100 % composée** d'elles **+** le **gate CEO est signé**.
- **Métrique** : sur Produits, **0 CSS premium bespoke**, `BLUE_BTN` **éliminé**, **1 seule** recherche,
  **24 px** d'air en-tête **par construction**, **WCAG 2.1 AA** OK, **budget tenu**, recette clair/sombre/FR-EN.

## 2. Scope (tranche verticale de valeur d'abord)
**M0 (fondation primitives, additif) + M1 (Produits = surface de référence + règles Shell), derrière le
gate CEO.** Tout le reste (rollout des 10 autres surfaces) = LOT 2, déroulé **après** validation.

## 3. Non-goals (pas maintenant)
- Pas de **big-bang reskin** : on **ne mute pas** les tokens neutres existants (`--card`, `--border`…)
  → aucune surface non-migrée ne bouge.
- **Zone document/A4 GELÉE** : `.editor-page`, `.tplform-sheet`, rendu pdf-lib = byte-exact, **intouchés**.
- Pas le **hub Catalogue M4**, ni le **wizard produit**, ni de **nouvelles chaînes i18n** (i18n **en dernier**).
- Pas de changement backend/données. `/theme-factory` **écarté** (outil pour artefacts, pas pour un DS React).

## 4. Architecture & stack
**Approche : additif, jamais destructif.** On AJOUTE des primitives premium qui lisent `--pd-*`
(déjà globaux dans `index.css`) ; les surfaces **opt-in** en remplaçant leur CSS bespoke par ces
primitives, **une par PR**. Le Dashboard reste l'**étalon visuel** ; les primitives sont construites
pour le **reproduire**, puis le Dashboard migre dessus **sans changement à l'œil**.

| Brique (toutes dans `components/ui/`) | Rôle | Remplace |
|---|---|---|
| **Token layer `--pd-*` formalisé** | palette premium + échelles **spacing / radius / shadow / typo** (clair+dark, parité vérifiée) | les `--pd-*` épars |
| **`Button` variante `primary`** (bleue `--info`) | CTA premium | `BLUE_BTN` (×2) |
| **`Card`** premium (`--pd-card`, radius 14, ombre, hover) | conteneur | `.card`/`.rim-card` |
| **`ListRow`** (ligne-carte cliquable, hover-lift, *stretched-link*) | listes premium | `.doc-row`/`.cat-row` |
| **`Kpi`** (carte stat hero) | bandeau KPI | `.kpi` |
| **`PageHeader` v2** | encode **la règle de titre** (corps = titre descriptif ≠ topbar) **+ l'espacement 24 px** | en-têtes ad-hoc + le `pt-*` oublié |
| **`SearchToolbar`** (`SearchField` + `FilterChips`) | **une seule** recherche/filtre standard | toolbars ad-hoc |

- **Stack** : **aucune dépendance nouvelle**. Tailwind v4 + CVA (déjà là) ; Syne/DM Sans déjà auto-hébergées ;
  Radix **hors du bundle d'entrée statique** (leçon budget). Rationale : boring, prouvé, time-to-MVP.
- **Décision Shell (M1)** : la recherche globale du topbar est un **placeholder non câblé** → on la
  **retire** tant que l'omnisearch n'existe pas (supprime la double-recherche) ; titre topbar = **section**,
  titre corps (`PageHeader`) = **descriptif** (jamais identiques). *Réversible.*

## 5. Milestones (tranches shippables — 1 PR = 1 surface, recette + CI 6/6 + budget à chaque fois)
| # | Tranche | Effort | Gate |
|---|---|---|---|
| **M0** | **Fondation** : tokens formalisés + `Button primary` + `Card`/`ListRow`/`Kpi` + `PageHeader` v2 + `SearchToolbar` (additif, rien ne bouge encore) | ~1 s | — |
| **M1** | **Produits = surface de référence** (composée 100 % primitives, `BLUE_BTN`/CSS bespoke supprimés, 1 recherche, 24 px) **+ règles Shell** (titre/recherche/espacement) | ~0,5–1 s | **🚦 GATE CEO** |
| — | *Fin du LOT 1. Le déroulé ci-dessous = LOT 2, après le gate.* | | |
| **M2 ✅** | **Cockpit produit** : `BLUE_BTN` → `Button variant="primary"` + map `KPI_BADGE_TONE` partagée. **Refactor INVISIBLE** (golden master inchangé, vérifié vrai Chrome). PR #250. *`.rim-cockpit`/`.doc-row` gardés (convergence visuelle = OK CEO requis).* | ~0,5 s | ✅ **LIVRÉ PROD** |
| M3 | **Fiche création produit** (DA du form ; wizard = M4 catalogue, hors lot) | ~0,5 s | a11y+review |
| M4 | **Dashboard → primitives** (recâblage, **0 changement visuel**, retrait `dashboard-mockup.css`) — pixel-compare | ~0,5–1 s | a11y+review |
| M5 | **Workspace (liste) + Nouveau dossier + Roadmap** (chrome) | ~1 s | a11y+review |
| M6 | **CTD Builder** — **chrome seul** (feuille éditeur GELÉE) | ~0,5–1 s | a11y+review |
| M7 | **Bibliothèque + Variations** — **chrome seul** (feuilles GELÉES) | ~1 s | a11y+review |
| M8 | **Compte** (chrome, form) | ~0,5 s | a11y+review |
| M9 | **Pages hors-shell** : Login, Reset, Onboarding, Invitation, Revue publique | ~0,5–1 s | a11y+review |
| M10 | **i18n EN DERNIER** + nettoyage final (suppression du dernier CSS dupliqué) + audit a11y global | ~0,5–1 s | a11y+review |

## 6. Risques & mitigations (top 3)
1. **Régression visuelle sur surfaces non-migrées** si on touche les tokens neutres → **on n'y touche pas** ;
   les primitives lisent `--pd-*` ; chaque surface ne change qu'à **sa** PR.
2. **Dashboard (l'étalon) régresse** en migrant dessus (M4) → **pixel-compare** avant/après (captures
   Playwright clair+sombre) ; le Dashboard est le **golden master**, on garde son CSS jusqu'à parité prouvée.
3. **Budget d'entrée** (`index-*.js`, CataloguePage statique) → mesurer `npm run budget` à **chaque** PR ;
   Radix isolé hors entrée ; primitives = CSS/Tailwind légers. *Bonus risque délai* : LOT 1 limité à
   M0+M1 derrière le gate → ne bloque pas N4 ; les surfaces M2–M10 s'interleavent et sont indépendantes.

## 7. Definition of Done (LOT 1)
Primitives livrées (`Button primary`, `Card`, `ListRow`, `Kpi`, `PageHeader` v2, `SearchToolbar`, tokens) ·
**Produits 100 % composé** (0 bespoke premium CSS, `BLUE_BTN` supprimé, 1 recherche, 24 px par construction) ·
**WCAG 2.1 AA** (axe/Lighthouse a11y ≥ existant) · **CI 6/6** · **budget tenu** · recette navigateur réelle
**clair + sombre + FR/EN** · zone A4 **intacte** · `DESIGN-SYSTEM.md` mis à jour · **gate CEO signé**.

## 8. Prochaine étape (1 action)
Sur **go CEO** : implémenter **M0 (fondation) + M1 (Produits référence + Shell)** dans **une seule PR**,
livrer captures clair/sombre/FR-EN pour le **gate**, **sans dérouler** M2–M10 tant que la fondation
n'est pas signée.

---

### Surfaces & zones gelées (rappel)
**12 in-shell** : Shell · Dashboard (réf.) · Produits · Fiche création · Cockpit · Workspace · Nouveau
dossier · CTD Builder 🔒 · Roadmap · Bibliothèque 🔒 · Variations 🔒 · Compte. **5 hors-shell** : Login,
Reset, Onboarding, Invitation, Revue publique. 🔒 = **feuille document/A4 byte-exact GELÉE** (chrome seul).

### Gates qualité par surface
`engineering-standards` (barre de build) · **WCAG 2.1 AA** (`accessibility-review`) · `cto:review` · CI 6/6 · budget.
