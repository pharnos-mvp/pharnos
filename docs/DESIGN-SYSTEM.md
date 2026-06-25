# Design-system Pharnos — fondation (LOT 1)

> **Contrat visuel et UX unique de l'app.** Objet du LOT 1 du [PLAN-LANCEMENT.md](PLAN-LANCEMENT.md) :
> que **chaque surface se compose des mêmes primitives** → uniformité par construction, zéro
> « chaque page improvise ». Densité validée CEO (2026-06-25) = **équilibrée-pro** (aéré mais efficace).
> **Zone protégée** : surfaces document/A4 (`.editor-page`, `.tplform-sheet`, rendu PDF) = byte-exact au
> PDF compilé → **hors design-system** (on ne touche que le chrome autour).

## Principes
1. **Composer, pas improviser** — une page = `Page` + `PageHeader` + des sections/états, pas des
   `<div>` ad-hoc. Si un besoin revient 2×, c'est une primitive.
2. **Hiérarchie typo arrêtée** — h1 page = `text-2xl font-semibold tracking-tight` ; sous-titre =
   `text-sm text-muted-foreground` ; corps = `text-sm`. 2 graisses (400/500).
3. **Rythme d'espacement** (base 4 px, densité équilibrée-pro) — entre blocs de page = `space-y-6`
   (24 px, via `Page`) ; intra-bloc = `gap-4` (16 px) ; padding carte = 16–20 px.
4. **Couleurs** — tokens existants (cf. `index.css`) : neutres pour le chrome, `--brand` (navy
   `#263f73`) = **accent d'action + marque document** ; dark = palette GitHub. Ne jamais coder une
   couleur en dur → toujours un token (invisible en dark sinon).
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

**À venir avec leur 1ʳᵉ surface (YAGNI — pas de primitive inutilisée)** : `ActionBar` (barre d'actions
sticky — viendra avec le LOT Workspace/CTD), `Section` (bloc titré — avec le 1er regroupement qui en a
besoin). Compléter les shadcn manquants (tooltip, popover, separator, switch, checkbox, avatar) **au fil**
des surfaces qui les consomment.

## Écrans de référence (preuve de la fondation)
- **Dashboard** (`features/dashboard/DashboardPage.tsx`) — `Page` + `PageHeader`.
- **Catalogue** (`features/catalogue/CataloguePage.tsx`) — `Page` + `PageHeader` (avec action) +
  `EmptyState` (primitive, fini le doublon local) + `Skeleton` au chargement (fini le « Chargement… »).

→ **Validation CEO en navigateur réel** avant de dérouler la refonte surface par surface (LOT 2).

## Règle de déroulé (LOT 2)
Chaque surface migre vers les primitives **dans sa propre tranche**, combinée à toute évolution
fonctionnelle de cette surface (jamais re-skin puis reconstruire). i18n + recette visuelle finale =
**en dernier** (cf. PLAN-LANCEMENT). On n'introduit une primitive nouvelle qu'avec un consommateur réel.
