# Plan — Catalogue RIM (référentiel maître + cockpit produit)

> Cadré par le CTO (`/cto:plan`, 2026-06-27). Ne remplace pas `PLAN.md` (vision) ni
> `PLAN-LANCEMENT.md` (roadmap launch) ; c'est le plan d'exécution du **LOT 2 — Catalogue**.
>
> **Statut au 2026-06-27 — go/no-go VALIDÉ (CEO).** Les 3 décisions (§ bas de page) sont **verrouillées**.
> **M1 (fiche produit cockpit) LIVRÉ EN PROD** : PR #244 (cockpit DA à la lettre) + PR #245 (polish recette :
> docs info/admin côte à côte, icône comprimé unique). Front-only, 0 migration.
> **M2 (liste premium + recherche + filtres + drill-downs dashboard) LIVRÉ EN PROD** : PR #246. Front-only,
> 0 migration. CI 6/6, e2e catalogue (vrai navigateur) vert, budget d'entrée préservé (`<select>` natif, pas de
> Radix). Phase 1 (M1 + M2) **COMPLÈTE**.
> **WIZARD DE CRÉATION (M4 partiel) LIVRÉ EN PROD** : PR #252, **migration `0044`** (additive :
> `documents.holder/country/batch_number`). Wizard 3 sessions typeform (Identification + Titulaire/Fabricant
> appariés / Documents d'info en cartes, COA reclassé admin / Pièces admin en cartes + date délivrance,
> expiration, titulaire ; AMM → pays + N° ; COA → Batch N°). Ajout de pièces bufferisé (indépendant des
> champs), persistance + garde des requis à « Terminer ». Header langue/thème conservés (`useTopbar`), canvas
> #f9fafb.
>
> **M3 + M4 LIVRÉS EN PROD (2026-06-28, PR #253, migration `0045`).** M3 = table `parties` (RLS miroir
> produits + pgTAP) + FK `products.titulaire_id`/`fabricant_id` (`ON DELETE SET NULL`) + Dexie v13 +
> `parties-repository` (id DÉTERMINISTE FNV-1a → dédup serveur/multi-appareil) + `parties-sync` + sync
> séquencée parties→produits→docs (ordre FK ; 23503 reclassé transitoire → pas de perte de lien). M4 =
> auto-populate « 0 ressaisie » (`deriveProductLinks` dans create/updateProduct) + backfill idempotent (flag
> localStorage) + **hub Catalogue** (sous-nav Produits/Organisations/Autorités) + **liste Organisations**
> (agrégations produits/docs + drapeaux pays AMM + recherche) + **fiche Organisation** (rôles, pays/adresse/GMP
> éditables → Monitor, produits liés). CI 6/6 verte, recette navigateur PROD faite (backfill → 2 orgs dérivées
> de 4 produits, FK + parties synchronisées côté serveur, 0 doublon). **Reprendre : M5 (Autorités + polish).**

## L'idée (validée CEO via mockup)

Le Catalogue n'est plus une simple liste de produits : c'est le **référentiel de données maître RIM**
de l'app — **Produits + Organisations + Autorités** — avec une **fiche produit = cockpit réglementaire**.
C'est le moat « OS réglementaire » IDMP-ready de la north star.

### Décision de nommage (question CEO)

« Laboratoire » est imprécis (un labo peut aussi être fabricant). Le terme RA exact = **Titulaire
d'AMM (MAH)**. On ne fait **pas** 3 listes séparées qui dupliquent « Synthia Labs » : on modélise **une
seule entité « Organisation »** avec des **rôles** (Titulaire · Fabricant · Distributeur) — une org peut
cumuler les rôles (réalité RA + IDMP). Les **Autorités** (agences NMRA) sont à part = données de référence.

---

## 1. Objectif & métrique

- **Objectif** : faire du Catalogue le référentiel maître (produits + organisations + autorités) avec
  une fiche produit-cockpit.
- **Métrique** : depuis une fiche produit, l'état complet (documents / soumissions / historique /
  conformité / échéances) visible en **1 écran** ; chaque titulaire/fabricant a une **fiche réutilisable** ;
  **0 ressaisie** (auto-populate à l'enregistrement).

## 2. Scope (slice de valeur d'abord)

**Phase 1 = la fiche produit-cockpit (écran « Amoxicilline ») + liste premium**, sur les **données qui
existent déjà** (produits, documents, correspondances → Soumissions, audit → Historique, docAnalysis →
Conformité, dossiers → pays). Valeur visible tout de suite, **sans nouvelle table**.

## 3. Non-goals (pour l'instant)

- Pas de nouvelle architecture d'entité en Phase 1.
- Autorités = données de référence (pas une table tenant).
- CopiloT / Distributeurs = emplacements honnêtes (placeholders), pas de faux.
- **Zone A4 / rendu PDF intouchée** (on refait le chrome, pas le rendu du document).

## 4. Architecture & stack

- **Une table `parties`** (tenant-scoped, RLS) avec `roles[]` = `titulaire | fabricant | distributeur`,
  champs `nom / pays / adresse` + GMP (certificat + expiry) pour le rôle fabricant.
  → évite la duplication, reflète le cumul de rôles, **IDMP** (ADR-0001).
- **Produits** gagnent `titulaireId` / `fabricantId` (**FK nullable** ; le free-text actuel reste en
  secours pendant la transition → zéro régression).
- **Autorités** = **référence seedée par pays** (comme `COUNTRIES`), pas une table tenant.
- Dexie stores + sync = **miroir du pattern produits** (éprouvé).
- Migration **`0045` ADDITIVE** + **backfill idempotent** (créer les `parties` depuis les free-text
  distincts, puis lier les produits).
- Nommage table = `parties` (≠ `orgs` le tenant, pour éviter le clash) ; UI = « Titulaires d'AMM /
  Fabricants / Distributeurs ».

## 5. Milestones (slices indépendamment livrables)

| # | Slice | Phase | Effort | Statut |
|---|-------|-------|--------|--------|
| **M1** | **Fiche produit cockpit** : header + badges santé + onglets Identification/Documents/Soumissions/Historique/Conformité + conformité data-driven (dans Documents) + DA à la lettre + icône par forme galénique. | 1 | ~1–1,5 session | ✅ **LIVRÉ PROD** (PR #244 + #245) |
| **M2** | **Liste premium + filtres + drill-downs dashboard** : table premium + recherche + filtres pays/échéance/conformité + branchement des clics du dashboard (cartes/drapeaux → catalogue filtré). | 1 | ~0,5–1 session | ✅ **LIVRÉ PROD** (PR #246) |
| **M3** | **Modèle `parties` (backend)** : migration **`0045`** + FK produits (`titulaireId`/`fabricantId`) + **RLS + pgTAP** + Dexie + sync + backfill idempotent depuis les free-text. | 2 | ~1 session | ✅ **LIVRÉ PROD** (PR #253) |
| **M4** | **Wizard + auto-populate + fiches Organisations + hub** : wizard 3 sessions (PR #252) + auto-populate/lien `parties` (`deriveProductLinks`) + backfill idempotent + agrégations par org + liste & fiche Organisations + hub. | 2 | ~1 session | ✅ **LIVRÉ PROD** (PR #253) |
| **M5** | **Autorités (référence) + polish hub** + lignes de documents en cartes `.doc-row` (mineur reporté de M1). | 2 | ~0,5 session | ⬜ |

## 6. Risques & mitigations

- **Scope creep avant le launch** (N4 = seul gate) → **phaser** : Phase 1 ship-able sans migration ;
  Phase 2 = lot dédié, **pré ou post-launch au choix CEO**.
- **Backfill des free-text** (« Synthia Labs GmbH » vs « Synthia Labs ») → matching prudent + free-text
  gardé en secours + migration idempotente/réversible.
- **RLS/sync nouvelle table** (fuite inter-tenant) → **pgTAP par table** (règle N) + miroir du pattern produits.

## 7. Definition of done

Gates 6/6 · **pgTAP `parties`** · e2e parcours produit + (Phase 2) création → auto-populate → fiche ·
budget perf tenu · a11y AA · **0 régression auto-save / offline** · zone A4 intacte · advisors 0 ERROR.

## 8. Prochaine étape (handoff prochaine session)

**Phase 1 (M1+M2) + Phase 2 (M3+M4) livrés en prod.** Reste **M5 = Autorités (référence seedée par pays)
+ polish hub** (+ mineur reporté de M1 : lignes de documents en cartes `.doc-row`). **Prochaine migration
libre = `0046`** (`0045` = parties, PR #253 ; `ls supabase/migrations/` avant de numéroter ; appliquer via
MCP `apply_migration`). Autorités = données de référence (PAS une table tenant) → potentiellement 0 migration.

### Spécifs Phase 2 verrouillées (consignes CEO)

- **Wizard 3 étapes** (typeform-like) à la création produit.
- **Chaque document** porte le **titulaire/fabricant qui y figure**, lié à la **fiche Organisation**
  correspondante → permet de **« dire exactement le nombre de produits, activités, docs par org »**.
- **Colonnes suivies** : **pays de l'AMM** (alimente le **dashboard par pays**) + **N°lot** sur les COA.
- **0 ressaisie** : auto-populate à l'enregistrement (free-text gardé en secours pendant la transition).
- Migration **`0045`** = prochaine libre (additive + backfill idempotent + RLS/pgTAP par table).

---

## Go / no-go — 3 décisions ✅ VALIDÉES (CEO, 2026-06-27)

1. **Phasage** : Phase 1 (cockpit ✅ livré → liste M2) → Phase 2 (entités + hub + migration). ✅
2. **Modèle `parties` à rôles** (pas table-par-type) + Autorités en référence. ✅
3. **Nommage** : « Titulaire d'AMM » (pas « Laboratoire »), entité « Organisation ». ✅

**Phase 2 : décision avant/après GO-LIVE encore ouverte** *(reco CTO : M2 + Phase 2 juste après le cockpit,
sauf si le hub complet est voulu avant les pilotes).*
