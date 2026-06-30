# PLAN — Cycle de vie du dossier (« la spine ») + Roadmap « parcours du dossier »

> Statut : **plan validé-en-attente** (mockup Roadmap validé CEO : `docs/mockups/roadmap-parcours-dossier.html`).
> Réf. domaine : mémoire `dossier-lifecycle`. Backbone inspiré des grands RIM (Application → Submission →
> Registration + interactions HA), couche opérationnelle africaine en plus (mandataire, échantillons,
> paiement, canal physique/portail, journal de confiance). Migration libre : `0047`.

## 1. Objectif & métrique de succès

- **Objectif** : faire de Pharnos le lieu où **chaque partie voit, d'un coup d'œil et en temps réel, où se
  trouve exactement un dossier** dans son cycle de vie réglementaire — de bout en bout, avec traçabilité.
- **Métrique** : sur les 3 pilotes, **100 % des dossiers actifs portent une étape de cycle de vie à jour**
  et un **journal horodaté** ; un Expert RA peut répondre « je vérifie sur Pharnos » et **partager la
  timeline** d'un dossier en < 30 s.

## 2. Scope — tranche verticale qui livre de la valeur en premier

**Increment 1 (cœur, M0–M2)** : le **backbone du cycle de vie** + la **Roadmap « parcours du dossier »**
en lecture + les **actions Labo** pour faire avancer les jalons. → livre le « où est mon dossier » et le
« laissez-moi vérifier sur Pharnos », sans échantillons/paiement/agent/relances.

**MVP complet (M0–M6)** : ajoute les sous-workflows **échantillons** et **paiement** (confirmation, zéro
fintech), la **participation de l'agent local par liens tokenisés**, et les **relances auto**.

**Pays au MVP (10)** : 8 UEMOA (Bénin, Burkina Faso, Côte d'Ivoire, Guinée-Bissau, Mali, Niger, Sénégal,
Togo) + Ghana + Nigeria — `country_regulatory_config` semée avec leurs **modes réels** :

| Pays | Mode de soumission | Agent local | Autorisation import échantillons |
|---|---|---|---|
| Bénin, Côte d'Ivoire | portail national + dossier physique | requis | oui |
| Nigeria | portail (NAPAMS, entité locale) | requis | oui |
| Togo, Mali, Niger | dépôt physique | requis | oui |
| Ghana | papier (CTD, pas d'eCTD ; statut vérifié physiquement) | requis | oui |
| Burkina Faso, Guinée-Bissau, Sénégal | à confirmer (défaut : physique) | requis | oui |

## 3. Non-goals (ce qu'on ne construit PAS maintenant)

- ❌ Moteur de workflow générique / BPMN / state-machine configurable — **les 6 jalons sont codés en dur**.
- ❌ **Fintech** / déplacement d'argent (seulement preuve + confirmation).
- ❌ **Comptes multi-parties** agents/agences — l'agent local agit par **liens tokenisés** (correspondance).
- ❌ Procédures **régionales/continentales AMA** (joint assessment, listing) — modèle gardé extensible, pas construit.
- ❌ **Marketplace**, contrats e-signés, paiement intégré — couches « réseau » ultérieures.
- ❌ UI admin éditable de la config pays — référentiel par code au MVP.

## 4. Architecture & stack

**Principe directeur : invariant codé en dur, variable en config.** Les 6 jalons sont stables ; le canal,
le portail, la langue, les délais, l'exigence d'agent/d'autorisation d'import sont **par pays**.

- **Source de vérité = journal append-only** `lifecycle_events` (id, dossier_id, type, acteur, occurred_at,
  payload, doc_refs). L'**étape courante + sous-états (échantillons/paiement) sont DÉRIVÉS** par une fonction
  pure `deriveLifecycle(events, correspondence, config)`. → pas de statut mutable stocké (cohérent
  ADR-0003) ; idéal offline-first (append = pas de conflit LWW destructeur).
- **On superpose, on ne remplace pas** : la correspondance existante (étapes Revue/Décision) reste la source
  des états 1–3 ; le journal porte les états aval 4–6. `deriveLifecycle` fusionne les deux.
- **`country_regulatory_config`** : extension du référentiel **Autorités/roadmap** existant (forme — TS
  statique vs table — confirmée au Lot 0 ; défaut : référentiel TS versionné, maintenu par PR).
- **Stack (inchangé, éprouvé)** : Dexie+outbox+LWW (offline) · Supabase Postgres + **RLS multi-tenant** +
  Edge (sync + liens tokenisés) · React + DA verrouillée · **zone A4 byte-exact intacte** (le cycle de vie
  ne touche pas la compilation PDF).
- **Agent local** : réutilise l'infra **correspondance tokenisée** (Edge, liens TTL) — il confirme/ dépose
  des pièces sans compte ; le Labo voit la synchro en quasi temps réel.
- **PERSONA de l'org (rôles DÉJÀ en place — migration `0027`)** : l'org est **mono-partie** ; ses 6 rôles
  (`admin`, `ra_officer`, `reviewer`, `agence_locale`, `agence_representation`, `expert_ra`) sont déjà
  enforced en RLS (`agence_*`/`expert_ra` = gestion des soumissions). **2 personas d'org coexistent donc** :
  (a) **Labo/Titulaire = l'org** → l'agent local est EXTERNE (liens tokenisés) ; (b) **Agence Locale = l'org**
  → l'agence EST le mandataire/soumetteur, le labo est externe ou une `party`. ⇒ **le cycle de vie est
  RELATIF à la persona** (mêmes 6 jalons, mais « qui agit » vs « qui attend » diffère) ; l'UI Roadmap
  s'adapte au rôle de l'org, et le journal (event + acteur) le supporte déjà. **On EXPLOITE ces rôles, on
  n'en crée pas.** La vraie multi-partie DANS une org (`party_id` sur `memberships` + RLS scopé par client)
  reste un **non-goal** (cf. §3).
- **Forward-compat (noté, non construit)** : backbone Application → Submission → Registration (IDMP-ready) ;
  `scope` national|régional|continental ; `markets[]` au lieu de `country` unique. Le modèle ne doit pas
  enfermer « 1 dossier = 1 pays » de façon bloquante.
- **ADR à produire au Lot 0** (`docs/adr/0004-cycle-de-vie-dossier.md`) : journal-dérivé vs stocké, RLS des
  nouvelles tables, fusion correspondance↔journal, schéma de la config pays.

## 5. Jalons (tranches verticales, chacune livrable)

| # | Tranche | Contenu | Effort |
|---|---|---|---|
| **M0** ✅ | **Fondation** | migration `0047` (`lifecycle_events` + RLS + index sync) ; Dexie mirror + sync + outbox ; `deriveLifecycle()` pur + tests ; `country_regulatory_config` semée (10 pays) ; ADR-0004 — **LIVRÉ (PR en revue)** | **L** |
| **M1** | **Roadmap (lecture)** | refonte `/workspace/:dossierId/roadmap` = parcours du dossier : pipeline live (dérivé) + référence (config pays) + journal + badge statut (le mockup validé) | **M** |
| **M2** | **Actions Labo** | faire avancer les jalons (Transmettre / Soumis [+mode+preuve] / Notification reçue / AMM) → append `lifecycle_events` ; carte « étape en cours » actionnable | **M** |
| **M3** | **Échantillons** | sous-workflow demande → autorisation import → expédition → remise + emplacements pièces (autorisation, AWB) | **M** |
| **M4** | **Paiement** | facture → preuve (SWIFT) → confirmation 2 niveaux + pièces (zéro fintech) | **M** |
| **M5** | **Agent local (tokenisé)** | l'agent confirme dépôt/soumission, dépose preuves, relaie notifications via lien tokenisé (réutilise correspondance) → timeline partagée | **L** |
| **M6** | **Relances auto** | règle « jours-en-étape > seuil → notifier » sur l'infra notif/e-mail existante ; seuil réglable | **S** |

**Mockup-first** pour toute surface neuve hors Roadmap (déjà validée) : la config pays (si UI un jour) et
les écrans tokenisés de l'agent (M5).

## 6. Risques & mitigations (top 3)

1. **Cohérence du statut (dérivé vs correspondance existante, offline)** → journal append-only = source de
   vérité ; `deriveLifecycle` pure + testée ; **additif** (ne casse pas le statut de correspondance) ; ADR-0004.
2. **Multi-partie sans comptes (agent local)** → réutiliser l'infra **correspondance tokenisée** déjà en
   prod ; **différé à M5** — l'increment 1 (M0–M2) fonctionne **Labo-only**.
3. **Sur-modélisation / dérive de la config pays** → jalons **codés en dur** ; config-driven semée avec les
   modes **réels** et **validée par le CEO (expert RA)** ; non-goals explicites contre le scope creep fintech/marketplace.

## 7. Definition of Done (par tranche)

- Gates **6/6** verts : `web` (typecheck·lint·format·test·build) · `e2e` · `lighthouse` (perf·a11y) ·
  `rls` (pgTAP — **tests d'isolation tenant des nouvelles tables**) · `edge` · `secrets`.
- Revue **cto:code-reviewer = SHIP** (+ a11y).
- **Zone A4 byte-exact intacte** (aucun changement de la compilation PDF).
- Migration **additive** appliquée + vérifiée (MCP), `format:check` OK, budget bundle respecté.
- **Recette navigateur réelle** (la spine est vérifiable hors zone protégée).
- Pour M1+ : surface **validée CEO** (mockup d'abord si neuve).

## 8. État & prochaine étape

**Lot M0 — Fondation : LIVRÉ (PR en revue, branche `feat/lifecycle-m0-foundation`).** ADR-0004 +
migration `0047` (`lifecycle_events` + RLS append-only, pgTAP) + `deriveLifecycle()` pur (7 étapes,
17 tests) + `country_regulatory_config` TS (10 pays) + Dexie mirror/sync/outbox + repository. Gates
locaux 6/6 verts ; revue `cto:code-reviewer` = **SHIP**. ⚠️ **Application de la migration `0047` en
prod = étape séparée à autoriser explicitement** (le garde-fou harness bloque l'écriture DB prod
autonome) — la CI `rls` la valide déjà sur base propre.

**Prochaine tranche : M1 — Roadmap (lecture)** : refonte de `/workspace/:dossierId/roadmap` (route déjà
montée) pour rendre le mockup validé à partir de `deriveLifecycle` + `lifecycle-config` (pipeline live,
référence réglementaire, journal, badge). Mockup déjà validé CEO → prête à démarrer.
