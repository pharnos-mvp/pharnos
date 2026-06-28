# Design-system Pharnos — fondation (LOT 1)

> **Contrat visuel et UX unique de l'app.** Objet du LOT 1 du [PLAN-LANCEMENT.md](PLAN-LANCEMENT.md) :
> que **chaque surface se compose des mêmes primitives** → uniformité par construction, zéro
> « chaque page improvise ». Densité validée CEO (2026-06-25) = **équilibrée-pro** (aéré mais efficace).
> **Zone protégée** : surfaces document/A4 (`.editor-page`, `.tplform-sheet`, rendu PDF) = byte-exact au
> PDF compilé → **hors design-system** (on ne touche que le chrome autour).
>
> **MAJ 2026-06-25 — app PREMIUM** (remplace « chrome neutre 2 tons ») : typo de marque **Syne** (display)
> / **DM Sans** (corps) auto-hébergées · **shell navy** (`--sidebar` `#0a1628`) + accent `#3b82f6` ·
> **palette de statut sémantique**. La zone A4 (Times New Roman) reste gelée.
>
> **MAJ 2026-06-28 — LOT 1.5 « verrouillage de la fondation »** : **token layer UNIFIÉ** (échelle brute
> unique → canoniques + `--pd-*` en dérivent, fin du double-maintien) · **z-index tokenisé**
> (`z-sticky/dropdown/overlay/modal`). La fondation est désormais **verrouillée** ; le reste = rollout par
> surface (LOTs 4-10) + landing. Le Dashboard reste sa propre CSS (`dashboard-mockup.css`) mais **partage
> exactement les mêmes valeurs** que les primitives (1 source).

## Principes
1. **Composer, pas improviser** — une page = `Page` + `PageHeader` + des sections/états, pas des
   `<div>` ad-hoc. Si un besoin revient 2×, c'est une primitive.
2. **Typographie de marque** — **Syne** (display, token `font-display`) sur les titres de page
   (h1 = `font-display text-2xl font-semibold tracking-tight`) ; **DM Sans** (corps, `font-sans`)
   partout ailleurs ; sous-titre = `text-sm text-muted-foreground`. Auto-hébergées (`@fontsource-variable`,
   offline). **A4/document = Times New Roman** (zone protégée). 2 graisses (400/500).
3. **Rythme d'espacement** (base 4 px, densité équilibrée-pro) — entre blocs de page = `space-y-6`
   (24 px, via `Page`) ; intra-bloc = `gap-4` (16 px) ; padding carte = 16–20 px.
4. **Couleurs** — tokens `index.css`, **jamais de couleur en dur** (invisible en dark sinon).
   **SOURCE UNIQUE (LOT 1.5)** : une **échelle brute** (`--gray-50…--gray-900`, `--white`, `--blue-600/700`
   = hex du mockup CEO) dont **dérivent et les neutres canoniques (shadcn `--card`/`--border`/`--muted…`) et
   la palette premium `--pd-*`** → fini le double-maintien. Les primitives rendent donc les **gris cool
   (slate) de la DA Dashboard** en clair (convergence) ; le Dashboard reste **pixel-identique** (ses
   `--pd-*` de surface aliasent les canoniques aux mêmes valeurs). **Shell navy** (`--sidebar` `#0a1628`
   clair / `#010409` dark) = identité de marque ; accent `--sidebar-primary` `#3b82f6`. **Statut
   sémantique** `--success`/`--warning`/`--danger`/`--info` (+ `-subtle` fond badge, `-subtle-foreground`
   texte AA) — l'ambre est volontairement plus foncé que le mockup (#b45309 vs #d97706) pour passer AA sur
   texte. `--brand` `#263f73` = **marque document gelée** (PDF byte-exact). Dark = GitHub.
5. **z-index** — **TOKENISÉ (LOT 1.5)** : `@theme` expose `z-sticky` (20) · `z-dropdown` (30) ·
   `z-overlay` (40) · `z-modal` (50) ; contenu `z-0` ; Radix (dropdown/dialog) porte son propre z ; toast
   (sonner) au-dessus. Utiliser ces utilitaires plutôt que des nombres → fin des bugs de barres collantes.
6. **États systématiques** — toute liste/donnée asynchrone expose **chargement** (`Skeleton`),
   **vide** (`EmptyState`), **erreur** (`ErrorState` actionnable). Jamais un `<p>Chargement…</p>` nu.

## Primitives livrées (`web/src/components/ui/`)
| Primitive | Rôle |
|---|---|
| `Page` | Conteneur de page : largeur max + rythme vertical unifié. |
| `PageHeader` | En-tête unifié : `title` + `description?` + `actions?` (à droite). Remplace tous les en-têtes ad-hoc. |
| `EmptyState` | État vide : `icon?` + `title` + `description?` + `action?`. |
| `ErrorState` | Erreur **actionnable** : **quoi** (`title`) / **pourquoi** (`reason`) / **que faire** (`action`+CTA). = absorbe le backlog « erreurs actionnables ». |
| `Skeleton` | Placeholder de chargement animé. |
| `StatusBadge` | Badge de **statut sémantique** (success/warning/danger/info/neutral) : fond `subtle` + texte AA — sens porté par la couleur **et** le texte (a11y 1.4.1). |
| `Button` var. `primary` | **CTA premium bleu** de la DA (`bg-info` = `.btn-primary` du mockup). Source unique — remplace la chaîne magique `BLUE_BTN`. |
| `ListRow` (+`ListRowIcon`/`ListRowLink`/`ListRowActions`) | **Ligne-carte premium** (hover-lift, lien étiré, anneau de focus) — unifie `.doc-row`/`.cat-row`/`.alert-row`. Tokens sémantiques (premium == neutre dans `index.css`). |

**Règles encodées par les primitives (LOT 1)** : `Page` porte la **respiration en-tête de 24 px** (le titre du corps ne colle plus au header). Le **titre du corps** (`PageHeader`) est **descriptif et distinct** du libellé de section du topbar (jamais « Catalogue » deux fois). Une page qui a **sa propre recherche** appelle `useHideTopbarSearch()` (`components/layout/topbar-search`) → **une seule** recherche par écran.

**À venir avec leur 1ʳᵉ surface (YAGNI — pas de primitive inutilisée)** : `ActionBar` (barre d'actions
sticky — viendra avec le LOT Workspace/CTD), `Section` (bloc titré — avec le 1er regroupement qui en a
besoin). Compléter les shadcn manquants (tooltip, popover, separator, switch, checkbox, avatar) **au fil**
des surfaces qui les consomment.

## Écrans de référence (preuve de la fondation)
- **Dashboard** (`features/dashboard/DashboardPage.tsx`) — **DA validée CEO le 2026-06-27 : c'est LA
  référence visuelle de toute l'app.** Look premium « Ultra-Performance » (cartes, bandeau KPI hero,
  badges de statut, drapeaux pays). Implémenté **aujourd'hui** via `dashboard-mockup.css` (palette
  `--pd-*` clair+dark + patterns card/KPI/badge), **pas encore** via les primitives : il **définit la
  cible** que les primitives devront produire (cf. règle LOT 2). Greeting = `<h1>` Syne ; chaque carte
  est une région a11y (`role="region"` + titre `<h2>`).
- **Shell** (`components/layout/app-shell.tsx`) — barre latérale **navy** (logo blanc + wordmark Syne ;
  nav mutée → active via `aria-current` : fond tinté + barre d'accent + texte blanc).
- **Catalogue** (`features/catalogue/CataloguePage.tsx`) — démontre la **structure** par primitives
  (`Page` + `PageHeader` + `EmptyState` + `Skeleton`) avec tokens sémantiques neutres. **À réconcilier
  avec la DA premium du Dashboard en LOT 2** (les primitives adoptent palette + patterns du dashboard,
  pas l'inverse).

→ **DA validée CEO le 2026-06-27.** Le LOT 2 fait **converger les primitives + le Catalogue vers cette DA**.

## Règle de déroulé (LOT 2)
**Convergence vers la DA du Dashboard.** Étape 1 = extraire la palette `--pd-*` et les patterns premium
(card, KPI hero, badge) du dashboard dans le système partagé (tokens globaux + primitives). Étape 2 =
migrer chaque surface — Catalogue en premier — vers ces primitives premium. Chaque surface migre **dans
sa propre tranche**, combinée à toute évolution fonctionnelle (jamais re-skin puis reconstruire). i18n +
recette visuelle finale = **en dernier** (cf. PLAN-LANCEMENT). On n'introduit une primitive nouvelle
qu'avec un consommateur réel.
