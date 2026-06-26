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

## Principes
1. **Composer, pas improviser** — une page = `Page` + `PageHeader` + des sections/états, pas des
   `<div>` ad-hoc. Si un besoin revient 2×, c'est une primitive.
2. **Typographie de marque** — **Syne** (display, token `font-display`) sur les titres de page
   (h1 = `font-display text-2xl font-semibold tracking-tight`) ; **DM Sans** (corps, `font-sans`)
   partout ailleurs ; sous-titre = `text-sm text-muted-foreground`. Auto-hébergées (`@fontsource-variable`,
   offline). **A4/document = Times New Roman** (zone protégée). 2 graisses (400/500).
3. **Rythme d'espacement** (base 4 px, densité équilibrée-pro) — entre blocs de page = `space-y-6`
   (24 px, via `Page`) ; intra-bloc = `gap-4` (16 px) ; padding carte = 16–20 px.
4. **Couleurs** — tokens `index.css`, **jamais de couleur en dur** (invisible en dark sinon). **Shell
   navy** (`--sidebar` = `#0a1628` clair / `#010409` dark) = identité de marque ; **accent**
   `--sidebar-primary` (`#3b82f6`). **Palette de statut sémantique** `--success` / `--warning` /
   `--danger` / `--info` (+ `-subtle` = fond de badge, `-subtle-foreground` = texte AA), clair + dark.
   `--brand` (`#263f73`) = **marque document gelée** (PDF byte-exact), distincte du shell. Dark = GitHub.
5. **z-index** (convention, règle les bugs de barres collantes) : contenu `z-0` · barre sticky `z-20`
   · dropdown/popover `z-30` · overlay `z-40` · modal `z-50` · toast (sonner) au-dessus.
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

**À venir avec leur 1ʳᵉ surface (YAGNI — pas de primitive inutilisée)** : `ActionBar` (barre d'actions
sticky — viendra avec le LOT Workspace/CTD), `Section` (bloc titré — avec le 1er regroupement qui en a
besoin). Compléter les shadcn manquants (tooltip, popover, separator, switch, checkbox, avatar) **au fil**
des surfaces qui les consomment.

## Écrans de référence (preuve de la fondation)
- **Dashboard** (`features/dashboard/DashboardPage.tsx`) — `Page` + `PageHeader` (salutation + date +
  CTA) + **bandeau KPI hero** (`KpiCards` : 4 indicateurs dérivés des données, `StatusBadge` sémantiques).
- **Shell** (`components/layout/app-shell.tsx`) — barre latérale **navy** (logo blanc + wordmark Syne ;
  nav mutée → active via `aria-current` : fond tinté + barre d'accent + texte blanc).
- **Catalogue** (`features/catalogue/CataloguePage.tsx`) — `Page` + `PageHeader` (avec action) +
  `EmptyState` (primitive, fini le doublon local) + `Skeleton` au chargement (fini le « Chargement… »).

→ **Validation CEO en navigateur réel** avant de dérouler la refonte surface par surface (LOT 2).

## Règle de déroulé (LOT 2)
Chaque surface migre vers les primitives **dans sa propre tranche**, combinée à toute évolution
fonctionnelle de cette surface (jamais re-skin puis reconstruire). i18n + recette visuelle finale =
**en dernier** (cf. PLAN-LANCEMENT). On n'introduit une primitive nouvelle qu'avec un consommateur réel.
