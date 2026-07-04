# PLAN — Cycle de vie du dossier (« la spine ») + Roadmap « parcours du dossier »

> Statut : **M0–M4 + CS1 LIVRÉS** (M0 #272 migration `0047` · M1 #273→#275 · M2 #277/#278 ·
> M3 #281 · M4 #283→#286 · CS1 #287 migrations `0048`/`0049`).
> **Workflow complet 7 étapes + boutons validé CEO le 2026-07-02** (revue `/cto:review` : mapping proposition
> CEO ↔ implémenté, verdict SHIP) → jalons M3→M8 réordonnancés ci-dessous (§5) et intégrés à la ligne droite
> [PLAN-LANCEMENT.md](PLAN-LANCEMENT.md) (PHASE C′). Réf. domaine : mémoire `dossier-lifecycle`. Backbone
> inspiré des grands RIM (Application → Submission → Registration + interactions HA), couche opérationnelle
> africaine en plus (mandataire, échantillons, paiement, canal physique/portail, journal de confiance).
> Migration libre : `0050` (CS1 a consommé `0048` membership_scopes + `0049` orgId explicite RPC).

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
- ❌ ~~Comptes multi-parties~~ **RÉVISÉ 2026-07-02 (décision CEO)** : l'agent local peut désormais être
  **membre scopé au dossier** (tranche **CS1**, voir §5-bis) OU agir par **lien tokenisé** (sans compte).
  Restent des non-goals : le scoping par client/`party_id` dans une org (agence multi-clients), le
  **partage cross-org persistant**, et le **périmètre sur la couche ÉDITION** (Expert RA/Éditeur limité à
  certains produits = **phase 2, post-GO-LIVE**).
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

> **Réordonnancement validé CEO 2026-07-02** (issu de la revue workflow `/cto:review`) : l'ancien découpage
> M3 Échantillons / M4 Paiement / M5 Agent / M6 Relances est **remplacé** par la table ci-dessous. Fusions
> anti-rework : relances auto + vue Agent local rejoignent le **LOT 10** de PLAN-LANCEMENT (même infra
> correspondance/rappels) ; M8 est **post-GO-LIVE**.

| # | Tranche | Contenu | Effort |
|---|---|---|---|
| **M0** ✅ | **Fondation** | migration `0047` (`lifecycle_events` + RLS append-only + pgTAP) ; Dexie mirror + sync + outbox ; `deriveLifecycle()` pur + tests ; config 10 pays ; ADR-0004 — **PROD (PR #272)** | **L** |
| **M1** ✅ | **Roadmap (lecture)** | pipeline live + référence pays + journal + badge ; accès montage/aperçu ; clic dossier → Roadmap — **PROD (#273→#275)** | **M** |
| **M2** ✅ | **Actions Labo** | carte actionnable → `appendLifecycleEvent` (Transmettre / Soumis / Notification / Réponse / AMM ±) ; Parcours vs Journal + acteur — **PROD (#277/#278)** | **M** |
| **M3** ✅ | **Échantillons & Frais** | panneau « Conditions de soumission » (accordéon compact, colonne à côté de l'étape en cours) sur les événements déjà typés (`samples_requested/…/delivered`, `fees_invoiced`, `payment_submitted/confirmed`) + pièces (autorisation import, LTA/AWB, SWIFT → `doc_refs`, bucket `documents`) + récap 3 conditions **non bloquant** à la Soumission + journal enrichi (détails payload, pièces consultables, tronqué à 6) — **front-only, zéro migration** | **M** |
| **M4** ✅ | **Boucle Décision** | bouton **« Renvoyer en revue »** après Complément/Rejeté (comble le cul-de-sac du workflow) ; libellé `suspended` → **« Complément requis »** (code d'événement inchangé — journal immuable) ; réalignement libellés Dépôt (= réception confirmée par l'agent) / Soumission (= dépôt agence nationale) ; upload **preuve AMM** (docRefs) ; payload `via: agent\|direct` sur `authority_query` (cas CI) ; **+ décision Revue→Décision IN-APP pour les membres gestionnaires** — **PROD (T1 #283 · T2 #284 · T3 #285 · T4 #286, 2026-07-03)** | **M** |
| **CS1** | **Collaboration compte-à-compte SCOPÉE au dossier** (validée CEO 2026-07-02) | périmètre par membre (couche SUIVI), sélecteur d'org, fix attribution quotas — **détail §5-bis** ; migration `0048` probable | **M/L** |
| **M5** | **Relance manuelle (phase 1)** | badge « en attente depuis N jours » + bouton Relancer → `reminder_sent` (pur front). **Phase 2 (cron Edge + seuils par pays) = LOT 10** | **S** |
| **M6** | **Renouvellement J−6 & Variation** | alerte dérivée `valid_until − 6 mois` + bouton « Créer le renouvellement » (`activity: renewal` pré-rempli, n° AMM repris) ; idem variation — **même spine 7 étapes, pas de workflow séparé** | **S/M** |
| **M7** | **Vue Agent local (tokenisé)** | l'agent confirme dépôt/soumission, dépose preuves, relaie notifications via lien tokenisé → timeline partagée — **fusionné dans LOT 10b** (PLAN-LANCEMENT) | **L** |
| **M8** | **Fin de collaboration + modération** | révocation d'accès + raison journalisée → modération Pharnos (métadonnées seulement, jamais le contenu ; accès modération lui-même journalisé) — **post-GO-LIVE**, gated sur la décision « mode Agence multi-clients » | **M** |

**Mockup-first** pour toute surface neuve hors Roadmap (déjà validée) : la config pays (si UI un jour) et
les écrans tokenisés de l'agent (M5).

### §5-bis — CS1 : Collaboration compte-à-compte scopée au dossier (spec)

> **Décision CEO 2026-07-02** (audit multi-org + vision « pas une agence invitée ne verra tout mon
> catalogue »). Unité de scope = **le dossier** (produit × pays × opération) = l'unité du **mandat RA**.
> Cas couverts : 1 dossier → 1 agence · même produit/2 pays → 2 agences · A/B de 2 agents sur un même
> pays (catalogue divisé) · 8 agents / 8 pays UEMOA (portefeuille pays) · sans-compte = liens tokenisés
> (inchangé, M7/LOT 10b pour la timeline).

- **Modèle** : périmètre par membre — `null` = toute l'org (défaut, comportement actuel intact) ou
  **liste de dossiers**, avec raccourcis de sélection **par pays / par produit / manuelle**. Table de
  grants (`membership_scopes`, migration `0048` probable) + fonction RLS ; le périmètre s'ajoute en
  **`AND` sur les policies existantes** (on restreint, on ne perce pas — direction fail-safe).
- **Couche SUIVI uniquement (phase 1)** : dossiers, cycle de vie (Roadmap + actions), correspondance
  (+ messages), lecture du **PDF compilé**. PAS le catalogue, PAS le CTD builder, PAS les documents de
  travail (l'agent dépose et suit, il n'édite pas le Module 3 — conforme à la pratique RA).
- **Inclus (prérequis découverts à l'audit 2026-07-02)** : **sélecteur d'organisation** (menu compte —
  un agent sert plusieurs labos) + **fix attribution quotas** (`caller_org_id()` = plus ancienne org →
  passer l'`orgId` actif explicite, vérifié membre côté SQL — bug de facturation latent).
- **Garde-fous** : grants/révocations **journalisés** (audit GxP) ; **pgTAP négatifs** par table scopée
  (« l'agent scopé ne voit PAS le dossier hors périmètre » = 0 ligne) ; advisors re-checkés (perf RLS
  initplan : fonction stable + index) ; réalité offline **documentée** (la révocation coupe l'accès,
  n'efface pas ce qui est déjà synchronisé sur la machine de l'agent — identique au retrait d'un membre
  aujourd'hui).
- **Phase 2 (post-GO-LIVE, non construite)** : périmètre sur la couche ÉDITION (Expert RA/Éditeur limité
  à des produits — policies documents + storage par chemin) ; **KPIs par agent/portefeuille** (taux de
  réussite « AMM du 1er coup », délais par étape — **pure dérivation du journal**, aucune écriture nouvelle).
- **Effort** : **M/L (~2-3 sessions)**. Zone A4 intouchée.

### §5-ter — M4 : Boucle Décision (plan d'exécution, CTO 2026-07-02)

> **Architecture vérifiée sur code + RLS : 100 % FRONT-ONLY, zéro migration** (la `0048` reste
> réservée à CS1, zéro Edge change). Les deux capacités « lourdes » du jalon reposent sur de
> l'existant : (a) la RLS `0028` autorise DÉJÀ les gestionnaires de soumission à `UPDATE
> correspondences` et à insérer des messages `author='sender'` → la **décision in-app** est une
> écriture offline-first classique (Dexie + outbox), pas un nouveau chemin serveur ; (b)
> `latestDecision` (lifecycle-constants.ts) ne considère que la DERNIÈRE correspondance active →
> **renvoyer en revue = créer une nouvelle correspondance** (flux `resendCompiledDossier` existant),
> la dérivation revient d'elle-même à l'étape Revue. Le manque réel : le journal ne trace qu'UN
> envoi + UNE décision → la boucle serait invisible ; `buildJournal` doit itérer TOUS les cycles.

**Objectif** : plus aucun cul-de-sac dans le workflow — depuis « Complément requis » ou « Rejeté »,
le Labo repart en revue en un clic, et un membre gestionnaire peut rendre la décision in-app (sans
lien tokenisé). **Métrique de succès** : cycle complet Montage→AMM réalisable in-app par un membre
gestionnaire, chaque état non terminal offre une action suivante ; recette navigateur CEO.

**Tranches (chacune livrable seule)** :

| # | Tranche | Contenu | Effort |
|---|---|---|---|
| **T1** | **Libellés + 3 minors M2** | `suspended` → **« Complément requis »** (correspondence-constants `DISPLAY_STATUS`/badges/inbox `complement` + i18n EN « Additional info required ») ; réalignement **Dépôt = réception confirmée par l'agent / Soumission = dépôt à l'agence nationale** (STAGE labels + libellés actions M2) ; tri `buildJournal` avec tie-break (at égaux → ordre stable) ; `min` sur `valid_until` (≥ date d'octroi) ; clés React stables du journal (at+key, plus d'index). Code d'événement/statut INCHANGÉ (journal immuable). | **S** |
| **T2** | **Boucle visible + « Renvoyer en revue »** | `buildJournal` itère TOUTES les correspondances actives (une entrée par envoi + par décision → la suspension reste tracée après renvoi) ; bouton **« Renvoyer en revue »** dans `LifecycleActionCard` (statuts `suspended`/`rejected`) → flux resend existant (nouvelle correspondance, nouveau lien) ; troncature M3 conservée (page courte) ; e2e du cul-de-sac (suspendu → renvoi → re-décision). | **M** |
| **T3** | **Décision in-app (gestionnaires)** | panneau décision (Accepter / **Complément requis** / Rejeter + note) dans `CorrespondencePanel`, gating `canManageSubmission` (miroir RLS, comme M2) ; écriture offline-first : update Dexie `correspondences` (`status`, `decidedAt`) + outbox + message de fil `author:'sender', kind:'decision'` (RLS `0028` déjà passante ; vérifier que la sync correspondance pousse bien les updates) ; le fil affiche la pastille décision quel que soit l'auteur. | **M** |
| **T4** | **Preuve AMM + `via`** | upload **preuve AMM** sur le formulaire `amm_granted` → `doc_refs` (réutilise l'infra pièces M3 `lifecycle-docs.ts`, recommandé jamais obligatoire, upload en ligne seulement) ; choix **`via: agent\|direct`** sur le formulaire `authority_query` → `payload.via` (cas CI : notification reçue en direct) + rendu `journalDetail`. | **S** |

**Risques (top 3)** : (1) double chemin d'écriture du statut (in-app vs Edge tokenisé) → même forme
d'écriture que l'Edge (status + decided_at + message décision), messages append-only, e2e couvrant
les deux chemins ; (2) renommages de libellés = régressions tests/e2e/i18n → T1 isolé en tête, grep
exhaustif FR+EN, suite complète verte avant T2 ; (3) journal multi-cycles = page plus chargée →
troncature 6 entrées M3 conservée + recette visuelle CEO.

**DoD M4** : §7 inchangé (gates 6/6, code-reviewer SHIP, zone A4 intacte, recette navigateur) +
**zéro migration** + libellés validés CEO (expert RA).

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

## 8. État & prochaine étape (MAJ 2026-07-02)

**M0 + M1 + M2 : EN PROD** (M0 #272 avec migration `0047` appliquée · M1 #273 + accès rapides #274/#275 ·
M2 actions Labo #277 + Parcours/Journal/acteur #278). Revue CTO post-livraison du lot M2 (2026-07-02) :
**SHIP, 0 Blocker/Major** ; 3 minors tracés (tri `buildJournal` sans tie-break, `valid_until` sans `min`,
clé React sur index du journal) → **à solder dans M4** (même zone de code).

**Workflow complet validé CEO 2026-07-02** : mapping proposition CEO ↔ implémenté fait en revue ; boutons
par étape actés ; nom retenu pour `suspended` = **« Complément requis »** ; politique données modération =
métadonnées d'actions accessibles (base : intérêt légitime, CGU/politique de confidentialité, accès
journalisé), contenu des dossiers **jamais** accessible.

**CS1 validée et insérée (2026-07-02)** : collaboration compte-à-compte **scopée au dossier** (§5-bis),
issue de l'audit multi-org (multi-appartenance OK, mais pas de sélecteur d'org, quotas `caller_org_id`
à corriger, pas d'ACL fine — décision : périmètre par membre, couche suivi, fail-safe).

**M3 — Échantillons & Frais : LIVRÉ (2026-07-02)** — mockup compact validé GO CEO (layout 2 colonnes,
accordéon 1 ligne/condition, journal tronqué — demande « page pas trop longue »), dérivation pure
`deriveSubmissionConditions` (saisie tolérante monotone, chaîne échantillons conditionnée par
`sampleImportAuthRequired`), pièces recommandées jamais obligatoires (upload en ligne seulement,
événement journalisable hors-ligne sans pièce), récap non bloquant dans la modale Soumission,
e2e navigateur `lifecycle-m3.spec.ts` (seed IDB). Revue code-reviewer : 1 Major corrigé
(`triggerDownload` au lieu de `window.open` post-await — bloqueurs de pop-up).

**M4 — Boucle Décision : LIVRÉ (2026-07-03, PR #283 → #286)** — exécuté selon §5-ter, 4 tranches
100 % front-only, **zéro migration** (`0048` reste libre pour CS1). La boucle est fermée in-app de
bout en bout : Montage → Revue → Décision (in-app OU tokenisée) → « Complément requis » →
**Renvoyer en revue** (journal multi-cycles : chaque décision reste tracée via les messages
`kind: 'decision'`, append-only) → … → AMM avec preuve (`doc_refs`) + canal `via: agent|direct`.
Revues code-reviewer : 4× SHIP (1 Major corrigé en T1 — bouton reviewer « Demander un complément »).
⚠️ **Recette CEO** : libellés réalignés Dépôt/Soumission + défaut `via='agent'` à confirmer (jugement
RA).

**CS1 — Collaboration compte-à-compte scopée au dossier : LIVRÉE (2026-07-03, PR #287)** — exécutée
selon §5-bis, migrations **`0048`** (table `membership_scopes` + policies **RESTRICTIVE fail-safe**
en AND : couche SUIVI scopée au dossier — dossiers en lecture, lifecycle, correspondance + décision
in-app, Storage `events/` + `correspondence/` — et couche ÉDITION/usage org exclue ; `team_set_scope`
admin-only journalisé GxP, admin non scopable, purge du périmètre à la promotion admin) et **`0049`**
(orgId explicite **vérifié membre, fail-closed** sur les 7 RPC self-scopés — fix du bug d'attribution
quotas `caller_org_id` = plus ancienne org ; header `x-pharnos-org` vers les 3 Edge IA). Web :
sélecteur d'organisation (menu compte), éditeur de périmètre par membre (page Équipe, raccourcis
par pays/produit), UX membre scopé (nav + garde de route couche suivi, sections org masquées) ;
fix `fetchMyMemberships` (filtre `user_id` — le rôle d'un collègue pouvait gater l'UI). pgTAP :
49 + 13 assertions négatives (0 ligne hors périmètre, scope vide = rien, révocation, attribution
d'org). **Réalité offline documentée** : réduire/révoquer un périmètre coupe l'accès serveur
(sync/Realtime/Storage) mais n'efface pas ce qui était déjà synchronisé sur l'appareil du membre —
identique au retrait d'un membre. Phase 2 (périmètre couche ÉDITION, KPIs par agent) = post-GO-LIVE.

**M5 — Relance manuelle (phase 1) : LIVRÉE (2026-07-03, PR #288)** — pur front, zéro migration
(vocabulaire `reminder_sent` de `0047`). Dérivation pure `deriveStageWaiting` (badge « en attente
depuis N j » quand le dossier attend un TIERS : revue agent / réception / dépôt agence /
instruction ; compteur = dernière activité du journal, une relance le repart) + `ReminderControl`
sur la carte d'étape (badge + bouton Relancer gestionnaires, lecture seule = badge seul, ton
warning ≥ 7 j — seuil VISUEL) + journal « Relance envoyée » (acteur Labo ; la future relance auto
`system` s'affichera « Système »). L'événement n'avance JAMAIS le pipeline. **Phase 2 (cron Edge +
seuils par pays) = LOT 10.**

**M6 — Renouvellement J−6 & Variation : LIVRÉE (2026-07-03, PR #289)** — pur front, zéro migration.
Dérivation pure `deriveRenewalAlert` (`lifecycle-renewal.ts`) : dernier `amm_granted` du dossier →
fenêtre d'alerte à `valid_until − 6 mois` (phases ok/due/expired/unknown, borne incluse, payload
corrompu toléré, la dernière AMM journalisée l'emporte). Carte terminale « AMM accordée » :
ligne de validité (warning J−6, danger expirée) + « Créer le renouvellement » (dialog récap →
`createDossier activity: renewal`, n° d'AMM + date d'octroi repris sans ressaisie → montage) +
« Créer une variation » (assistant pré-rempli `?produit&operation&pays`, natures à cocher).
Gate création = couche ÉDITION (Lecteur + membre CS1 scopé exclus). **Même spine 7 étapes.**

**Reste du plan** : M7 vue Agent local tokenisée + relances auto (phase 2 M5) = **LOT 10/10b**
(PLAN-LANCEMENT) ; M8 fin de collaboration + modération = **post-GO-LIVE**.
