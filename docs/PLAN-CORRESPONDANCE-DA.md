# PLAN — Refonte « boîte de correspondance » sur la DA premium + mini-roadmap en header

> **CTO plan (2026-07-09).** Fait suite au constat : la Correspondance est la seule surface app
> restée sur l'habillage « WhatsApp » du 2026-06-13 (tokens OK, mais pas reconstruite sur les
> primitives premium — décision LOT 10 « pas de re-skin », [PLAN-LANCEMENT.md](PLAN-LANCEMENT.md):138).
> S'insère **avant le LOT 11 landing** (les captures du landing montreront cette surface).
> Ne PAS écraser [PLAN.md](PLAN.md) (plan maître stable) — ce fichier suit la convention par-feature.

## 1. Objectif & métrique de succès
- **Objectif** : upgrader la boîte de correspondance sur la DA premium et afficher, **au header de
  chaque discussion, une mini-roadmap (les 7 étapes de la spine)** pour voir d'un coup d'œil où en
  est le dossier — sans quitter le fil.
- **Succès** : sur chaque conversation, l'étape courante (`deriveLifecycle`) est lue **sans clic**
  (< 1 s), en clair/sombre AA, FR/EN ; la surface passe le scan axe (thème sombre inclus) ; 0 migration.

## 2. Scope (tranche verticale mince, valeur d'abord)
1. **Mini-roadmap dans le header du fil** (panneau par-dossier existant) — **c'est le cœur de la demande**.
2. **Polish DA du panneau** : header/statuts/états vides sur primitives ; bulles WhatsApp **conservées**.
3. *(optionnel, séquencé)* **Menu « Correspondance » = inbox global** dans le rail latéral gauche.

## 3. Non-goals
- **Pas de rebuild du fil** : les bulles `wa-in/wa-out` (UX validée CEO) restent — on ré-habille l'ossature.
- **Aucune nouvelle table / migration** : la mini-roadmap **dérive** de `deriveLifecycle` (pur, testé).
- **Zone A4 / PDF** : intouchée (export du fil déjà livré, #293).
- **Pas de re-modélisation du cycle de vie** : on RÉUTILISE `lifecycle-constants.ts` tel quel.
- Multi-destinataires / compte Agence authentifié = backlog post-GO-LIVE (inchangé).

## 4. Architecture & stack (aucune décision nouvelle — réutilisation)
- **Source unique de l'état** : `deriveLifecycle()` + `LIFECYCLE_STAGES` + `LIFECYCLE_STATUS_TONE`
  (`web/src/features/workspace/lifecycle-constants.ts`). **Zéro duplication** de la logique d'étapes.
- **Composant à extraire** : `RoadmapMini` (rail **ou** ruban selon choix CEO) — sortir la pipeline de
  `RoadmapPage.tsx` (`StageNode`, `DOT_CLASS`, ligne+fill) en primitive réutilisable
  `components/ui/roadmap-mini.tsx`. La page Roadmap la consomme aussi (dé-duplication nette).
- **Données** : `CorrespondencePanel` liste déjà les correspondances ; on ajoute un pull
  `listLifecycleEvents(dossierId)` (déjà offline-first, Dexie) → `deriveLifecycle` en `useMemo`.
  Pour l'inbox global (slice 3) : lecture agrégée Dexie sur les correspondances **scopée CS1**
  (`useMemberScope`, même filtre que le board) — **vue** sur les données existantes, pas un silo.
- **Primitives DA** : `Page`/`PageHeader`/`Section`/`StatusBadge`/`EmptyState`/`ErrorState` +
  `ui/pill.ts` (déjà partagés). Tokens light/dark canoniques (`index.css`) — rien d'inventé.
- **i18n** : libellés déjà bilingues dans `lifecycle-constants.ts` (FR/EN) — réutilisés tels quels.
- **Complémentarité cloche** : le centre de notifications (#302/#303) = signal (non-lus/alertes) ;
  le menu Correspondance = l'inbox triable. Deux rôles distincts, **pas de doublon**.

## 5. Milestones (tranches livrables, chacune recettable)
- **Slice 1 — Mini-roadmap en header** (~0,75 s.) : extraire `RoadmapMini`, brancher
  `CorrespondencePanel` sur `deriveLifecycle` (pull events), rendu dans le header de CHAQUE fil +
  la page publique `/r/<token>` (réutilise l'onglet Parcours M7). *Valeur immédiate.*
- **Slice 2 — Polish DA panneau + lignes de liste** (~0,5 s.) : header/statuts/états vides sur
  primitives ; chaque ligne de discussion gagne le micro-tracé (barre 7 seg. **ou** anneau) + badge
  statut ; **solder la dette `formatBytes`** (3 formatteurs Ko/KB, [PLAN-RESTANT.md](PLAN-RESTANT.md):178).
- **Slice 3 — Menu « Correspondance » (inbox global)** *(optionnel, GO CEO)* (~1–1,5 s.) : route +
  liste agrégée tous-dossiers scopée CS1 + realtime + filtres (Action requise / En attente) ; clic →
  ouvre le fil **avec son contexte dossier** (header mini-roadmap). Complète la cloche.
- **Cœur (1+2) ≈ 1,25 session** ; **+ Slice 3 ≈ 2,5–2,75 session.**

## 6. Risques & mitigations
1. **Perf `deriveLifecycle` en liste** (slice 3) : dérivation par fil. → `useMemo` par dossier,
   pré-filtre des dossiers terminaux (`amm_*`), fonction pure déjà O(événements) faible aux volumes MVP.
2. **Fuite de périmètre CS1 dans l'inbox global** : un membre scopé ne doit voir que ses dossiers.
   → réutiliser `useMemberScope` + le filtrage du board ; lecture locale déjà scopée à la sync ;
   RLS correspondance déjà couverte pgTAP. **Aucune nouvelle surface RLS.**
3. **Dérive de scope (2ᵉ board)** : l'inbox pourrait dupliquer le board Opérations. → garder l'inbox
   **conversation-first** (dernier message, statut, mini-roadmap, non-lus) ; le board reste le cockpit.

## 7. Definition of done
Mini-roadmap **dérivée de `deriveLifecycle`** (source unique, zéro logique d'étape dupliquée) ·
clair/sombre **AA** (scan axe thème sombre, précédent LOT 8) · **FR/EN** vérifié · bulles `wa-*`
préservées · dette `formatBytes` soldée · vitest sur tout helper pur extrait · e2e smoke du panneau ·
budget bundle tenu · **0 migration** · recette navigateur (vrai Chrome, la surface est sensible SW).

## 8. Statut — LIVRÉ EN PROD (PR #312, 2026-07-09)
~~1ʳᵉ passe rejetée en recette CEO (cartes + panneau superposé, ruban replié)~~ → **mockup C
(`docs/mockups/correspondance-boite-de-reception.html`) validé GO CEO et implémenté le jour
même** : `/correspondance` = cockpit 2 volets (fils + conversation, scrolls internes), **rail
Parcours PERMANENT** dans chaque conversation (inbox **et** panneau du dossier), onglet nav
**« Boîte de réception »** + badge non-lus, bandeau « Action requise » avec CTA, anneau n/7 par
fil. Extraction sans duplication : `use-dossier-conversation` + `ConversationPane` (le panneau
overlay du dossier garde son comportement). Dette `formatBytes` soldée. CI 6 jobs verte
(e2e/RLS/lighthouse inclus), déployé prod. ⚠️ pièges consignés : sélection desktop VERROUILLÉE en
état (dérivée de la liste triée non-lus-d'abord = cascade `markConversationRead`) ; journal
d'accès du volet `md:hidden` quand l'aside du panneau l'affiche ; Côte d'Ivoire = **AIRP**
(DPML = Togo). **Reste : recette CEO en prod (vrai Chrome).**
