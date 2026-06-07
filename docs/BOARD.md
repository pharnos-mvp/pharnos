# Pharnos — Board projet (source de vérité vivante)

> **À quoi sert ce document.** C'est le **tableau de bord unique** du projet : où on en est, ce
> qu'on a fait, **comment** et **pourquoi**, et **où on va**. Toute personne (CEO, dev, ou outil/IA)
> qui arrive ici doit pouvoir reprendre le fil **sans contexte préalable**.
>
> **Trois docs complémentaires :**
> - `docs/PLAN.md` — le **plan approuvé** (vision, scope, milestones, DoD). Stable.
> - `docs/adr/` — **décisions d'architecture** détaillées (ADR). Ajout au fil de l'eau.
> - `docs/BOARD.md` (ce fichier) — **l'état vivant** : avancement, journal, cap. **À tenir à jour.**
>
> **Protocole de mise à jour** (voir §13) : à chaque tranche livrée (PR mergée), mettre à jour le
> §1 (état), le §9 (milestones) et le §10 (journal). Garder le reste synchronisé si une décision change.

_Dernière mise à jour : 2026-06-08 — pilote en ligne ; montage CTD façon Google Docs (scroll page unique, panneaux figés)._

---

## 1. TL;DR — où on en est

**Le MVP (3 modules) est fonctionnel, online et offline, et durci.** Reste : l'IA (M4/M5)
**bloquée sur les credentials Google Cloud**, et la mise en pilote.

| Domaine | État |
|---|---|
| **Catalogue** (produits + documents) | ✅ Livré (offline + sync) |
| **CTD Workspace** (Module 1) | ✅ Livré (arborescence, upload, génération lettres, compile PDF, Regafy v1, aperçu PDF) |
| **Dashboard** (validité + veille) | ✅ Livré |
| **Compte / i18n FR-EN / thème clair-sombre** | ✅ Livré |
| **Audit trail (ALCOA++)** | ✅ Livré |
| **Durcissement M8** (E2E offline, a11y AA, Sentry, budget perf, tests RLS) | ✅ Livré |
| **Regafy IA (M4, Vertex)** · **Traduction (M5, Gemini)** | ⏳ **Bloqué** : credentials GCP |
| **Déploiement pilote** | ✅ **En ligne — https://pharnos.pages.dev** (Cloudflare Pages, mode authentifié) |

**Qualité (main, vert partout) :** typecheck · lint · format · **52 tests unitaires** · build ·
**budget bundle** · **9 E2E Playwright** (dont reload hors-ligne) · **a11y WCAG AA** sur 4 pages cœur.

---

## 2. Vision & objectif

**Pharnos = l'« OS » des affaires réglementaires (RA) pharma pour l'UEMOA/CEDEAO** (Afrique de
l'Ouest francophone). Ambition : « le **Veeva africain, en mieux** » — ultra-rapide, léger, sécurisé,
**offline-capable**, qualité RegTech, **coût proche de zéro**.

**Métrique de succès du MVP :** ≥ 3 organisations pilotes compilent chacune ≥ 1 **dossier CTD
Module 1 réel** en PDF (complétude au vert), **en < 1 jour**, **fonctionnel hors-ligne**.

**Équipe :** le **CEO est expert RA** (fournit/valide le contenu réglementaire, décisions produit,
clés API) ; le **CTO (Claude) réalise 100 %** du dev, tests, CI/CD, déploiement, sécurité.

---

## 3. Scope MVP

**Inclus (3 modules, online + offline) :**
1. **Catalogue** — CRUD produits (identification + titulaire/fabricant) + upload documents (info/admin), métadonnées (type, langue, expiry).
2. **CTD Workspace (Module 1)** — arborescence CTD UEMOA éditable, auto-classement des docs produit, génération de lettres (Cover/PGHT) depuis templates → édition TipTap, **compilation PDF** (TDM + pages de garde + bandeau), **Regafy** (vérif), aperçu PDF in-place.
3. **Dashboard** — monitoring de la validité des pièces admin (GMP/ML/FSC/COPP/AMM) + feed de veille réglementaire.

**Hors scope MVP :** modules Traduction/Audit standalone, CTD Modules 2-5, livrable eCTD v4 (hooks
seulement), collab temps réel, soumission directe agences, apps natives, facturation, SSO/MFA avancé.

---

## 4. Architecture & stack (décisions verrouillées)

| Couche | Choix | Pourquoi |
|---|---|---|
| **Front** | Vite 8 · **React 19** · **TS 6 strict** (+ noUncheckedIndexedAccess) · **PWA** (vite-plugin-pwa/Workbox) | Rapide, léger, offline, déployable partout |
| **UI** | Tailwind v4 · **shadcn/ui** (Radix, new-york) · lucide · sonner · next-themes | Accessible (WCAG AA), minimaliste |
| **Données locales** | **Dexie** (IndexedDB) + dexie-react-hooks · blobs dans `documentBlobs` | Offline-first réactif |
| **Données serveur** | **Supabase** : Postgres + Auth (JWT) + Storage + **RLS** multi-tenant | Isolation tenant = pilier confidentialité pharma |
| **État serveur** | TanStack Query · formulaires react-hook-form + **zod** | Standard, typé, validé |
| **Éditeur** | **TipTap** (ProseMirror), modèle JSON → PDF | Brief « Google Docs » minimaliste |
| **PDF** | **pdf-lib** (compile, TimesRoman A4, TDM 2 passes) · **pdfjs-dist** (aperçu canvas) | Côté client, coût nul, pas de Chromium |
| **IA (Regafy/Traduction)** | **Gemini Flash via Vertex AI** (no-train) derrière une abstraction provider | Confidentialité + très bon marché ; swap possible |
| **Observabilité** | **Sentry** (lazy, opt-in via `VITE_SENTRY_DSN`) | Erreurs en prod, zéro coût bundle si désactivé |
| **Hébergement** | **Cloudflare Pages** (front) · Supabase managé | Free tier, edge mondial |
| **CI** | **GitHub Actions** (Node 24) | 2 jobs : web + e2e |

**Principes non négociables :** performance · sécurité par défaut · scalabilité · efficacité ·
correction · maintenabilité. IA **assistive only** (human-in-the-loop, jamais finale).

**Mode local/offline (clé pour dev & tests) :** si `VITE_SUPABASE_URL`/`ANON_KEY` sont **vides**,
`AppGate` bascule sur `LOCAL_ORG_ID` **sans auth** → l'app est 100 % utilisable sur IndexedDB.
C'est ce mode qu'utilisent les **E2E** (déterministes, sans backend ni secret).

---

## 5. Carte du repo (où vit quoi)

```
D:\pharnos-mvp
├─ web/                         # app front (Vite/React/PWA)
│  ├─ src/
│  │  ├─ App.tsx               # AppGate : auth vs mode local ; routing
│  │  ├─ main.tsx              # bootstrap + initSentry()
│  │  ├─ app/routes.tsx        # routes lazy (code-split par page)
│  │  ├─ components/
│  │  │  ├─ layout/app-shell.tsx   # sidebar + header + ErrorBoundary
│  │  │  └─ ErrorBoundary.tsx      # capture erreurs rendu → Sentry
│  │  ├─ features/
│  │  │  ├─ catalogue/         # CRUD produits + documents + sync
│  │  │  ├─ workspace/         # CTD M1 : arbre, génération, compile, Regafy, PdfViewer
│  │  │  ├─ dashboard/         # validité + veille
│  │  │  ├─ account/           # profil (perso, pro, prefs, logs, danger)
│  │  │  ├─ profile/           # pro-settings (branding org + signature) + sync
│  │  │  ├─ auth/ org/         # AuthProvider, OrgContext, memberships
│  │  │  └─ audit/             # journal ALCOA++ + sync
│  │  └─ lib/                  # db (Dexie), env, supabase, outbox, audit, sentry, i18n
│  ├─ e2e/                     # Playwright : smoke, catalogue, offline, a11y, account
│  ├─ scripts/check-bundle-budget.mjs   # garde-fou perf
│  └─ playwright.config.ts vite.config.ts eslint.config.js
├─ supabase/
│  ├─ migrations/ 0001..0011   # schéma + RLS (appliquées au distant)
│  └─ tests/ rls_isolation.test.sql   # pgTAP isolation multi-tenant
├─ docs/ PLAN.md · BOARD.md · adr/
└─ .github/workflows/ci.yml    # jobs web + e2e
```

---

## 6. Modèle de données

**Multi-tenant :** `orgs` ← `memberships(role)` → `profiles(=auth.users)`.
`current_user_org_ids()` (SECURITY DEFINER) alimente toutes les policies RLS.

| Entité | Dexie (local) | Postgres | Notes |
|---|---|---|---|
| Produit | `products` (+titulaire, fabricant) | `products` | tout part du produit |
| Document | `documents` + `documentBlobs` | `documents` + Storage `documents/` | info/admin, expiry/langue/type |
| Dossier | `dossiers` (+excludedDocIds) | `dossiers` | arbre CTD M1 **côté client** (`module1-tree.ts`) |
| Lettre générée | `generatedDocs` | `generated_docs` | JSON TipTap → PDF |
| Profil pro (org) | `proSettings` kind `orgBranding` | `pro_settings` | **entreprise/poste/pays** + en-tête/pied/logo |
| Signature (user) | `proSettings` kind `userSignature` | `pro_settings` | **owner-only** (RLS) |
| Pièce jointe nœud | `dossierAttachments` | `dossier_attachments` | upload direct sur un nœud |
| Audit | `auditLog` | `audit_log` | **append-only**, RLS select+insert, anti-spoof acteur |

**Migrations (toutes appliquées au distant) :** 0001 socle multi-tenant+RLS · 0002 products/documents+Storage ·
0003 dossiers · 0004 generated_docs · 0005 pro_settings+attachments · 0006 signature owner-only ·
0007 product parties+logo · 0008 audit_log · 0009 audit anti-spoof · 0010 dossier excluded_docs ·
**0011 pro_settings entreprise/poste/pays**.

---

## 7. Offline-first & synchro

- **Authoring offline** : tout s'écrit d'abord dans **Dexie** ; un **pattern outbox** met en file
  les mutations.
- **Sync** : à la reconnexion, **push** (outbox) puis **pull** ; résolution **server-authoritative
  (LWW)** — à timestamp égal, le serveur l'emporte. Pas de collab temps réel (hors scope MVP).
- **PWA** : service worker (Workbox) précache l'app-shell + chunks (`clientsClaim`/`skipWaiting`)
  → **rechargement complet hors-ligne OK** (prouvé par `e2e/offline.spec.ts`).

---

## 8. Sécurité & conformité

- **Isolation tenant par RLS** sur toutes les tables (org-scoped) — **prouvée** par `supabase/tests/rls_isolation.test.sql` (pgTAP).
- **Signature = owner-only** (artefact légal) ; branding partagé par l'org.
- **Audit ALCOA++** : qui/quoi/quand, **append-only**, immuable (RLS select+insert), insert vérifie `actor_id = auth.uid()` (anti-spoof).
- **Secrets** : seuls **URL + anon key** Supabase côté client (`.env.local`, gitignoré). **JAMAIS** dans le repo/chat : `service_role`, clés **Vertex/Gemini** → uniquement **Supabase secrets / Edge Function env**. DSN Sentry = clé publique, OK côté client.
- **MedDRA** (terminologie sous licence) : `RA-source/MedDRA/` **exclu de git**.
- **Sentry** : pas de PII (`sendDefaultPii:false`), pas de session replay, échantillonnage faible.

---

## 9. Milestones (statut)

| # | Milestone | Statut |
|---|---|---|
| **M0** | Fondations (repo, Supabase+RLS, CI/CD, PWA shell, design system) | ✅ |
| **M1** | Catalogue (CRUD + upload, offline + sync) | ✅ |
| **M2** | CTD Workspace M1 (3 panneaux + auto-classement) | ✅ |
| **M3** | Génération & édition (templates UEMOA → TipTap) + **M3.1** (A4/TNR, profil pro, upload nœuds) | ✅ |
| **M4** | **Regafy IA v1** (validité/langue/conformité via Vertex) | ⏳ **Bloqué (creds GCP)** — Regafy **v1 déterministe livré** |
| **M5** | **Traduction in-place** (Gemini + glossaire MedDRA, streaming) | ⏳ **Bloqué (creds GCP)** |
| **M6** | Compilation PDF Module 1 (TDM + pages de garde + bandeau) | ✅ |
| **M7** | Dashboard (validité + veille) | ✅ |
| **M8** | Durcissement (E2E offline, a11y AA, Sentry, budget perf, tests RLS) | ✅ (Lighthouse CI + pilote = suivis) |

**Hors milestones, aussi livré :** audit trail, page Compte (avatar) + **i18n FR/EN** + **thème
clair/sombre**, **ErrorBoundary** (plus d'écran blanc), aperçu **PDF.js** local-first.

---

## 10. Journal (PR mergées sur `main`)

| PR | Date | Contenu |
|---|---|---|
| #1 | 06-06 | M2 — CTD Workspace (Module 1) |
| #2 | 06-06 | M3 — Génération de documents (templates UEMOA) + édition TipTap |
| #3 | 06-07 | M3.1 — Mise en forme A4/TNR, profil pro (en-tête/pied/signature), upload sur nœuds |
| #4 | 06-07 | M6 — Compilation PDF du Module 1 (TDM + pages de garde + bandeau) + aperçu in-place |
| #5 | 06-07 | Arborescence CTD UEMOA — détail section 1.2 + guidance |
| #6 | 06-07 | CTD UEMOA — 1.2.4.3 Certificat de vente libre (FSC) |
| #7 | 06-07 | Compte (avatar) + EN/FR + Dark mode |
| #8 | 06-07 | Audit trail (ALCOA++) + 1 doc/page (sous-sections) + frame Compte figé |
| #9 | 06-07 | Aperçu PDF in-place automatique au clic sur l'arborescence |
| #10 | 06-07 | Regafy v1 + workflow Enregistrer/Compiler + retrait de document |
| #11 | 06-07 | Aperçu PDF.js (local-first) + maj structure + exclusion doc produit + Regafy progressif |
| #12 | 06-07 | M7 Dashboard (validité + veille) + sous-sections d'arborescence visibles |
| #13 | 06-07 | ErrorBoundary (plus d'écran blanc) + garde contenu éditeur |
| #14 | 06-07 | Fix écran blanc PDF (`doc.destroy is not a function`) |
| #15 | 06-07 | **M8-A** E2E Playwright local-first + reload hors-ligne (PWA) + job CI |
| #16 | 06-07 | **M8-B** a11y axe-core WCAG AA + fix contraste Dashboard |
| #17 | 06-07 | **Profil** : Enregistrer en haut + actif si modifié ; infos pro (entreprise/poste/pays) |
| #18 | 06-07 | **M8-C/D** Sentry (lazy) + garde-fou budget de bundle (CI) |
| #19 | 06-07 | **M8-E** suite pgTAP d'isolation multi-tenant (RLS) |
| #20 | 06-07 | `docs/BOARD.md` — board projet (source de vérité vivante) |
| #21 | 06-07 | Fallback SPA Cloudflare Pages (`_redirects`) |
| #22 | 06-07 | Board : **pilote déployé** (pharnos.pages.dev) |
| #23 | 06-07 | `supabase/config.toml` versionné — **Auth Site URL prod** + réglages sécurisés |
| #24 | 06-07 | **Workspace** : TDM général (tous modules CTD) + en-tête/pied uniquement sur les covers |
| #25 | 06-07 | Board : journal à jour (#20→#24) |
| #26 | 06-07 | **Workspace/Catalogue** : docs produit visibles (repli ancêtre + auto-sélection), table catalogue (largeur), hauteur montage, aperçu compilé PDF.js |
| #27 | 06-07 | **Workspace** : titre du dossier dans le bandeau (Google Docs) + montage pleine hauteur |
| #28 | 06-07 | **Workspace** : actions document dans la toolbar du haut + A4 défilable (marge de bas) |
| #29 | 06-08 | **Workspace** : scroll « Google Docs » (page unique, panneaux figés, pill centrée, pied de page) |

---

## 11. Cap — prochaines étapes

1. **🚀 Pilote — EN COURS** : front **déployé** sur Cloudflare Pages (https://pharnos.pages.dev).
   Reste à : **créer les comptes/organisations** pilotes (sign-up), puis **monter 1 dossier Module 1
   réel** de bout en bout (compile PDF au vert) ; (optionnel) brancher un **DSN Sentry** + domaine custom.
2. **M4 — Regafy IA** et **M5 — Traduction** : **dès réception des credentials GCP/Vertex**. La
   mécanique front est prête (Regafy v1 déterministe + emplacements de traduction in-place).
3. **Suivis M8 (optionnels, tâche #10)** : Lighthouse CI (PWA ≥ 90), exécution **auto** des tests RLS
   en CI (service Postgres + pgtap), export DOCX (fast-follow).

### Déploiement (prod) — Cloudflare Pages

- **Projet** : `pharnos` (compte `pharnos.mvp@gmail.com`) · **URL** : https://pharnos.pages.dev ·
  branche prod `main`.
- **Pré-requis** : auth Wrangler (`npx wrangler login`, une fois) ; `web/.env.local` avec
  `VITE_SUPABASE_URL`/`ANON_KEY` (baked au build) ; `VITE_SENTRY_DSN` optionnel.
- **✅ Config Supabase Auth (faite)** : `site_url = https://pharnos.pages.dev` + redirects (prod +
  localhost) appliqués au projet lié via `supabase config push`. Config désormais **versionnée**
  dans `supabase/config.toml` (MFA TOTP on, confirmations e-mail on, OTP 8, anti-spam 1 min).
- **⚠️ Règle d'or CLI Supabase** : **toujours** lancer les commandes `supabase` depuis la **racine du
  repo** (`/d/pharnos-mvp`) — sinon la CLI lit un autre `config.toml` (le CEO a un 2e projet Pharnos)
  et peut pousser la mauvaise config. Le projet correct est ref **`uhsireqwzqqymgsxuvqh`**.
- **Redéployer** (manuel, depuis `web/`) :
  ```bash
  npm run build
  npx wrangler pages deploy dist --project-name pharnos --branch main --commit-dirty true
  ```
- **À faire (durcissement déploiement)** : automatiser via GitHub Actions (déploiement sur push `main`
  avec `CLOUDFLARE_API_TOKEN` en secret de repo) plutôt que manuel.

**Falaises de scale (post-pilote) :** dépassement free tiers Supabase → Pro (~25 $/mois) ; volume IA
(Flash très bon marché) ; bande passante. Architecture prête (IaC portable, abstraction provider IA).

---

## 12. Dev workflow & commandes

**Pré-requis :** Node 24, `npm install` dans `web/`. Backend optionnel (mode local si non configuré).

```bash
# Depuis web/
npm run dev            # serveur de dev
npm run typecheck      # tsc -b (strict)
npm run lint           # eslint
npm run format         # prettier --write
npm run test           # vitest (unit/intégration) — 52 tests
npm run build          # tsc + vite build (PWA)
npm run budget         # garde-fou taille de bundle (après build)
npm run e2e            # Playwright (build+preview+tests, dont offline) — 9 tests
# Depuis la racine
supabase db push --yes # applique les migrations au distant (sur feu vert CEO)
supabase test db       # tests pgTAP RLS (nécessite Docker)
```

**Conventions :** branches `feat/…` `fix/…` `test/…` → **PR** vers `pharnos-mvp/pharnos` → CI verte →
**squash-merge** → maj `main`. Commits co-signés. **Auteur git = `pharnos-mvp`** (pas igoress00229).
Budgets perf (DoD) : TTI < 2,5 s · transitions < 200 ms · compile PDF M1 < ~10 s · Lighthouse PWA ≥ 90.

---

## 13. Protocole de mise à jour de ce board

- **Quand** : à chaque PR mergée qui change l'état du produit.
- **Quoi** : maj §1 (table d'état), §9 (milestones), §10 (journal) + la date d'en-tête. Si une
  **décision** change : maj §4 et/ou ajouter un **ADR** dans `docs/adr/`.
- **Mémoire IA** : le fichier mémoire `project-pharnos-mvp` pointe ici — garder les deux cohérents.
- **Règle d'or** : ce doc doit suffire à un nouveau dev/outil pour **reprendre sans contexte**.

---

## 14. Glossaire

- **RA** — Affaires Réglementaires (Regulatory Affairs).
- **UEMOA/CEDEAO** — unions économiques d'Afrique de l'Ouest (zone cible).
- **CTD / Module 1** — Common Technical Document ; Module 1 = partie administrative/régionale.
- **Regafy** — moteur de vérification Pharnos (v1 = règles déterministes ; v2 = IA Vertex).
- **ALCOA++** — intégrité des données réglementées (Attributable, Legible, Contemporaneous, Original, Accurate, …).
- **Titulaire / Demandeur d'AMM** — détenteur de l'autorisation de mise sur le marché.
- **Pièces admin** : GMP (BPF), ML (licence d'établissement), FSC (vente libre), COPP, AMM, COA, CEP.
- **LWW** — Last-Write-Wins (résolution de conflits de synchro).
- **DoD** — Definition of Done.
