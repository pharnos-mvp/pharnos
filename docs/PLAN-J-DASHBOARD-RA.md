# PLAN — Jalon J : Dashboard RA « poste de pilotage »

> Plan d'exécution du jalon J ([ROADMAP-MVP.md](ROADMAP-MVP.md) §J), ratifié par le CEO le 2026-06-13
> (« le rendre digne d'une OS RA »). Convention par jalon (cf. [PLAN-H-CORRESPONDANCE.md](PLAN-H-CORRESPONDANCE.md)) —
> **ne remplace pas** `PLAN.md` (V1) ni `PLAN-V2.md`.

## 1. Objectif & métrique de succès
- **Objectif** : transformer l'écran d'accueil (aujourd'hui `DashboardPage` = validité des pièces + veille
  statique) en **poste de pilotage RA** répondant en ~5 s à « *qu'est-ce qui requiert mon action, et où en
  est mon portefeuille ?* ».
- **Succès** : un pilote ouvre le dashboard **hors-ligne** et voit, **dérivé de ses vraies données** (zéro
  chiffre inventé), ses actions prioritaires + l'état de tous ses dossiers ; Lighthouse perf ≥ 90 / a11y ≥ 95.

## 2. Scope (tranche fine d'abord)
Refonte de `web/src/features/dashboard/` en **grille de cartes** (DA neutre), alimentée par des **sélecteurs
purs** sur Dexie. Livraison d'abord du bloc **« Actions requises »** (cœur de valeur), puis blocs suivants en
tranches indépendantes.

## 3. Non-goals
- Aucune nouvelle table Dexie · **aucun appel IA** · aucune Edge · aucune migration · aucune écriture serveur
  (états **dérivés** client-side, comme la home actuelle).
- Pas de champ « date de renouvellement AMM » dédié → on dérive de l'`expiryDate` des pièces AMM/admin
  existantes (un champ dédié serait une évolution de schéma, hors MVP).
- Pas de librairie de graphes lourde (recharts/d3) au MVP — visualisations légères en CSS/SVG inline.

## 4. Architecture & stack (100 % réutilisation de l'existant)
- **Source de données** : `useLiveQuery` (dexie-react-hooks) — pattern déjà en place (`DashboardPage`,
  `CataloguePage`…). Tables : `products, documents, dossiers, correspondences, correspondenceMessages,
  correspondenceReads, docAnalysis, auditLog`. **Toutes déjà synchronisées** (`*-sync.ts` : catalogue,
  documents, dossier, correspondence, audit…). → **rien à ajouter côté données.**
- **Dérivations** : nouveau module **`dashboard-data.ts`** = fonctions **pures** `(arrays) → view-models`,
  donc **unit-testables** (le « zéro hallucination » est garanti par construction). Réutilise :
  - `dossierDisplayStatus()`, `DOSSIER_STATUS_ORDER`, `STATUS_BADGE_CLASSES`, `statusLabel`
    (`features/correspondence/correspondence-constants.ts`) — **état des dossiers** ;
  - la logique d'expiry de l'actuel `DashboardPage` (seuils 30/60/90 j) — **échéances** ;
  - `RegafyFinding` (`features/workspace/regafy.ts`, champ `severity`) en cache `docAnalysis` —
    **conformité** (compte des non-conformités, sans relancer d'IA) ;
  - non-lus = `correspondenceReads.lastSeenAt` vs `correspondenceMessages` `author:'recipient'`.
- **UI** : un composant par bloc sous `features/dashboard/components/`, composés dans `DashboardPage.tsx`.
  Réutilise `components/ui` (badge, card), `lucide-react`, `useI18n` (FR/EN), `useOrgId`. **Palette DA
  NEUTRE** (oklch chroma 0) ; la couleur n'est admise que pour les **statuts** (via `STATUS_BADGE_CLASSES`).
  Route `/dashboard` inchangée (déjà lazy-loaded dans `routes.tsx`).
- **Rationale** : périmètre front isolé, déterministe, sans dépendance backend → vélocité + testabilité max,
  risque quasi nul.

### Fichiers
- **Nouveaux** : `features/dashboard/dashboard-data.ts` (+ `.test.ts`) ; `features/dashboard/components/`
  (`ActionsRequises.tsx`, `PipelineCard.tsx`, `EcheancesTimeline.tsx`, `CorrespondanceEnCours.tsx`,
  `ConformiteCard.tsx`, `PortefeuilleCard.tsx`, `VeilleCard.tsx`).
- **Modifiés** : `features/dashboard/DashboardPage.tsx` (compose les blocs), `regulatory-watch.ts` (enrichi).

## 5. Milestones (tranches verticales — chacune livrable & recettable)
- **J1 — Cœur : grille + « Actions requises »** (~0,75 session)
  Scaffold de la page (grille responsive, DA) + `dashboard-data.ts` (sélecteurs + tests) + bloc to-do
  priorisé : pièces expirées/expirantes, dossiers en suspens à traiter, réponses d'agence en attente,
  non-conformités Regafy, messages non lus → liens directs. **Déjà un vrai poste de pilotage.**
- **J2 — Pipeline dossiers + Correspondance en cours** (~0,5 session)
  Compteurs par état (clic → filtre dossiers) + activité récente (`auditLog`) ; fils ouverts / en attente /
  décisions récentes / non-lus.
- **J3 — Échéances & renouvellements + Portefeuille** (~0,5 session)
  Timeline 30/60/90 j (pièces admin + AMM via expiry) ; synthèse portefeuille (produits, couverture
  pays/AMM UEMOA-CEDEAO, répartition par activité).
- **J4 — Conformité Regafy + Veille enrichie + polish** (~0,5 session)
  Synthèse conformité (non conformes, analyses en attente, dernier audit) ; veille filtrable par pays/source ;
  (option) KPIs (délai de montage, taux d'acceptation) ; a11y + budget perf + tests + recette.

_Total ≈ 2 sessions (conforme à l'estimation roadmap)._

## 6. Risques & mitigations
1. **Performance** (multi-`useLiveQuery` + agrégations sur de gros volumes) → 1 requête batchée par domaine,
   dérivations `useMemo`, listes plafonnées (top N), rendu paresseux sous la ligne de flottaison ; budget
   Lighthouse vérifié en CI.
2. **Justesse des indicateurs (zéro hallucination)** → toutes les dérivations sont des **fonctions pures
   unit-testées** ; réutilisation du helper canonique `dossierDisplayStatus` ; **aucune IA**.
3. **Dérive de périmètre (8 blocs)** → J1 livre seul la valeur ; blocs suivants indépendants ; KPIs
   explicitement optionnels ; discipline palette DA (pas de nouvelle couleur hors statuts).

## 7. Definition of Done
- Données 100 % dérivées de Dexie — **0 IA / 0 Edge / 0 migration / 0 écriture serveur**.
- **Fonctionne hors-ligne** (parcours e2e offline vert).
- Sélecteurs `dashboard-data.ts` **unit-testés** (vitest).
- **a11y axe** clean + **Lighthouse perf ≥ 90 / a11y ≥ 95** en CI ; budget bundle tenu (route lazy, pas de
  lib lourde ajoutée).
- **i18n FR/EN** sur toutes les nouvelles chaînes ; **DA neutre** respectée.
- **Recette CEO en prod** après merge (pattern projet).

## 8. Prochaine étape recommandée
Construire **J1** : grille + `dashboard-data.ts` (avec tests) + bloc « Actions requises », branché sur la
route `/dashboard` existante → PR → recette CEO. Puis J2 → J3 → J4.
