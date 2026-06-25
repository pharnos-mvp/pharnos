# PLAN DE LANCEMENT — dernière ligne droite, zéro dette technique

> **Cadrage CTO (2026-06-25, `/cto:plan`).** Doc d'exécution **maître et ordonné** de la dernière ligne
> droite avant le lancement commercial. Consolide TOUT le travail restant + intègre les **deux nouveaux
> chantiers CEO** : (1) **upgrade Landing premium**, (2) **upgrade frontend de l'app pour uniformité**.
> Ne remplace PAS [PLAN.md](PLAN.md) (vision immuable, approuvée). **Supersède l'ordonnancement** des
> sprints de [PLAN-FINITION-ZERO-DETTE.md](PLAN-FINITION-ZERO-DETTE.md) (antérieur aux 2 chantiers) ;
> garde [PLAN-RESTANT.md](PLAN-RESTANT.md) et [GO-LIVE-CHECKLIST.md](GO-LIVE-CHECKLIST.md) comme feeders.
> Chaîne : PLAN.md → ROADMAP-MVP.md → PLAN-RESTANT.md → PLAN-FINITION → **ce doc**.

---

## 1. Objectif & métrique de succès
- **Objectif** : livrer une **app + landing visuellement uniformes** (un seul design-system, light/dark,
  FR/EN complet), **tout le backlog pré-lancement soldé**, **sans laisser une once de dette** — puis
  **signer le GO-LIVE**.
- **Succès (mesurable)** : (a) **un seul design-system** appliqué sur 100 % des surfaces (catalogue,
  workspace, dashboard, templates, variations, compte/admin, correspondance) **+ landing cohérente** ;
  (b) **Lighthouse perf ≥ 90 / a11y ≥ 95** (app & landing), **FR/EN complet sur chaque écran**, **0
  Blocker/Major**, **advisors 0 ERROR** ; (c) **`GO-LIVE-CHECKLIST.md` signable** (3 pilotes + Pro).

## 2. Scope (tranche verticale de valeur d'abord)
La valeur = **uniformité perçue + zéro dette** à l'ouverture commerciale. La 1ʳᵉ tranche de valeur
n'est PAS une feature, c'est la **fondation design-system** (L1) : elle débloque tout le reste **sans
rework**. Ensuite, chaque surface est reprise en **tranche verticale** (uniforme **et** fonctionnellement
complète d'un coup). Landing premium et clôture GO-LIVE ferment la marche.

## 3. Non-goals (pas maintenant)
- **Refonte UX assumée** (style **+ parcours/agencements**) des surfaces **existantes** — *décision CEO
  2026-06-25*. **Garde-fou anti-scope-creep** : **pas de nouvelle capacité produit hors backlog** ;
  **chaque changement de parcours est specdé + validé CEO en L1 (écrans de référence) + couvert e2e**
  avant déploiement de masse ; on reste **offline-first, FR/EN, zéro hallucination, budget bundle tenu**.
- **Rails de paiement** (mobile money Wave/Orange/MoMo + Stripe) : **décidés, implémentés à ~5 clients
  payants**. Seul le **barème de prix** (affichage) est finalisé maintenant (alimente landing + Abonnement).
- **Phase 3 horizon** (eCTD v4, desktop Tauri, chiffrement au repos, BYO-API IA) — **gelée jusqu'à traction**.
- **Durcissement advisors WARN** (revoke EXECUTE helpers, citext, RLS-no-policy, index unused) — **acceptés
  par conception**, non bloquants (leaked-password se règle à la bascule Pro).
- **Nouvelle architecture** : aucune. Stack verrouillé (§4).

## 4. Architecture & stack (verrouillé — aucune décision nouvelle, donc PAS de solution-architect)
Vite 8 · **React 19** · **TS 6 strict** · Tailwind **v4** + **shadcn/ui** (Radix, tokens light/dark) ·
Dexie offline-first · Supabase (Postgres/RLS/Auth/Storage/Edge Deno) · Vertex Gemini · Cloudflare Pages ·
pdf-lib/pdfjs · i18n maison FR/EN. **L'upgrade uniformité = appliquer CE stack de façon cohérente**
(tokens + primitives shadcn + patterns), **additif/réversible/offline-first/FR-EN/zéro hallucination**.
**Landing** = site statique isolé `landing/` (HTML/CSS/i18n.js), **mêmes tokens de marque** que l'app.
**Migrations : reprendre à `0044`** (dernières `0042`/`0043`). La plupart des tranches = **front-only, 0 migration**.

---

## 5. Principes de séquençage ZÉRO-REWORK (le cœur du plan)
> Règle CEO : *si faire A avant B oblige à refaire A pour intégrer B, alors A passe APRÈS B.* Déclinée :

- **P1 — Fondation avant consommateurs.** On définit le design-system **+ les patterns standard** (dont
  le **pattern d'erreur actionnable** *quoi/pourquoi/que faire + CTA*) **une seule fois** (L1). Tout ce
  qui est construit/repris ensuite s'y conforme **nativement → aucun rework**.
- **P2 — Combiner, ne pas empiler.** Si une surface a besoin **à la fois** d'un re-skin **et** d'un
  changement fonctionnel (corbeille, correspondance v3), on fait les **deux dans la MÊME tranche**.
  Jamais « re-skin puis reconstruire » (= double travail).
- **P3 — Captures après build.** La **landing premium** utilise de **vraies captures de l'app upgradée**
  → la landing vient **APRÈS** l'upgrade frontend (sinon captures périmées = à refaire).
- **P4 — Vérifications volatiles en dernier.** L'upgrade déplace markup/chaînes. Donc **le module de
  langue (i18n) + la recette visuelle/a11y/e2e finale viennent APRÈS tout le churn UI.** → **i18n =
  TOUTE DERNIÈRE position** (règle CEO explicite), juste avant la recette finale.
- **P5 — Protéger le pilote en vol.** **Pilote #1 finit son 1er dossier réel sur l'app STABLE** avant
  tout gros churn UI ; l'upgrade tourne **en parallèle du recrutement** des pilotes #2/#3.
- **P6 — Découpler l'ops bon marché.** DNS, e-mails GitHub, purge, Realtime = **tôt, indépendants**.

---

## 6. Roadmap ordonnée (milestones, chacun livrable et zéro-dette)

### L0 — Pré-vol découplé · *maintenant, en parallèle, 0 rework* · ~0,5 session + actions CEO
Clearing de piste sans aucun couplage UI ; protège le pilote #1.
- **P0-4** purge produit test prod · **P0-3** eyeball upsell FREE *(CEO, minutes)*.
- **Ops** : activer e-mails d'échec GitHub Actions · durcir DNS (SPF/CAA/DNSSEC/DMARC) · confirmer
  Realtime websockets en env pilote réel *(fallback pull déjà OK)*.
- **Pilote #1** : laisser **compiler son 1er dossier réel sur l'app stable** (gel du gros churn jusque-là).
- **Input CEO** : valider la **direction du barème de prix** (+ « go » éventuel sur l'**analyse 10 RIM**)
  → alimente L2f (Abonnement) et L3 (landing).

### L1 — Fondation design-system + UX · *1ʳᵉ tranche de valeur · HUB* · ~2–3 sessions · front-only
- **Audit d'inventaire UI/UX** sur toutes les surfaces (headers, toolbars sticky, cartes, dialogs/sheets,
  formulaires, tables, états vide/chargement/**erreur**, toasts, badges, donut) **+ parcours** (navigation,
  agencements, incohérences entre features).
- **Définir le système unifié** : tokens (couleur/espacement/rayon/ombre/typo light+dark) · primitives
  shadcn · **patterns standard** dont le **pattern d'erreur actionnable** (= absorbe Phase 2 #1), états
  vide/chargement, **et les patterns de PARCOURS** (refonte UX, décision CEO).
- **🔒 GATE zéro-rework** : L1 produit la **spec + 1–2 écrans de référence** → **validation CEO AVANT L2**
  (on ne déploie pas une UX qui pourrait être rejetée = on évite le rework de masse). Tests composants + a11y + doc.
- *Audit + spec = non-disruptifs → démarrent pendant que le pilote #1 tourne ; les écrans de référence
  restent en branche jusqu'au feu vert CEO.*

### L2 — Refonte UX par surface (combinée aux features pendantes) · ~6–9 sessions · tranches verticales
Chaque surface = **une tranche** uniforme **et** complète (parcours **specdé/validé en L1**, pattern
d'erreur appliqué sur place, **e2e du parcours modifié**). *Démarre après que le pilote #1 a compilé son
dossier (P5) ET après le feu vert CEO sur les écrans de référence L1.*
- **L2a Catalogue** (re-skin + erreurs).
- **L2b Workspace/CTD** (re-skin + erreurs) — **absorbe les nits** : roving tabindex toolbar, donut
  complétude au recompute, date-pickers des dates AMM.
- **L2c Dashboard** (re-skin).
- **L2d Templates** (re-skin) — *M4 reporté à L4*.
- **L2e Variations** (re-skin).
- **L2f Compte/Abonnement** (re-skin + **affichage du barème** validé en L0 + P0-3 vérifié).
- **L2g Admin / god mode** (re-skin).
- **L2h Dossiers + Corbeille/Archive** *(Phase 2 #3)* — **COMBINÉ** (re-skin + feature en une tranche).
- **L2i Correspondance + v3** *(Phase 2 #6 : délais agence + rappels + export PDF du fil + lettre de
  réponse)* — **COMBINÉ** (re-skin + feature en une tranche, P2).
- *Chaque tranche : CI 6/6 · pgTAP si nouvelle table · code-reviewer SHIP · FR/EN du jour · advisors re-checkés · recette navigateur réelle · docs synchro dans la PR.*

### L3 — Landing premium · *après l'upgrade app (P3)* · ~1–2 sessions · site isolé, 0 risque gate
- Refonte `landing/` : **tour produit + vraies captures de l'app upgradée**, preuve sociale,
  **grille de prix réelle** (≠ « sur devis »), SEO/OG, **Lighthouse ≥ 95**. **Mêmes tokens que l'app** = uniformité.

### L4 — Module de langue (i18n) EN DERNIER + M4 · *règle CEO P4* · ~1 session
- **M4** nudge « langue du document ≠ langue de soumission du pays » (constat Monitor déterministe avant
  compile) — construit sur le système final. **Clôt la Bibliothèque Templates (5/5 → 6/6).**
- **Sweep i18n global** : chaque chaîne FR/EN (app + landing + e-mails), **rattrape toute dérive de clés**
  introduite par L1–L3, toggle vérifié sur **chaque** écran. *(Per-tranche on reste bilingue ; ceci est
  l'**audit de complétude final**, placé après tout le churn pour ne pas le refaire.)*

### L5 — Recette finale + clôture GO-LIVE · *après TOUT le churn UI* · ~1 session eng + commercial
- **Recette visuelle finale** desktop **+ < lg** (tablette/mobile) — **signée une seule fois** sur la
  surface définitive · a11y AA · e2e · Lighthouse perf/a11y · budget bundle · recette flux Variation
  + re-run du chemin critique pilote.
- **Clôture N4** : pilotes **#2/#3** *(commercial, en parallèle depuis L0)* · **bascule Supabase Pro**
  au 1er contrat (leaked-password ON + `auth.pharnos.com` + PITR + **quota stockage DUR**) ·
  **signer `GO-LIVE-CHECKLIST.md`** → **LANCEMENT**.

---

## 7. Analyse par tâche (dépendances · risque de rework · qui · effort)

| Tâche | Dépend de | Risque de rework si mal placée | Qui | Effort |
|---|---|---|---|---|
| L0 ops/purge/Realtime | — | Nul (découplé) | CEO + CTO | 0,5 s |
| L0 barème (décision) | — | **Bloque** L2f & L3 si tardif → fait **tôt** | CEO | déc. |
| **L1 fondation DS + UX** | L0 décision | **Élevé en aval s'il est tardif** : toute UI faite avant serait à refaire → **fait en 1er** ; **gate CEO** sur écrans de référence avant L2 | CTO | 2–3 s |
| L2a–g refonte UX | L1 **+ feu vert CEO** | UX avant L1 = à refaire → **après L1** ; déployer une UX non validée = rework de masse | CTO | ~5–6 s |
| L2h corbeille | L1 | Skin puis rebuild = double → **combiné** | CTO | 0,5–1 s |
| L2i correspondance v3 | L1 | Skin puis rebuild = double → **combiné** | CTO | 1–2 s |
| Erreurs actionnables | L1 (pattern) | Défini 1× en L1, appliqué par tranche → **0 rework** | CTO | inclus L1+L2 |
| **L3 landing premium** | **L2 (captures app)** | Captures/markque périmées si avant l'upgrade → **après L2** | CTO | 1–2 s |
| **L4 i18n + M4** | **L1→L3 (tout l'UI)** | **Refait si avant le churn** → **DERNIER** (règle CEO) | CTO | 1 s |
| **L5 recette finale** | **tout** | Re-recette si avant un chantier qui change la surface → **après tout** | CTO + CEO | 1 s |
| Pilotes #2/#3 | produit prêt | — (commercial, parallèle) | commercial | hors CTO |
| Bascule Pro | 1er contrat | — | CTO (déclenché) | court |

**Gelé / non-goal** : rails de paiement (≥ ~5 payants) · Phase 3 horizon · advisors WARN (acceptés) ·
`org_templates`, traduction IA des valeurs saisies · sort des PDF `RA-source/Template/RCP/*` (paydown).

---

## 8. Risques & mitigations (top 3)
1. **La refonte UX déstabilise l'app pendant les pilotes** (risque accru vs simple re-skin). → **parcours
   specdé + validé CEO (L1) AVANT déploiement** ; **par tranche** : **e2e du parcours modifié** + CI 6/6 +
   recette navigateur + **tag de rollback** ; **gel jusqu'à la compile du dossier pilote #1** (P5) ; deploy
   **progressif** (1 surface = 1 PR réversible).
2. **Dérive de clés i18n introduite par le re-skin.** → **i18n en dernier** (P4) en **audit global** ;
   discipline FR/EN **par tranche** maintenue ; check de **couverture de clés** au sweep L4.
3. **Le chantier uniformité enfle (scope creep).** → non-goal « **additif, 0 comportement** » ;
   **fondation d'abord** (L1) cape la variance ; **budget bundle** en garde-fou ; revue SHIP par tranche.

## 9. Definition of Done — barre zéro-dette
**Par tranche (non négociable)** : `typecheck · lint · format · test · build · budget` verts + **CI 6/6** ·
**pgTAP** pour toute nouvelle table · **e2e mis à jour pour tout parcours modifié** · revue
**code-reviewer = SHIP** (0 Blocker/Major) · **recette navigateur réelle** · **FR/EN du jour** ·
**synchro docs DANS la PR** (BOARD §13) · tout report = **une ligne** dans PLAN-RESTANT (anti-dette orpheline).
**Global (lancement)** : design-system **documenté + appliqué partout** · **light/dark + FR/EN complet
sur chaque écran** · **Lighthouse perf ≥ 90 / a11y ≥ 95** (app & landing) · **advisors 0 ERROR** ·
**0 Blocker/Major** · **docs = réalité** · **`GO-LIVE-CHECKLIST.md` signée**.

## 10. Prochaine étape recommandée (action unique)
**Démarrer L1 — l'audit d'inventaire UI + la spec du design-system** (non-disruptif, ne touche pas le
pilote #1 en vol), pendant que le CEO solde L0 (ops/purge) et **valide la direction du barème de prix**.
