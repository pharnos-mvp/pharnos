# PLAN DE LANCEMENT — dernière ligne droite, zéro dette technique

> **Cadrage CTO (2026-06-25, `/cto:plan`, MAJ après décisions CEO).** Séquence d'exécution **maître**
> de la dernière ligne droite avant le lancement : **upgrade frontend de l'app = refonte UX profonde**
> (uniformité) **+ landing premium**, consolidés avec tout le backlog restant. Ne remplace PAS
> [PLAN.md](PLAN.md) (vision) ; **supersède l'ordonnancement** de [PLAN-FINITION-ZERO-DETTE.md](PLAN-FINITION-ZERO-DETTE.md).
> **Le CEO pilote chaque étape** (« dis-moi quoi upgrader ») ; le CTO exécute un lot à la fois, **testé en
> local avant merge**.

## Objectif & métrique
- **Objectif** : app + landing **visuellement uniformes** (un seul design-system, light/dark, FR/EN), tout
  le backlog pré-lancement soldé, **zéro dette**, puis **GO-LIVE signé**.
- **Mesure** : 1 design-system sur 100 % des surfaces + landing cohérente · Lighthouse perf ≥ 90 / a11y ≥ 95 ·
  FR/EN sur chaque écran · advisors 0 ERROR · 0 Blocker/Major · `GO-LIVE-CHECKLIST.md` signée.

## 📍 État d'avancement (MAJ 2026-06-28)
La refonte est **bien engagée** — plusieurs surfaces majeures sont déjà refondues **dans CE projet** :
- **PHASE B · LOT 1 Fondation DS** ✅ (PR #249) — primitives premium + écrans de référence **Dashboard + Catalogue** validés CEO.
- **PHASE C · LOT 2 Catalogue** ✅ — refonte premium **+ LOT 2 RIM complet (M1→M6)** livré 2026-06-28 (migration `0045`).
- **PHASE C · LOT 3 Dashboard** ✅ — DA premium « Ultra-Performance » validée CEO (2026-06-27).
- **LOT 4 Workspace/CTD** 🟡 (refonte responsive livrée #208 ; nits résiduels) · **LOT 5 Templates** 🟡 (Bibliothèque 5/5 ; reste M4) · **LOT 6 Variations** ✅ (moteur livré).

> ⚠️ **À garder en tête** : la refonte du **Dashboard** et du **Catalogue** ne sont PAS des chantiers à part —
> ce sont des **LOTs de CE projet de refonte complète de l'app**, qui se poursuit par les surfaces restantes
> (LOTs 7-10) **puis la refonte du landing (LOT 11)**. Tout converge vers le même design-system.

**Reste** : LOTs 7 (Compte), 8 (Admin), 9 (Dossiers+Corbeille), 10 (Correspondance v3) → **LOT 11 landing** →
LOT 12 i18n+M4 → LOT 13 recette finale → **LOT 14 GO-LIVE (= N4)**.

---

## 🔁 Le cycle par lot (vaut pour CHAQUE lot — c'est la garantie zéro-dette)
1. **Tu me dis quel lot** on attaque.
2. Je développe sur une **branche** dédiée (`feat/…` / `fix/…`).
3. Je passe les **gates locaux** : `typecheck · lint · format · test · build · budget` **verts**.
4. **Tu testes en LOCAL** (`npm run dev`, ton terminal, port **4319**) — validation visuelle + fonctionnelle.
5. Ajustements si besoin → retour à 3.
6. **PR** → **CI 6/6** + revue **code-reviewer = SHIP** (0 Blocker/Major) → **merge** → deploy auto → recette prod rapide.
7. **Synchro docs** (BOARD/PLAN-RESTANT) **dans la même PR** — la doc ne diverge jamais.

> **Rien ne merge sans : gates verts + ton OK local + CI 6/6.** Tout report = **une ligne** dans PLAN-RESTANT
> (anti-dette orpheline). pgTAP pour toute nouvelle table ; e2e mis à jour pour tout parcours modifié.

---

## 🧭 Pourquoi cet ordre (principes zéro-rework)
- **Fondation avant tout** : le design-system + les patterns (dont l'**erreur actionnable**) sont définis
  **une seule fois** → tout ce qui suit s'y conforme, **rien n'est refait**.
- **Combiner, ne pas empiler** : si une surface doit être **refondue ET enrichie** (corbeille,
  correspondance v3), on fait les deux dans **le même lot** — jamais « re-skin puis reconstruire ».
- **Captures après build** : la landing premium montre de **vraies captures de l'app upgradée** → **après** l'app.
- **Perturbable = en dernier** : le churn UI déplace les chaînes et la mise en page → **i18n + recette
  visuelle finale en TOUT DERNIER** (sinon à refaire). *(Règle CEO.)*
- **Zone protégée** : les surfaces **document/A4** (`.editor-page`, `.tplform-sheet`, rendu TipTap) sont
  **byte-exact au PDF compilé** → la refonte touche **le chrome autour, pas le rendu du document**.
- **Protéger le pilote #1** : on gèle le gros churn UI jusqu'à ce qu'il ait compilé son dossier.

---

## ✅ LA SÉQUENCE — « on fait ci d'abord, puis ça »

### ▶ PHASE A — Pré-vol (EN PARALLÈLE dès maintenant, découplé, ne bloque rien)
**LOT 0 — Pré-vol & ops.** Indépendant de toute l'UI, sans risque de rework.
- P0-4 purge produit test prod · P0-3 eyeball upsell FREE *(CEO)*.
- Ops : e-mails d'échec GitHub Actions · durcissement DNS (SPF/CAA/DNSSEC/DMARC) · confirmer Realtime websockets.
- Laisser **pilote #1 compiler son dossier sur l'app stable**.
- *Input CEO* : valider la **direction du barème de prix** (alimente LOT 6 + landing).

### ▶ PHASE B — Fondation (OBLIGATOIREMENT le 1er lot UI) — ✅ **LIVRÉ (PR #249)**
**LOT 1 — Fondation design-system + UX.** Le HUB : tout en dépend.
- Audit UI/UX *(fait)* → **spec** : tokens **spacing + typo + z-index + élévation** (les tokens couleur/radius
  existent déjà) ; **primitives** `PageHeader`, `ActionBar` sticky, `EmptyState`, `LoadingState`/skeleton,
  **`ErrorState` actionnable** (= absorbe le backlog « erreurs actionnables ») ; primitives manquantes
  (tooltip, popover, separator, skeleton, switch, checkbox, avatar) ; **patterns de parcours** (refonte UX).
- Livrable : spec + **2 écrans de référence (Dashboard + Catalogue)** → **🔒 TA VALIDATION avant la PHASE C.**

### ▶ PHASE C — Refonte UX par surface (TU choisis l'ordre, un lot à la fois)
Chaque surface = **1 lot autonome** (cycle complet ci-dessus). Ordre **libre**, **sauf** les règles
zéro-rework (combiner / zone protégée). Lots :
- **LOT 2 — Catalogue** — ✅ **LIVRÉ** : refonte premium (cockpit/liste DA) **+ référentiel RIM complet M1→M6**
  (parties à rôles, auto-populate/hub Organisations, cockpit RA validité/AMM, Autorités ; migration `0045`, 2026-06-28).
- **LOT 3 — Dashboard** — ✅ **LIVRÉ** : DA premium « Ultra-Performance » validée CEO (2026-06-27), écran de référence.
- **LOT 4 — Workspace / CTD builder** — 🟡 chrome uniquement (zone A4 protégée) ; refonte **responsive** livrée (#208).
  Restent les **nits** : roving tabindex toolbar, donut complétude au recompute, date-pickers des dates AMM.
- **LOT 5 — Templates** (Bibliothèque) — 🟡 **5/5 livré** ; reste **M4** (nudge langue de soumission, → LOT 12).
- **LOT 6 — Variations** — ✅ **LIVRÉ** (moteur de variation bout-en-bout, encyclopédie 42 variations).
- **LOT 7 — Compte / Abonnement** — ⬜ (+ affichage du **barème** validé en LOT 0 + vérif P0-3).
- **LOT 8 — Admin / god mode** — ⬜.
- **LOT 9 — Dossiers + Corbeille/Archive** — ⬜ *(COMBINÉ : refonte + feature rétention #3 en un lot)*.
- **LOT 10 — Correspondance + v3** — ⬜ *(COMBINÉ : refonte + délais agence/rappels/export PDF/lettre de réponse #6)*.

### ▶ PHASE D — Landing (APRÈS que toutes les surfaces app sont refondues)
**LOT 11 — Landing premium.** Refonte `landing/` : tour produit + **vraies captures de l'app upgradée**,
preuve sociale, **grille de prix réelle**, SEO/OG, **Lighthouse ≥ 95**, mêmes tokens que l'app. *(Isolée, 0 risque gate.)*

### ▶ PHASE E — En tout dernier (tâches perturbables)
**LOT 12 — Module de langue (i18n) + M4.** Audit de **complétude FR/EN global** (app + landing + e-mails),
rattrape toute dérive de clés des LOTs 1→11, toggle vérifié sur chaque écran ; **+ M4 nudge** « langue du
document ≠ langue de soumission » (clôt la Bibliothèque Templates 6/6).
**LOT 13 — Recette finale.** Visuelle **< lg** + a11y AA + e2e + Lighthouse + budget + re-run du chemin
critique pilote — **signature de la surface définitive une seule fois.**

### ▶ PHASE F — Clôture commerciale (humain ; tourne en parallèle depuis le début)
**LOT 14 — GO-LIVE.** Pilotes **#2/#3** · **bascule Supabase Pro** au 1er contrat (leaked-password ON +
`auth.pharnos.com` + PITR + **quota stockage dur**) · **signer `GO-LIVE-CHECKLIST.md`** → **LANCEMENT** (clôt N4 + M4 du pivot metering).

---

## ⛔ Non-goals / gelé (pas dans cette ligne droite)
- **Rails de paiement** (mobile money Wave/Orange/MoMo + Stripe) → implémentés à **~5 clients payants** ; seul le **barème** (affichage) est finalisé.
- **Phase 3 horizon** (eCTD v4, desktop Tauri, chiffrement au repos, BYO-API IA) → **gelée jusqu'à traction**.
- **Durcissement advisors WARN** (revoke EXECUTE helpers, citext, RLS-no-policy, index unused) → **acceptés par conception** ; leaked-password se règle à la bascule Pro.
- **Aucune nouvelle architecture** ; aucune capacité produit hors backlog.
- **Paydown différé** (à intercaler proprement, jamais en silence) : sort des PDF `RA-source/Template/RCP/*`, `org_templates`, traduction IA des valeurs saisies.

## 🎯 Definition of Done — lancement
Design-system **documenté + appliqué partout** · light/dark + **FR/EN complet sur chaque écran** ·
**Lighthouse perf ≥ 90 / a11y ≥ 95** (app & landing) · **advisors 0 ERROR** · **0 Blocker/Major** ·
**docs = réalité** · **`GO-LIVE-CHECKLIST.md` signée**.

## 🧱 Stack (verrouillé — aucune décision nouvelle)
Vite 8 · React 19 · TS 6 strict · Tailwind v4 + shadcn/ui (tokens light/dark) · Dexie offline-first ·
Supabase (Postgres/RLS/Auth/Storage/Edge) · Vertex Gemini · Cloudflare Pages · pdf-lib/pdfjs · i18n FR/EN.
Landing = `landing/` statique isolé, mêmes tokens. **Migrations : `0044` (doc-metadata) + `0045` (parties) posées → reprendre à `0046`** ; la plupart des lots = front-only.

---

### Récap ultra-court (l'ordre)
**A. LOT 0 pré-vol (//)** → **B. LOT 1 fondation (gate CEO)** → **C. LOTs 2-10 refonte par surface (tu choisis l'ordre)**
→ **D. LOT 11 landing** → **E. LOT 12 i18n+M4 puis LOT 13 recette finale** → **F. LOT 14 GO-LIVE.**
