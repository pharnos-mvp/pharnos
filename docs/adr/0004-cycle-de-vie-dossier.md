# ADR-0004 — Cycle de vie du dossier (« la spine ») : journal append-only + état dérivé

**Date** : 2026-06-30 · **Statut** : accepté (jalon M0) · **Périmètre** : backbone du cycle de vie
réglementaire du dossier (Montage → Revue → Décision → Dépôt → Soumission → Notifications → AMM),
de bout en bout, traçable et partageable. Réf. : [docs/PLAN-LIFECYCLE.md](../PLAN-LIFECYCLE.md),
mockup validé `docs/mockups/roadmap-parcours-dossier.html`, mémoire `dossier-lifecycle`.

## Contexte

Pharnos modélisait jusqu'ici **3 états amont** (Montage/Revue/Décision) via la correspondance
tokenisée (ADR-0003) — gros **trou aval** : une fois le dossier accepté par l'agent local, plus rien
ne traçait Dépôt → Soumission → Notifications → AMM. Or la valeur produit n°1 (brief CEO) est : **chaque
partie voit, d'un coup d'œil et en temps réel, où en est exactement un dossier**, et un Expert RA peut
répondre « je vérifie sur Pharnos » et **partager la timeline** en < 30 s.

Contraintes : rester **offline-first** (Dexie + outbox + sync), **multi-tenant RLS** (pilier
confidentialité pharma), **zone A4 byte-exact intacte** (la compilation PDF n'est pas touchée), à
coût zéro, sans casser le statut de correspondance existant.

## Décisions

1. **Source de vérité = journal append-only `lifecycle_events`** (migration `0047`). Une ligne =
   un événement réglementaire (Dépôt, Soumission, complément agence, AMM…) + sous-workflows
   (échantillons, paiement, relances). **IMMUABLE** (ni `updated_at` ni `deleted_at`, comme
   `audit_log`/`correspondence_messages`) : une correction = un **nouvel** événement. Vocabulaire
   `type` **codé en dur** (CHECK SQL) — étendre le cycle = une migration, **jamais de la config**
   (anti-dérive, cf. risque #3 du plan).

2. **L'étape courante et les sous-états sont DÉRIVÉS, jamais stockés.** Fonction **pure et testée**
   `deriveLifecycle({ dossierId, dossierCreatedAt, events, correspondences })` →
   `{ stages[7], currentStageId, status, progress, journal }`. Cohérent ADR-0003 (décision n°4) :
   **aucune écriture serveur dans `dossiers`** → zéro conflit avec la sync offline-first (un upsert
   client ne peut pas écraser un état, et réciproquement). Une batterie de tests couvre la machine
   à états (étapes, avancement, journal) + les libellés.

3. **On SUPERPOSE, on ne remplace pas.** La correspondance (0017) reste la source des **étapes 1–3**
   (Montage = monté/envoyé ; Revue = décision rendue ; Décision = acceptée) ; le journal porte les
   **étapes 4–7**. `deriveLifecycle` **fusionne** les deux et réutilise la règle ADR-0003 (dernière
   correspondance non révoquée-sans-décision l'emporte). Le `dossierDisplayStatus` existant reste
   inchangé ; `LifecycleStatus` en est l'**extension aval**.

4. **Complétude MONOTONE** (robustesse + 2 personas). Chaque étape a une condition propre de
   franchissement ; on rend la complétude monotone de l'aval vers l'amont : un événement aval (ex.
   `submitted`) implique **toutes les étapes amont franchies**. Cela gère la **persona « Agence
   locale »** (l'agence EST l'org → dépose/soumet sans passer par la correspondance) aussi bien que
   la **persona « Labo »** (correspondance-driven). Les 6 mêmes jalons ; « qui agit » diffère — déjà
   supporté par les rôles d'org (migration `0027`), qu'on **exploite** (on n'en crée pas).

5. **RLS = miroir de la correspondance (0028).** SELECT pour **tout membre** de l'org (chaque partie
   suit le parcours) ; INSERT réservé aux **gestionnaires de soumission**
   (`current_user_submission_org_ids` : admin + agence_locale/representation/expert_ra) — faire
   avancer un jalon est un acte de gestion de soumission. **Aucune policy UPDATE/DELETE** → append-only
   infalsifiable (ALCOA++). Pas de FK sur `dossier_id` (pattern 0017) : pas de blocage d'ordre de
   synchro. pgTAP prouve isolation tenant + gating d'écriture + append-only.

6. **Config pays = référentiel TS statique versionné** (`lifecycle-config.ts`), **extension** de
   `roadmap-data.ts` (agence/langue/barème déjà là) avec les invariants opérationnels africains :
   **mode de soumission** (portail/physique/papier), **agent local requis**, **autorisation d'import
   d'échantillons**. 10 pays MVP semés avec leurs **modes réels** (validés CEO) ; « à confirmer » →
   défaut prudent marqué `unconfirmed`. Choisi vs table SQL : maintenu par PR, versionné, zéro
   migration pour un ajustement de barème (forme tranchée au Lot 0 du plan).

7. **Sync = calque de l'append-only correspondance.** Curseur composite `ts|id` paginé sur
   `created_at` ; push `create` idempotent (`ignoreDuplicates`) ; pull `bulkPut` aveugle (immuable →
   **pas de LWW**). Realtime **différé à M1** (accélérateur UX quand la Roadmap consommera le live ;
   la sync pull reste la source de vérité).

8. **Forward-compat noté, non construit.** Backbone Application → Submission → Registration
   (IDMP-ready), `scope` national|régional, `markets[]` — le modèle n'enferme pas « 1 dossier = 1
   pays ». Sous-workflows échantillons (M3) / paiement (M4) / agent tokenisé (M5) / relances (M6) :
   leurs `type` d'événements sont **déjà dans le vocabulaire** (zéro migration future pour les jalons
   planifiés), mais leur UI/dérivation de conditions arrive à leur tranche.

## Conséquences

- **M0 = fondation pure, zéro UI** : migration + Dexie mirror/sync/outbox + `deriveLifecycle` testé +
  config pays + ADR. Vérifiable par **tests unitaires + pgTAP + typecheck** (hors zone navigateur).
- La Roadmap `/workspace/:dossierId/roadmap` (route déjà montée) sera **refondue en M1** pour rendre
  le mockup validé à partir de `deriveLifecycle` + `lifecycle-config`.
- **Écart assumé vs prose du plan** : le plan parle de « 6 jalons » ; le mockup validé montre **7
  étapes** (Montage inclus, « 4/7 »). On modélise les **7 étapes** (= les 6 jalons *après* Montage) —
  le mockup validé fait foi.
- Limite assumée : la config pays « à confirmer » (BF/GW/SN) retombe sur un défaut prudent jusqu'à
  validation du mode réel (marqué `unconfirmed` → l'UI peut le signaler).
- Zone A4 **intacte** ; aucune dépendance npm ajoutée ; budget bundle préservé (M0 = data + logique).
