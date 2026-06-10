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

_Dernière mise à jour : 2026-06-10 — **Track A + Track B (Regafy AI Copilot) LIVRÉS & déployés en prod.**_
_**Track A** (#68/#69) : **perf** squelette inline + eager `/catalogue` + budget d'entrée 135 Ko → **Lighthouse 91 · CLS 0 · a11y 100** (matériel représentatif ; sur runner CI mobile ~75 TBT-bound → **Lighthouse gardé en `warn`, gate dur = budget de bundle déterministe**, décision CEO) ; **sécurité** `npm audit` CI (0 vuln) + **pgTAP 9→14** + **ADR 0002**._
_**Track B — Regafy AI Copilot** (creds GCP fournis : projet `gen-lang-client-0475676559`, location `global`, modèle `gemini-3.1-flash-lite` ; secrets Supabase posés ; **2 Edge Functions déployées : `regafy-ai` + `translate`**). Tourne **en arrière-plan** (sans bouton ; complète le panneau « Remarques », constats indistinguables) : **validité multimodale** (Gemini LIT les PDF → expiration explicite OU date d'émission + durée énoncée → calcul de la validité restante vs date d'opération → **≥ 6 mois admin / ≥ 18 mois COA**, réf. agence du pays) · **détection de langue** (RCP/Notice/Étiquette/Artwork vs langue officielle **FR/PT/EN**) · **conformité des lettres** · **titulaire≠fabricant sans contrat** · **traduction MedDRA** (bouton « Traduire » en surbrillance → Edge `translate` lit le PDF → traduit → dialogue de revue) · **concordance du nom de produit** (alerte « mauvais document » si un RCP/AMM/… concerne un autre produit). Analyse **batch + incrémentale + CACHE par document** (chaque doc lu par l'IA **une seule fois**, réutilisé à l'ouverture & en multi-pays ; re-analyse auto à l'upload — Dexie `docAnalysis` v8 ; ~5 s la 1re fois, **instantané ensuite**). Vérifié en prod (tests directs + retour CEO « ça marche »). **Reste (polish)** : streaming de la traduction + « Insérer comme document » ; détection bon doc/bon nœud. Détails §11._
_**Reprise (nouvelle session) :** cœur du MVP déployé ; **Lot A‑1 e-mail OK** + **polish montage M1 (5/5)** +
**mise en page des lettres générées conforme au template officiel UEMOA** (bloc date/destinataire/signature décalé
à gauche [≠ right-align], interligne serré, signature placée dans le PDF, ville auto depuis l'adresse titulaire).
Tout déployé/vert. **Lot C (CI) livré** (auto-deploy + RLS pgTAP + Lighthouse, secrets posés) **+ 1er dossier réel compilé** (Gynoril, 44 p → **DoD atteint**) **+ polish copie-conforme** (#56 composition multi-molécules appariée/non tronquée + espacement signature ; #57 bouton « Insérer »). **Auto-deploy actif** (merge→prod). **Reste :** re-valider le dossier réel (régénérer les lettres + recompiler) + 2 retouches de saisie sur la lettre PGHT. Voir §11._

---

## 1. TL;DR — où on en est

**Le MVP (3 modules) est fonctionnel, online et offline, durci ; le durcissement CI (Lot C) est livré.**
Reste : l'IA (M4/M5) **bloquée sur les credentials Google Cloud**, et **valider le pilote sur 1 dossier réel**.

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

**Qualité (main, vert partout) :** typecheck · lint · format · **75 tests unitaires** · build ·
**budget bundle** · **9 E2E Playwright** (dont reload hors-ligne) · **a11y WCAG AA** · **RLS pgTAP en CI** · **Lighthouse CI** (perf/a11y).

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
| **CI/CD** | **GitHub Actions** (Node 24) | 4 jobs : web · e2e · **RLS pgTAP** · **Lighthouse** + **auto-deploy** (push `main` → Cloudflare Pages) |

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
│  ├─ migrations/ 0001..0013   # schéma + RLS (appliquées au distant)
│  └─ tests/ rls_isolation.test.sql   # pgTAP isolation multi-tenant
├─ docs/ PLAN.md · BOARD.md · adr/
└─ .github/workflows/ ci.yml (4 jobs : web · e2e · rls · lighthouse) + deploy.yml
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
| **M4** | **Regafy IA** (validité multimodale + langue + conformité via Vertex/Gemini) | ✅ **Livré** (#71-#77 — copilote en arrière-plan, déployé) |
| **M5** | **Traduction** (Gemini + terminologie MedDRA) | ✅ **Livré** (#77 — bouton « Traduire » → dialogue de revue ; streaming = polish) |
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
| #30 | 06-08 | Board : journal à jour (#25→#29) |
| #31 | 06-08 | **Workspace** : barre des menus d'édition (Modifier/Signer…) remontée + centrée sur l'aperçu |
| #32 | 06-08 | **Workspace** : barre de format (B/I/H2/Liste) rétablie pleine largeur, alignée à gauche |
| #33 | 06-08 | **Workspace** : barre de format = en-tête direct du visualiseur (sans wrapper sticky) |
| #34 | 06-08 | **Workspace** : barre de format collée à l'en-tête de la page A4 (marge sombre du haut supprimée) |
| #35 | 06-08 | Board : mise à jour reprise (journal #30→#34 + cap Lots A/B/C) |
| #36 | 06-08 | **Auth (Lot A)** : récupération de compte (mot de passe oublié + renvoi de confirmation) + SMTP Resend & templates e-mail FR (config gated) |
| #37 | 06-08 | Board : Lot A entamé (récupération de compte #36, activation SMTP gated) |
| #38 | 06-08 | **Auth (Lot A)** : expéditeur `noreply@pharnos.com` (domaine vérifié) — **SMTP Resend activé & vérifié en prod** (inscription + reset délivrés) |
| #39 | 06-08 | Board : Lot A‑1 e-mail terminé & vérifié en prod |
| #40 | 06-08 | **Workspace** : garde-fou perf compile Module 1 (budget DoD M6 < 10 s ; ~240 ms / 59 pages) |
| #41 | 06-08 | **Workspace (polish 1)** : aperçu PDF offline (`mjs` précaché), titre+barre format sticky, gardes sans nom de fichier, bandeaux pleine largeur |
| #42 | 06-08 | **Catalogue (polish 0)** : titulaire/fabricant **Nom + Adresse** séparés (+ migration 0012) |
| #43 | 06-08 | **Workspace (polish 2)** : papier à en-tête/pied **dans le PDF compilé** + bandeau système noms complets (sans troncature) |
| #44 | 06-08 | **Workspace (polish 3)** : **pages de couverture** CTD globale + Module 1 |
| #45 | 06-08 | Board : polish montage (Slices 1/0/2/3) + journal #39→#44 |
| #46 | 06-08 | **Workspace (fix)** : barre de format recollée à la page A4 (sticky) — retour CEO |
| #47 | 06-08 | **Workspace (polish 4)** : UX **signature & en-tête/pied in-montage** (upload sans navigation + stockage optionnel + placement réservé `[Signature et cachet]` + toggle) |
| #48 | 06-08 | Board : polish montage M1 complet 5/5 + journal #45→#47 |
| #49 | 06-08 | **Workspace (fix)** : taille signature bornée dans l'aperçu éditeur (comme le PDF compilé) |
| #50 | 06-08 | **Workspace** : mise en page des lettres générées (alignements) conforme au **template officiel UEMOA** |
| #51 | 06-08 | **Workspace** : bloc date/destinataire/signature **décalé à gauche** (≠ right-align) + **ville auto** depuis l'adresse titulaire (`city.ts`) |
| #52 | 06-08 | **Workspace (fix)** : interligne serré du bloc destinataire (sauts de ligne) |
| #53 | 06-08 | **Workspace (fix)** : signature placée au bon endroit dans le PDF compilé (indentation du bloc) |
| #54 | 06-08 | **Docs** : board — lettres conformes au template UEMOA + journal #48‑#53 |
| #55 | 06-09 | **Lot C (CI)** : auto-deploy Cloudflare (push `main`, gated `CLOUDFLARE_API_TOKEN`) + **RLS pgTAP en CI** + **Lighthouse CI** (perf/a11y) |
| #56 | 06-09 | **Workspace** : composition multi-molécules **appariée** (DCI↔dosage) & **jamais tronquée** (couvertures en wrap centré, en-tête = nom seul) + **espacement signature** équilibré. Vérifié rendu poppler + pdfjs. |
| #57 | 06-09 | **Workspace** : bouton **« Insérer »** pour quitter le panneau en-tête/pied (miroir du flux signature) |
| #58 | 06-09 | **Docs** : board — journal #54-#57 + DoD atteint |
| #59 | 06-09 | **Workspace** : couverture globale (centrée, cadre, logo haut) + titulaire/fabricant nom + adresse |
| #60 | 06-09 | **Workspace** : couverture **calée sur le template officiel** (tailles + équilibre vertical, auto-fit composition) + vraies puces **« • »** (rendu liste via `inlineSegments`) + Module 1 pays décalé |
| #61 | 06-09 | **Profil** : **Poste + Nom et prénom(s) du signataire** auto-injectés dans le bloc signature (champ profil + colonne `pro_settings.signataire`, **migration 0013**) |
| #62 | 06-09 | **Docs** : board — journal #58-#61 + DoD atteint |
| #63 | 06-09 | **Docs** : board — kit de démarrage Lot B (IA) + Lot A clos |
| #64 | 06-09 | **Workspace** : **destinataire des lettres auto-rempli par pays UEMOA** (civilité par rang + agence + adresse, 8 pays ; `roadmap-data` + `agencyCivilite`) |
| #65 | 06-09 | **Docs** : board — journal #62-#64 + DoD validé CEO |
| #66 | 06-09 | **Workspace** : lettres officielles — **sigle agence** entre parenthèses + **formule d'appel & politesse par rang** (« Monsieur le Directeur Général, ») au lieu de « Madame, Monsieur, » |
| #67 | 06-09 | **Docs** : board — journal #65-#66 (sigle agence + formules d'appel/politesse par rang) |
| #68 | 06-10 | **Perf (Track A)** : squelette d'app-shell inline + eager `/catalogue` + budget d'entrée 175→135 Ko (FCP/LCP ; **perf 91** local · a11y 98→100 · CLS 0 ; Lighthouse en `warn`, gate = budget bundle déterministe) |
| #69 | 06-10 | **Sécurité (Track A)** : `npm audit` en CI (0 vuln) + **pgTAP 9→14** (dossiers/generated_docs/attachments + anti-spoof audit) + **ADR 0002** (posture + contrat Edge Functions IA) |
| #70 | 06-10 | **Docs** : board — Track A livré (perf #68 + sécurité #69) + corrections (secrets 4/4, migrations 0013) |
| #71 | 06-10 | **IA (Lot B)** : Edge `regafy-ai` (Gemini 3.1 Flash Lite/Vertex) + provider `VertexGemini` (`_shared/vertex.ts`) + 1er finding IA (conformité lettres) ; **secrets GCP posés** |
| #72 | 06-10 | **Copilote** : arrière-plan (sans bouton ni badge) + règles déterministes (validité 6/18 mois, titulaire≠fabricant) + type doc `contract` ; +6 tests |
| #73 | 06-10 | **Validité multimodale** : Gemini LIT les PDF des pièces → date/durée → calcul vs 6/18 mois (AMM/FSC expirés, ML <6 mois détectés en prod) |
| #74 | 06-10 | **Fix** : déclencher le copilote sur les pièces admin/COA (pas seulement quand il y a des lettres générées) |
| #75 | 06-10 | **Perf IA** : validité en **1 appel batch** (~5 s au lieu de ~50 s, fin de la sérialisation Vertex) + analyse **incrémentale** (nouvelles pièces seulement) |
| #76 | 06-10 | **Validité calculée** : date d'émission + durée énoncée → expiration calculée ; **réf. agence** du pays ; démarrage ~5 s (déclenchement sur signature des pièces) |
| #77 | 06-10 | **Langue + Traduction (M5)** : détection de langue (RCP/Notice/Étiquette/Artwork vs langue du pays) + bouton **« Traduire »** → Edge `translate` (MedDRA) → dialogue de revue |
| #78 | 06-10 | **Docs** : board — Track A + Regafy AI Copilot livrés (header + journal + M4/M5 ✅) |
| #79 | 06-10 | **Copilote (éco)** : **cache d'analyse par document** (1 lecture IA/doc, réutilisé multi-pays — Dexie `docAnalysis` v8) + **concordance du nom de produit** (alerte « mauvais document ») + re-analyse auto à l'upload |
| #81 | 06-10 | **Fix UX/PWA** : **mise à jour fiable du SW** (recharge auto quand le nouveau worker prend le contrôle → fin du code périmé servi après déploiement, cause des « fixes invisibles ») + bouton **« Traduire en un clic »** en surbrillance directement sur l'aperçu du doc (langue ≠ pays cible) + badge catalogue « En attente »/« Synchronisé » → **icône d'état discrète** (non-bouton). _Aperçu PDF hors-ligne = comportement existant (#9), pas une régression (requiert le fichier en cache local)._ |
| #82 | 06-10 | **Offline-first robuste** : **épinglage local des fichiers** (blobs). `pullDocuments`/`pullAttachments` téléchargent désormais en arrière-plan les blobs manquants ; l'aperçu + la compilation mettent aussi le fichier en cache après tout accès réseau. Un doc tiré du serveur (ou après vidage de cache) devient consultable + compilable **hors-ligne** dès une ouverture en ligne. Corrige : PDF produit absents de l'aperçu/du livrable hors-ligne. |
| #83 | 06-10 | **Libellé langue** : constat « langue **cible** » → « langue **officielle du \<Pays\>** » (préposition FR correcte : « du Bénin », « de la Côte d'Ivoire »). Edge `regafy-ai` (redéployé) + front passent le pays ; **cache d'analyse versionné (v2)** pour réappliquer le nouveau libellé aux docs déjà analysés. |
| #84 | 06-10 | **Traduction côte-à-côte (M5)** : « Traduire » crée une **traduction éditable** (document généré, menu de format) affichée **côte à côte avec l'original**, **sauvegardée + incluse dans le PDF compilé**, **propre au dossier** et **sans remplacer** le document produit. Remplace la modale. Migration `generated_docs.source_doc_id` (0014) + helper `textToTiptap` + dédup par doc source. |
| #85 | 06-10 | **Compile hors-ligne fiable** : **préchargement du compilateur PDF** (pdf-lib) tant qu'on est en ligne → en mémoire avant toute coupure (l'import dynamique ne peut plus échouer offline). _Cause vérifiée en live (Chrome MCP) : chunk compilateur non chargé au montage + précache désync après déploiements rapides → import en échec mis en cache._ + erreur réelle affichée au lieu du message générique + rendu de chaque pièce défensif (une pièce fautive n'abat plus toute la compile). |
| #86 | 06-10 | **UX traduction « 2 onglets navigateur »** : « Traduire » ouvre un **onglet voisin** « \<original\>_\<LANG\>.docx » (éditable au menu de format, plein largeur) avec **« × » pour le retirer du dossier** ; bouton renommé **« Traduire en \<LANG\> »** ; **cache anti-retraduction** (recliquer rouvre l'onglet, zéro appel IA) ; **Télécharger** selon l'onglet actif → **PDF** (original) ou **.docx** (traduction — convertisseur TipTap→DOCX, lib `docx` en **chunk lazy** hors entrée). |
| #87 | 06-10 | **Regafy analyse aussi les uploads directs workspace** : une **pièce jointe** téléversée sur un nœud (≠ doc sous la fiche produit) est désormais ajoutée à `aiPieces` avec le **type dérivé du nœud** (`docTypeForNode`, inverse de `NODE_BY_DOCTYPE`) → détection de langue (RCP/Notice/Étiquette/Artwork) + validité, comme un doc produit. _Vérifié en live (Chrome MCP) : un RCP joint sur 1.3.1 n'était pas analysé._ Même bucket Storage (`documents`) → l'Edge le télécharge sans changement. |
| #88 | 06-10 | **Polish constats / onglets / barre d'édition** : (a) le **gate de pré-compilation** liste désormais **tous** les constats (déterministes **+** IA) au lieu d'une seule ligne ; (b) le **constat de langue + le bouton « Traduire » s'effacent** dès qu'une traduction existe, et la traduction s'ouvre **éditable d'emblée** ; (c) **« × » sur chaque onglet** (façon navigateur) pour retirer le doc du dossier — l'original inclus ; (d) la **barre d'édition** (Modifier/Signer/En-tête/Régénérer) ne s'affiche que sur du **texte éditable** (masquée sur un PDF, présente après traduction/génération). |
| #89 | 06-10 | **Détection de langue sur upload workspace — tout nœud produit** : une pièce jointe téléversée sur un nœud **1.3.x non mappé** (Étiquetage étranger 1.3.4, produits de référence 1.3.5…) n'était **pas** analysée (`docTypeForNode` → null). Repli → **`labeling`** (type LANG) pour tout 1.3.x → **détection de langue garantie** quel que soit le sous-nœud produit. _Diagnostic : la pièce sur 1.3.1 (mappé) était bien analysée, mais pas les autres nœuds 1.3.x._ + synchro `await` + toast « analyse en cours » à l'upload. |
| #90 | 06-10 | **Extraction de validité fiabilisée (zéro hallucination)** : l'analyse passe d'**un seul gros appel multimodal** (qui hallucinait des dates — le **même FSC** donnait `2026-04-29` puis `1998-11-13` selon le run — ou tombait en « aucune date » à tort) à **1 document par appel** (focus maximal + réessai + prompt conservateur « date verbatim, found:false si incertain »). **Vérifié en live : déterministe** (FSC = 2026-04-29 à chaque run). **Vocabulaire honnête** : échec d'extraction → « extraction échouée — à vérifier » ; lu sans date → « validité non détectée » ; **jamais « aucune date »** à tort. + option de modèle par appel (`vertex.ts` `model`, secret `GCP_MODEL_VALIDITY`). Cache **v3**. _`gemini-3.1-flash` indispo en location `global` (404) → flash-lite suffit grâce au focus per-doc._ |

---

## 11. Cap — prochaines étapes (REPRISE : on choisit le lot, puis on exécute)

> **Le cœur du MVP (3 modules, online+offline) est livré, en ligne et durci.** Il reste 3 lots ;
> le **Lot A** rend le pilote exploitable et valide la métrique de succès du DoD.

**🟢 Lot A — Rendre le pilote réellement exploitable** *(e-mail ✅ ; polish montage ✅ ; **1er dossier réel compilé ✅ → DoD atteint** ; couverture template + puces + signataire profil ✅ ; reste : remplir le profil + régénérer)*

1. **E-mail d'inscription + récupération de compte** — ✅ **TERMINÉ & vérifié en prod** :
   - ✅ Front (#36) : « mot de passe oublié » (écran de reset via `PASSWORD_RECOVERY`) + « renvoyer la confirmation ».
   - ✅ Config (#36) + expéditeur `noreply@pharnos.com` (#38) : `[auth.email.smtp]` **Resend** + `email_sent` 30/h + **templates FR** (`supabase/templates/`).
   - ✅ **Activé en prod** : `supabase config push` (projet `uhsireqwzqqymgsxuvqh`, clé Resend lue depuis `.env` **racine gitignoré**) + redeploy front. **Vérifié** : inscription + reset délivrent l'e-mail FR (expéditeur `pharnos.com`).
   - ⚠️ La clé Resend vit dans `.env` (racine, gitignoré) pour les futurs `config push` — **ne jamais la commiter** ; toujours pousser **depuis la racine** du repo.
2. **Polish montage Module 1** (smoke test CEO **7/10** → livrable) — livré + déployé :
   - ✅ **Slice 1 (#41)** : aperçu PDF **offline** (`mjs` précaché), titre + barre de format **sticky**, gardes sans nom de fichier, bandeaux pleine largeur.
   - ✅ **Slice 0 (#42, migration 0012)** : titulaire/fabricant **Nom + Adresse** séparés.
   - ✅ **Slice 2 (#43)** : **papier à en-tête/pied dans le PDF compilé** + bandeau système **noms complets** (sans troncature).
   - ✅ **Slice 3 (#44)** : **pages de couverture** (CTD globale + Module 1).
   - ✅ **Slice 4 (#47)** : UX **signature & en-tête/pied in-montage** — upload sans navigation + stockage optionnel (permission) + signature au paragraphe réservé `[Signature et cachet]` + toggle. **Fix #46** : barre de format recollée à l'A4 (sticky).
   - ℹ️ **Sync offline (réponse au CEO)** : à la reconnexion, l'outbox est poussée (métadonnées **+ blobs vers Storage**) puis pull **LWW server-authoritative** — automatique. Le PDF compilé n'est pas stocké (régénéré à la demande).
3. **Valider le DoD** — ✅ **1er dossier réel compilé** (Gynoril Ovule, **44 pages**, produit **4 molécules**) :
   le PDF compile, se télécharge et s'ouvre → **DoD atteint**. Round de **polish copie-conforme** (retours CEO) :
   - ✅ **#56** : composition multi-molécules **appariée** (DCI↔dosage) & **jamais tronquée** (couvertures wrap centré, en-tête courant = nom commercial seul) + **espacement signature** resserré/équilibré.
   - ✅ **#57** : bouton **« Insérer »** pour quitter le panneau en-tête/pied.
   - ✅ **#59-#60** : couverture **calée sur le template officiel** (tailles + équilibre vertical, auto-fit composition) + vraies puces **« • »**.
   - ✅ **#61** : **Poste + Nom du signataire** depuis le profil (migration 0013).
   - ✅ **#64** : **destinataire des lettres auto-rempli par pays UEMOA** (civilité par rang + agence + adresse ; 8 pays).
   - ✅ **DoD VALIDÉ par le CEO** (lettre réelle propre, 2026-06-09). Reste perso : remplir le profil (Poste + Nom signataire) + régénérer pour figer au JSON.
4. *(optionnel)* domaine custom + **DSN Sentry** en prod (`VITE_SENTRY_DSN`).

**🔴 Lot B — Couche IA (M4 Regafy IA + M5 Traduction) — PROCHAIN LOT** *(à relancer dans une nouvelle conversation ; bloqueur unique = credentials GCP/Vertex du CEO)*

> Tout est cadré ci-dessous → une nouvelle session démarre direct par l'étape ① (demander les creds), puis exécute. PLAN détaillé : `docs/PLAN.md` (M4 §133, M5 §134, archi IA §79-82).

**① À DEMANDER AU CEO EN PREMIER** (sans ça, rien ne tourne) :
- **Projet GCP** : `project_id` + **région** Vertex (ex. `us-central1` / `europe-west1`).
- **API Vertex AI activée** + **facturation** liée (crédits ~300 $ + free tier OK au début).
- **Service account** rôle **`Vertex AI User`** (`roles/aiplatform.user`) → **clé JSON**.
- ⚠️ Clé JSON **JAMAIS dans le repo ni le chat** → **secret Supabase** depuis la racine : `supabase secrets set GCP_SA_KEY="$(cat key.json)" GCP_PROJECT_ID=… GCP_LOCATION=…`. Modèle : **`gemini-1.5-flash`** (no-train).

**② CE QUI EXISTE DÉJÀ** (ne pas refaire) :
- **Regafy v1 déterministe** : `web/src/features/workspace/regafy.ts` (`runRegafy` → `RegafyFinding[]` : expiry, placeholders restants, section validée sans doc, dossier vide, titulaire manquant). Affiché panneau droit (`DossierWorkspacePage`) + badge Catalogue. **L'IA ENRICHIT ces constats** (même modèle `RegafyFinding`), ne les remplace pas.
- ❌ **PAS encore** : abstraction provider, Edge Functions (`supabase/functions/` **vide**), traduction. **À créer** (l'ancienne note « abstraction prête » était inexacte).

**③ ARCHI CIBLE** (décisions verrouillées) :
- Moteur = **Gemini Flash via Vertex AI** (no-train) derrière une **abstraction provider** (`LLMProvider` : `analyze()` / `translateStream()`, impl `VertexGemini` ; swap Claude/EU plus tard).
- Orchestration = **Supabase Edge Functions (Deno/TS)** : `regafy-ai` (analyse → findings) + `translate` (streaming). Secrets GCP **côté Edge uniquement**, jamais client.
- **Assistif only** (human-in-the-loop, jamais final). Budget **1er token traduction < 2 s**. zod + rate limiting + RLS.

**④ PLAN D'EXÉCUTION** (slices verticales) :
1. Creds ① → `supabase secrets set` + activer l'API Vertex.
2. Abstraction `LLMProvider` + impl `VertexGemini` (auth SA : JWT → access token ; `:generateContent` / `:streamGenerateContent`).
3. **Edge `regafy-ai`** : 1 finding IA bout-en-bout (ex. conformité template d'une lettre) → afficher dans le panneau Regafy (1ʳᵉ slice).
4. Étendre M4 : détection langue + **OCR/vision** des pièces scannées (Gemini multimodal).
5. **M5 traduction in-place** : Edge `translate` (streaming) + insertion TipTap + **glossaire MedDRA**.

**🟢 Lot C — Finitions DoD / durcissement** *(CI #55 ; **secrets 4/4 posés** + **perf traitée #68** — 91 sur device représentatif, gate = budget bundle — Track A)*

- ✅ **Lighthouse CI** (#55) + **perf optimisée (#68)** : squelette d'app-shell inline + eager `/catalogue` + budget d'entrée 135 Ko → **perf 91 · a11y 98→100 · BP 100 · CLS 0** sur matériel représentatif. ⚠️ Sur runner **CI mobile** : **TBT-bound ~75** (CPU partagé + throttle ×4) → **décision CEO** : Lighthouse gardé en `warn`, **gate dur = budget de bundle déterministe**. Atteindre 90 en CI mobile imposerait du SSR/prerender (hors scope MVP).
- ✅ **RLS pgTAP en CI** (#55) : `supabase start` + `supabase test db` — **isolation multi-tenant prouvée à chaque run**.
- ✅ **Auto-deploy CI** (#55, `deploy.yml`) : push `main` → Cloudflare Pages. **Secrets 4/4 posés** (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `CLOUDFLARE_ACCOUNT_ID`, **`CLOUDFLARE_API_TOKEN`**) → **auto-deploy pleinement armé et vérifié** (Deploy `success` à chaque merge, dont #68/#69 — prod redéployée).
- ⏳ Export DOCX (fast-follow).

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
- **✅ Auto-deploy (CI, #55)** : `.github/workflows/deploy.yml` déploie sur push `main` (gated `secrets.CLOUDFLARE_API_TOKEN`). Secrets repo posés via `gh secret set` : `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `CLOUDFLARE_ACCOUNT_ID`. **Activation finale** : `gh secret set CLOUDFLARE_API_TOKEN` (token scopé *Cloudflare Pages → Edit* ; saisie au prompt → hors historique shell).

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
