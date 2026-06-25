# PLAN — Finition « jusqu'au bout, sans dette technique »

> **Cadrage CTO (2026-06-20).** Plan d'exécution maître de la dernière ligne droite : du **pilote
> de lundi 2026-06-22** → clôture du **gate N4 GO-LIVE** → **backlog Phase 2 (moat RIM)** → horizon,
> sous une **discipline zéro-dette** explicite. Ne remplace PAS [PLAN.md](PLAN.md) (vision immuable).
> Chaîne : PLAN.md → [ROADMAP-MVP.md](ROADMAP-MVP.md) → [PLAN-RESTANT.md](PLAN-RESTANT.md) →
> [PLAN-N-EXECUTION.md](PLAN-N-EXECUTION.md) / [PLAN-COMPILATION-METERING.md](PLAN-COMPILATION-METERING.md) → **ce doc**.

## 0. État réel reconcilié (git + CI + advisors, vérifié le 2026-06-25)

**Livré et en prod :** Modules M0–M8 · Jalons H→O · pivot compilation-metering P1 (M1–M3) ·
modèle features 3 états · **Gate N : N1 ✅ N2 ✅ N3 ✅** · Phase 0 polish (P0-1/P0-2) ·
refonte CTD builder complète (#199→#210) · **Bibliothèque Templates 5/5** (RCP + Notice/PIL + Étiquetage
bilingues + lettres Cover/PGHT/renouvellement + éditeur standalone, #212→#223 ; reste M4) ·
**🚀 Moteur de Variation livré bout-en-bout** (#224→#236, migrations `0042`/`0043`) — encyclopédie 42 variations
UEMOA, demande multi-variation, tableau comparatif en annexe compilée, lettre de variation, éditeur TipTap
**tableaux** + doc/.docx éditable nativement, barème national. **= moat RIM ajouté, hors plan initial.**

**Santé (vérifiée le 2026-06-25) :** ~381 tests vitest + e2e Playwright · CI 6/6 verte · deploy main + uptime verts ·
`npm audit` 0 vuln · advisors **0 ERROR** · backups DB+Storage chiffrés + restore testé · uptime + alertes ·
**0 €** · clé `age` rangée hors-ligne (2026-06-20). **Migration `0043` posée en prod le 2026-06-25 → reprendre à `0044`.**

**Ce qui reste = le périmètre de ce plan :**
- **N4 (gate GO-LIVE)** — 3 pilotes + bascule Supabase Pro + checklist signée (= clôt aussi M4 du pivot metering).
- **Phase 0 micro** — P0-3 (upsell FREE) + P0-4 (purge produit test) → actions CEO.
- **Phase 2 (moat RIM)** — #1 erreurs actionnables · #2 Templates : **ne reste que M4** (nudge langue) ·
  #3 corbeille/rétention · #6 correspondance v3 · #5 pricing/facturation · (#7 multilingue document = synergie #2).
- **Phase 3 (horizon)** — P2→P5, **selon traction**.
- **Dette identifiée à solder** — résync docs **faite le 2026-06-25** (BOARD/PLAN-RESTANT/GO-LIVE/ce plan remis à la réalité :
  migrations 0042/0043, Templates 5/5, moteur Variation, pilote #1 en cours) ; restent nits (roving tabindex toolbar,
  recette visuelle tablette), ops/sécu (e-mails d'échec GitHub, durcissement DNS, leaked-password [Pro]).

## 1. Objectif & métrique de succès
- **Objectif** : amener Pharnos **jusqu'au GO-LIVE commercial puis à travers le moat RIM**, en ne
  laissant **aucune dette** derrière chaque tranche (code, tests, docs, ops, sécu synchronisés).
- **Succès** : (a) **3 orgs pilotes** compilent un M1 réel < 1 j + 1 correspondance + 1 partage →
  checklist N4 signée ; (b) **chaque tranche livrée** passe la barre zéro-dette (§7) ; (c) à tout
  instant, **les docs reflètent la réalité** et **0 Blocker/Major ouvert**.

## 2. Scope (tranche verticale de valeur d'abord)
La valeur immédiate = **faire réussir le pilote de lundi** et **clôturer N4**. Tout le reste
(Phase 2) vient après, en tranches verticales indépendantes. La priorité n'est PAS d'ajouter des
features avant lundi — le produit est prêt — mais de **garantir le chemin critique du pilote** et
de **remettre les docs au niveau de la réalité**.

## 3. Non-goals (pas maintenant)
- Aucune nouvelle feature avant lundi (gel fonctionnel pré-pilote ; on sécurise l'existant).
- Phase 3 (eCTD v4, desktop Tauri, chiffrement au repos, BYO-API) — **gelée jusqu'à traction** (≥ qq clients payants).
- Facturation automatisée (Stripe/mobile money) — **décidée maintenant, implémentée à ~5 clients payants**.
- Landing « premium » (#4) — la landing de base existe (jalon K) ; refonte premium = optionnelle, non bloquante.

## 4. Architecture & stack
**Aucune décision d'architecture nouvelle** → pas de `solution-architect`. Stack verrouillé
(Vite/React 19/TS strict · Tailwind v4/shadcn · Dexie offline-first · Supabase Postgres/RLS/Auth/
Storage/Edge Deno · Vertex Gemini · Cloudflare Pages · pdf-lib/pdfjs). Tout ajout reste **additif,
réversible, offline-first, FR/EN, tokens dark/light, zéro hallucination réglementaire**.
**Migrations : reprendre à `0044`** (dernières appliquées `0042` variation_amm_columns + `0043` storage_bucket_msword, 2026-06-25).

## 5. Milestones (ordonnés, chacun livrable)

### Sprint 0 — Pré-vol pilote & vérité des docs · **CE WEEK-END (avant lundi)** · *aucune feature*
- **S0-A — Synchro docs (paydown #1).** Rafraîchir `BOARD.md` §1/§9/§10, `PLAN-RESTANT.md` §0 et
  marquer `PLAN-UNIFIED-HEADER.md` livré → la doc redevient source de vérité (support pilote fiable).
- **S0-B — Régression du chemin critique pilote EN PROD.** Le workspace a été **lourdement refondu
  (#199→#210) APRÈS le dry-run du 06-17** → re-valider en navigateur réel : montage (upload sur nœud)
  → Monitor/Regafy → **compile PDF M1** → correspondance (lien tokenisé) → partage, avec compte de
  test + docs Gynoril/KV-Super Muscle. **Bloquant pour lundi.**
- **S0-C — Prod propre (CEO).** P0-3 (confirmer l'upsell « Inclus dès Pro » sur compte FREE) +
  P0-4 (soft-delete du produit test « Recette PL3… »).
- **S0-D — Onboarding nouvelle org.** Vérifier le parcours d'inscription **sans org préexistante**
  (le pilote est la 1ʳᵉ vraie inscription ; non couvert par les comptes de test).
- **S0-E — Décision Supabase Pro** (voir §Décisions) — par défaut : **rester Free pour le pilote**
  (backups jalon I couvrent le risque par conception).

### Sprint 1 — Pilote #1 **EN COURS** (démarré ~2026-06-22) · *N4 kickoff* — dossiers réels Bénin (renouvellements + variations)
- Dérouler [KIT-PILOTE.md](KIT-PILOTE.md) avec l'org pilote ; **collecter la friction** (§6 du kit :
  temps de bout en bout, libellés, erreurs sans CTA, lenteurs). **Confirmer le Realtime websockets**
  en environnement réel (loose end ouvert depuis la recette H — le fallback pull marche déjà).
- **Discipline** : la friction alimente le backlog Phase 2 #1 en **tranches propres**, pas en hotfixes.

### Sprint 2 — Clôture N4 = **GO-LIVE**
- **Pilotes #2 & #3** (commercial — chemin critique du gate, hors contrôle CTO).
- **Bascule Supabase Pro** au 1ᵉʳ contrat signé : leaked-password ON + `auth.pharnos.com` (marque sur
  l'écran Google) + PITR + **quota stockage DUR (D2)**.
- **Signer [GO-LIVE-CHECKLIST.md](GO-LIVE-CHECKLIST.md)** → GO-LIVE (clôt N4 **et** M4 du pivot metering).

### Sprint 3 — Phase 2 (moat RIM) · *post-N, ordre valeur × dépendance*
1. **Erreurs actionnables (audit complet)** — alimenté par la friction pilote ; priorité aux erreurs
   d'**offre** (quota IA 429, sièges, quota de compilation) = tunnel de conversion. (1er pas livré #163.)
2. **Bibliothèque Templates — finition** : M2b ✅ (Notice/PIL EN, #212) · M3 ✅ (lettres Cover/PGHT/renouvellement
   bilingues + destinataire auto par pays, #213→#223) → **reste M4** nudge langue de soumission (= absorbe Phase 2 #7).
3. **Corbeille brouillons + Archive enrichie + doc rétention** (finition GxP, #162).
4. **Correspondance v3 (RIM)** : délais réglementaires par agence + rappels + export PDF du fil + lettre de réponse.
5. **Pricing finalisé + facturation** : grille calée sur 3-5 entretiens pilotes ; **mobile money
   (Wave/Orange/MoMo) + Stripe** implémentés à ~5 clients payants. *Décision now / implé later.*

### Sprint 4 — Paydown continu (à chaque tranche, jamais reporté en silence)
- **Nits** : roving tabindex de la toolbar d'en-tête CTD ; **sign-off visuel tablette/mobile** (CEO, < lg).
- **Ops/sécu** : e-mails d'échec GitHub Actions ; durcissement **DNS** (SPF/CAA/DNSSEC/DMARC) ;
  décider du sort des PDF `RA-source/Template/RCP/*` (committer en référence ou ignorer comme MedDRA).
- **Docs** : appliquer le protocole `BOARD.md §13` à **chaque** PR qui change l'état produit.

### Sprint 5 — Horizon « OS RIM » · *gelé jusqu'à traction*
P2 chiffrement au repos + local-only · P3 sortie eCTD v4 du M1 + bascule R2 · P4 assemblage +
validateur eCTD + desktop Tauri · P5 BYO-API IA. **Ne pas démarrer avant ≥ qq clients payants.**

## 6. Risques & mitigations (top 3)
1. **Régression du chemin pilote post-refonte CTD** (workspace réécrit #199→#210 après le dernier
   dry-run ; lundi un vrai utilisateur l'attaque). → **S0-B** : régression prod du chemin exact AVANT
   lundi ; e2e offline (montage→compile→correspondance) en CI ; merge seulement si vert.
2. **Recrutement pilotes #2/#3 = le vrai goulot du GO-LIVE** (commercial, hors CTO). → rendre le
   pilote #1 sans friction (KIT + support) et en faire l'**asset de vente** ; l'ingénierie avance la
   Phase 2 **en parallèle** → zéro temps mort si le commercial traîne.
3. **Accumulation de dette sous pression pilote** (friction → raccourcis). → la **DoD zéro-dette (§7)
   est non négociable** ; la friction devient des tranches propres (#1), pas des correctifs sauvages ;
   synchro docs imposée **dans la PR** qui change l'état.

## 7. Definition of Done — la barre « zéro-dette »
**Par tranche (non négociable) :**
- `typecheck · lint · format · test · build · budget` verts + **CI 6/6**.
- **pgTAP** pour toute nouvelle table (négatifs anon/cross-tenant/non-admin = 0) ; advisors re-checkés.
- Revue **`cto:code-reviewer` = SHIP** (0 Blocker/Major).
- **Recette navigateur réelle en prod** (sticky/responsive/offline non vérifiables en headless).
- **Synchro docs DANS la même PR** (BOARD/PLAN-RESTANT + plan concerné) — la doc ne diverge jamais.
- **Règle anti-dette orpheline** : tout report = **une ligne** dans PLAN-RESTANT avec date/condition ;
  aucun nit n'« accumule » en silence.

**Global (GO-LIVE) :** DoD chiffrée N4 (3 pilotes + Pro + checklist signée) atteinte · toutes les
tranches livrées ont passé la barre par-tranche · **docs = réalité** · **0 Blocker/Major ouvert** ·
loose ends ops/sécu soldés **avant** la signature.

## 8. Décisions CEO (pour le go/no-go)
- **D1 — Périmètre de « jusqu'au bout »** : *hypothèse retenue* = **GO-LIVE + Phase 2 (moat)** ;
  Phase 3 = horizon gelé jusqu'à traction. (Confirmer ou étendre.)
- **D2 — Supabase Pro** : *reco* = **rester Free pour le pilote de lundi** (backups jalon I couvrent
  le risque de perte par conception), basculer Pro **au 1ᵉʳ contrat signé** (bundle leaked-password +
  `auth.pharnos.com` + PITR + quota dur). Seule raison de basculer plus tôt = l'écran Google brandé.
- **D3 — Pipeline pilotes #2/#3** : le GO-LIVE en dépend — sont-ils amorcés côté commercial ?

## 9. Prochaine étape recommandée (action unique)
**Lancer Sprint 0 aujourd'hui : S0-A (synchro docs → vérité) + S0-B (régression prod du chemin
critique pilote post-refonte CTD)**, pour que le pilote de lundi atterrisse sur un terrain vérifié.
Puis S0-C/D (prod propre + onboarding) et la décision D2.
