# PLAN — Travail restant Pharnos : du GO-LIVE à l'OS RIM régional

> **Doc de cadrage CONSOLIDÉ — source unique du « ce qui reste » (MAJ 2026-06-20).**
> Chaîne documentaire : [PLAN.md](PLAN.md) → [ROADMAP-MVP.md](ROADMAP-MVP.md) →
> [PLAN-COMPILATION-METERING.md](PLAN-COMPILATION-METERING.md) → [PLAN-M-N-GOLIVE.md](PLAN-M-N-GOLIVE.md) →
> **ce document**. Ici on **cadre, priorise et ordonnance** ; l'exécution se fait en discussions dédiées.

## ⭐ North Star (rappel)
**Pharnos = l'usine du Module 1 régional UEMOA/CEDEAO, eCTD-v4-ready, qui s'enclenche dans tout dossier
CTD global.** La **compilation** est le livrable métré (pas le brouillon). On NE devient PAS une suite
full-publishing (moat des incumbents) — on reste le meilleur sur le Module 1 régional + l'assistance IA
zéro-hallucination. Détail : [PLAN-COMPILATION-METERING.md](PLAN-COMPILATION-METERING.md).

## 0. Où on en est (MAJ 2026-06-20)
Tout **H → M (+O)** est en prod. **Depuis le 2026-06-16** :
- **Modèle features 3 états** (Masquée / Vitrine / Activée) god-mode — PR #179, migration `0038`.
- **Virage « compilation = livrable métré » + offline privé par org** — P1 **M1→M3 livrés** (PR #181/#182/#183/#184,
  migrations `0039`→`0041`) : ledger `compilations`, garde `record_compilation` au **bouton Compiler**, trigger
  de création **retiré** (brouillons illimités), poison-pill drainé, `persist()`, **sync opt-in par org**.
- **Gate N : N1 ✅ · N2 ✅ · N3 ✅** (k6 Edge 948 req, 0 fuite/0 5xx, p95 < 0,5 s + [CAPACITY-N3.md](CAPACITY-N3.md), PR #180)
  → **il ne reste que N4** (actions humaines de GO-LIVE).
- **Punch-list pilote livrée + recettée en navigateur prod** — PR #186/#187 (#1 Monitor i18n, #3 auto-save fiche,
  #4 upsell par action, #5 barre sticky, #6 nom PDF audit, #7 « Audit de conformité ») + **durcissement CI**
  (job `rls` Postgres-seul, fin du flake edge-runtime 502).
- **Phase 0 polish P0-1 + P0-2 livrés** — PR #188 (FRONT/Edge-only, 0 migration) : P0-1 en-tête de template
  vraiment sticky (var CSS `--tpl-actionbar-h` mesurée → topbar calé sous la barre d'actions) ; P0-2 Regafy
  localisé FR/EN (module Edge `_shared/regafy-i18n.ts`, `uiLang` propagé aux constats + prompts IA, clé de
  cache v8→v9). 244 vitest + 40 deno (parité FR + sortie EN) ; recette navigateur prod faite.

- **Depuis le 2026-06-18** : **Bibliothèque Templates** (M1 RCP + Tranche A/B + M2a Étiquetage, #191→#198) +
  **refonte CTD builder complète** (en-tête unique + fidélité mockup + responsive tablette/mobile, #199→#210).
  **Plan de finition « zéro-dette » : [PLAN-FINITION-ZERO-DETTE.md](PLAN-FINITION-ZERO-DETTE.md)** — pilote #1 **lundi 2026-06-22**.

**Santé** : 287 vitest + e2e Playwright, CI 6/6, `npm audit` 0 vuln, advisors 0 ERROR, budget tenu, backups
chiffrés + restore drill, uptime + alertes, **0 €**. Clé `age` rangée hors-ligne (2026-06-20).

**Le seul jalon roadmap restant = N4 (gate GO-LIVE).** Le reste (Phase 0 polish + Phase 2 backlog + horizon)
**améliore le produit / le moat** mais **ne bloque pas** l'ouverture aux pilotes payants.

---

## PHASE 0 — Polish pilote · **prioritaire** (les pilotes testent MAINTENANT) · ~1 session
Retours de la 1ʳᵉ vague de tests pilotes. Petites tranches verticales, recette navigateur prod à chaque fois.

| # | Item | Cause / scope | Effort |
|---|------|---------------|--------|
| **P0-1 ✅ #188** | **Entête de template pas vraiment sticky** (bouge, puis se coince **sous** la barre Upload) | `.tplform-topbar` = `position:sticky; z-index:10` **sans `top`** → dérive, et passe **sous** la barre d'actions #5 (`sticky top-0 z-20`). **Livré** : hauteur de la barre d'actions mesurée (callback ref + ResizeObserver) → var CSS `--tpl-actionbar-h` ; `top: var(--tpl-actionbar-h, 3rem)`, z-index cohérent. | ~0,3 session |
| **P0-2 ✅ #188** | **Regafy (IA) rend ses constats en FR sous UI EN** | Edge `regafy-ai` : prompt système « Français » + **messages déterministes FR en dur** (`index.ts`, ex. « Traduction recommandée », prépositions pays) ; le client ne passe **pas** la langue **d'affichage** (distincte de `targetLang` = langue **officielle du pays**). **Livré** : langue UI → prompt « respond in `<lang>` » **+** messages déterministes localisés (module `_shared/regafy-i18n.ts`, FR/EN) **+** **clé de cache** incluant la langue (v8→v9). 3 langues distinguées : UI (affichage), document (détectée), pays-cible (officielle). | ~0,5–1 session |
| **P0-3** | **Eyeball upsell par action sur compte FREE** | #4 du punch-list est code+bundle-vérifié mais **non déclenchable sur Enterprise** (aucune feature en Vitrine). Confirmer « Analyse IA / Traduction IA — Incluse à partir du plan Pro » sur le compte free. | CEO, 2 min |
| **P0-4** | **Nettoyer l'artefact de recette** | Produit test « Recette PL3… » laissé dans le catalogue prod (soft-delete). | CEO, 1 clic |

> **Note** : P0-2 (langue des **remarques**) est distinct de Phase 2 #7 (langue du **document** = templates MedDRA EN +
> nudge « traduire vers le FR »). Les traiter ensemble est tentant mais P0-2 est un **bug** (rapide), #7 une **feature**.

---

## PHASE 1 — Jalon N (GATE GO-LIVE) · **N1 ✅ N2 ✅ N3 ✅ → reste N4**
Rien ne sort vers des clients payants sans N. Détail : [PLAN-M-N-GOLIVE.md](PLAN-M-N-GOLIVE.md).

- **N1 Sécurité+Auth ✅** : Google OAuth, leaked-password (à confirmer ON), REVOKE helpers SECURITY DEFINER,
  RLS pgTAP par table, rate-limit Edge IA — livrés / vérifiés en gate N.
- **N2 Perf ✅** : `auth_rls_initplan`, code-split workspace (−77 %), Lighthouse a11y gate CI, e2e offline.
- **N3 Scalabilité ✅** : index sync (`0035`), backstop + quota stockage (`0036`/`0037`), **k6 Edge** (PR #180),
  capacité documentée ([CAPACITY-N3.md](CAPACITY-N3.md)).
- **N4 Gate GO-LIVE — RESTE (actions HUMAINES, non automatisables)** :
  - **3 orgs pilotes** : chacune un **dossier réel compilé < 1 j** + **1 fil de correspondance** + **1 partage utilisé**.
  - **Bascule Supabase Pro (25 $)** : PITR + anti-pause + leaked-password ON + quota stockage dur.
  - **Checklist [GO-LIVE-CHECKLIST.md](GO-LIVE-CHECKLIST.md) signée CEO** (restore drill re-confirmé, alertes/uptime,
    quotas, domaines/e-mails OK). **= clôt aussi M4** du virage compilation-metering.

**Parallélisable pendant N** : la landing (Phase 2 #4) est un site isolé → 0 risque sur le gate.

---

## PHASE 2 — Backlog post-N (produit / moat) · priorisé
Ordre = valeur × dépendance. Chaque ligne = tranche verticale livrable + recettable.

| # | Tranche | Pourquoi | Effort |
|---|---------|----------|--------|
| 1 | **Messages d'erreur actionnables (audit complet)** | Standard *quoi / pourquoi / que faire* + CTA ; priorité aux erreurs d'**offre** (quota IA 429, sièges, **quota de compilation**) = tunnel de conversion. 1er pas livré (#163). | ~0,5–1 session |
| 2 | **Bibliothèque Templates (couche RIM)** | Onglet sidebar : templates en vigueur + lettres ; l'org sauvegarde ses versions réutilisables, rappelées dans le CTD builder. **= le moat RIM** (≈ content library Veeva). Table `org_templates` offline-first. **Garde-fou : réglementaires read-only, zéro hallucination.** | ~1–2 sessions |
| 3 | **Corbeille brouillons + Archive enrichie + doc rétention** | Finition rétention GxP (#162) : restore brouillons + purge N j + vue Archive + *Politique de rétention* (argument conformité). | ~0,5 session |
| 4 | **Landing « Veeva africain »** | Site `landing/` isolé : branding premium, tour produit, 3 piliers, Lighthouse ≥ 95. **Parallélisable avec N.** | ~1–2 sessions |
| 5 | **Pricing finalisé + facturation** | Grille finale (à caler avec 3-5 entretiens pilotes) ; **mobile money (Wave/Orange/MoMo)** + Stripe à ~5 clients payants. **Décision now / implé later.** | now / later |
| 6 | **Correspondance v3 — suivi de soumission (RIM)** | Délais réglementaires par agence + **rappels**, **export PDF du fil**, lettre de réponse générée ; (option) **compte Agence authentifié** + multi-destinataires. | ~1–2 sessions |
| 7 | **Support multilingue du DOCUMENT (templates MedDRA EN + nudge FR)** | Quand UI EN : variantes de templates en **MedDRA anglais** ; constat Monitor invitant à **traduire vers le FR** (langue officielle du pays cible) **après remplissage**. Cross-langue = vrai moat régional. *(ex-#2 du punch-list — feature, à cadrer dans un plan dédié ; synergie avec P0-2.)* | ~1–2 sessions |

---

## PHASE 3 — Horizon « OS RIM » (virage compilation-metering P2→P5 + vision) · arbitrage selon traction
- **P2 — Confidentialité au repos** : chiffrement IndexedDB + mode local-only strict (la promesse confidentialité offline).
- **P3 — Sortie eCTD v4 du Module 1** : backbone XML / RPS (ICH M8 / HL7) + UUID réutilisables ; **bascule stockage R2** aux seuils.
- **P4 — Assemblage + validateur eCTD + desktop (Tauri)** : compilation lourde multi-Go côté serveur/desktop (le navigateur OOM au Go) ; validateur externe puis intégré.
- **P5 — BYO-API IA** : l'admin pose sa clé (Vertex/Claude/EU/self-host), la team tourne dessus ; abstraction LLM déjà en place (swap à activer).
- **Vision** : CTD Modules 2-5 · IDMP complet (modèle déjà IDMP-ready, ADR-0001) · règles réglementaires versionnées par pays · **pentest externe** + WAF avancé · **export DOCX** du dossier compilé · KPIs dashboard (délai de montage, taux d'acceptation) · apps natives.

---

## Décisions verrouillées (rappel)
- **Auth = Supabase Auth + Google OAuth** ; **pas d'Auth0/Clerk** ; WorkOS/Supabase-SAML réservé au 1er enterprise SSO/SCIM (financé par son contrat).
- **Métrique de valeur = la COMPILATION** (free 1/mois) ; **brouillons illimités locaux** ; **sync opt-in par org**.
- **IA = confidentialité Vertex (pas Pharnos)** aujourd'hui ; **BYO-API** en P5.
- **Résidence données** : DB eu-west-3 (Paris) — argumentaire EU/GDPR ; régional/self-host pour l'enterprise.
- **App = chrome neutre 2 tons ; landing = premium**.
- **0 € jusqu'au 1er client payant** ; bascule **Supabase Pro (25 $)** au 1er contrat signé.

## Séquencement recommandé
1. **PHASE 0 polish** (P0-1 sticky → P0-2 Regafy-lang ; P0-3/P0-4 = CEO) — vite, pendant que les pilotes testent.
2. **N4 GO-LIVE** (actions humaines : 3 pilotes + Supabase Pro + checklist signée). **Landing en parallèle** (isolée).
3. **Post-N** : erreurs actionnables → corbeille/rétention → **bibliothèque Templates (RIM)** → support multilingue document → correspondance v3 → pricing/mobile money au fil des clients.
4. **Horizon** : P2→P5 selon traction.

## Definition of Done du GO-LIVE (gate N, chiffré)
- **Produit** : 3 orgs pilotes — dossier réel **compilé** < 1 j + 1 fil de correspondance + 1 partage utilisé ; e2e offline vert.
- **Sécurité** : 0 vuln high ; RLS pgTAP par table ; rate-limits IA ; **leaked-password ON** ; secrets rotation documentée ; backup + restore TESTÉ.
- **Perf** : LCP ≤ 2,5 s (4G), INP < 200 ms, Lighthouse perf ≥ 90 / a11y ≥ 95 en CI ; budget bundle tenu.
- **Scalabilité** : syncs paginées, indexes (EXPLAIN + `auth_rls_initplan`), quotas IA **+ compilation** actifs, k6 Edge ✅.
- **Opérabilité** : alertes + uptime ; console admin OK ; **checklist GO-LIVE signée CEO**.

## Actions CEO / ops en attente (loose ends — à clôturer avant/pendant N)
- **Backup** : ranger la clé privée age `C:\Users\ASUS\pharnos-backup-age.key` **hors-ligne** (coffre) puis supprimer le fichier — sa perte = backups illisibles.
- **GitHub** : activer Settings → Notifications → Actions (e-mails d'échec).
- **DNS / e-mail** : durcir **SPF** (`+include:amazonses.com`), **CAA**, **DNSSEC**, **DMARC** (parqués au jalon K).
- **Pilote** : supprimer le produit test « Recette PL3… » du catalogue prod (P0-4).

## Migrations
Dernière appliquée = `0041`. **Reprendre à `0042`.** (Phase 0 = front/Edge only → aucune migration attendue.)
