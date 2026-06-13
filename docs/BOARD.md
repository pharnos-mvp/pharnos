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

_Dernière mise à jour : 2026-06-12 — **V2 EN PRODUCTION + recettes CEO n°1-7 livrées ; plan MVP ancré.**_

_**Bascule prod** (PR #117, rollback tag `v1-mvp`) : `main` = prod sur **pharnos.pages.dev**, features en
branches PR (CI 6 jobs ; e2e/lighthouse/rls sur PR uniquement depuis #122). **Regafy refondu À LA DEMANDE**
(recette n°6 : bouton « Analyser » par pièce ET par document traduit/conforme — n°7 —, scan mockup, carte
multi-actions, remarques de session vides par défaut, cache (pieceId, updatedAt) v7) + **Audit Global**
(rapport A4 corporate DÉTERMINISTE, gate de compilation) + **formulaires officiels** RCP/Notice/Étiquetage
(navy, exports DOCX/PDF, rendu compilé identique) + **UI premium** (donut dégradé, poignées 18×46,
arborescence compacte, pages de GARDE épurées [Autogénéré]/[Téléverser]). **Coûts validés CEO : 0 € jusqu'au
1er client payant** (keep-alive anti-pause actif ; bascule Supabase Pro 25 $/mois aux seuils). Détails :
[PLAN-V2.md](PLAN-V2.md)._

_**Reprise (nouvelle session)** : le cap est dans **[ROADMAP-MVP.md](ROADMAP-MVP.md)** (jalons H→M jusqu'au
GO-LIVE). **Correspondance v2 ✅ LIVRÉE EN PROD le 2026-06-12** (#126 + fixes, migration 0018, Edge `share`
redéployée — retours CEO : PDF streaming Range, tiroir docké, écran terminal, boîte Gmail×WhatsApp par
dossier, sécurité L1 TTL/journal/filigrane). Prochaine action : **jalon I (backups + restore drill)** —
préalables CEO : (1) **brancher Cloudflare Pages au repo Git** ([DEPLOY-CLOUDFLARE.md](DEPLOY-CLOUDFLARE.md),
~5 min dashboard — deploy auto à 0 min GitHub ; en attendant : wrangler local) ; (2) poser le secret repo
`SUPABASE_DB_URL` ; (3) quota GitHub Actions au reset du cycle (CI PR-only désormais)._

---

## 1. TL;DR — où on en est

**Le produit est EN PRODUCTION (pharnos.pages.dev), IA comprise, durci, optimisé — recettes CEO n°1-7
livrées.** Cap : [ROADMAP-MVP.md](ROADMAP-MVP.md) — jalons H→M (correspondance/partage, ops, branding,
i18n, admin/quotas, gate GO-LIVE).

| Domaine | État |
|---|---|
| **Catalogue** (produits + documents) | ✅ Livré (offline + sync) |
| **CTD Workspace** (Module 1) | ✅ Livré (arborescence, upload, génération lettres, compile PDF, Regafy v1, aperçu PDF) |
| **Dashboard** (validité + veille) | ✅ Livré |
| **Compte / i18n FR-EN / thème clair-sombre** | ✅ Livré |
| **Audit trail (ALCOA++)** | ✅ Livré |
| **Durcissement M8** (E2E offline, a11y AA, Sentry, budget perf, tests RLS) | ✅ Livré |
| **Regafy IA (M4)** · **Traduction Pro (M5)** | ✅ Livré — **à la demande** (bouton Analyser, cache v7), Upgrade/templates, Audit Global A4 |
| **Formulaires officiels** (RCP · Notice · Étiquetage) | ✅ Livré (navy, DOCX/PDF, compilé identique) |
| **CI/CD + coûts** | ✅ Optimisé (#122 : ÷2 minutes, keep-alive Supabase) — 0 € jusqu'au 1er client |
| **Déploiement pilote** | ✅ **En ligne — https://pharnos.pages.dev** (Cloudflare Pages, mode authentifié) |
| **Correspondance (jalon H + v2 + UX v3)** | ✅ **EN PROD (2026-06-13, #127)** : V2 (review dockée, PDF streaming Range, écran terminal, mise à jour d'envoi, sécurité L1 TTL/journal/filigrane) **+ habillage WhatsApp** — boîte 2 volets (recherche, filtre Toutes/Non lues, avatars, ⋮), 2 tailles (défaut↔large), fond doodle, bulles vert/gris, accusé ✓✓ honnête, cartes document ; recette prod complète (labo + reviewer, 2 tailles) |

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
| **H** | **Correspondance & partage** (ROADMAP-MVP) — envoi tokenisé, review publique sans compte, décisions révisables, fil temps réel, 5 états home | ✅ **Livré en prod** (#124 + fix #125, recette réelle aller-retour + e-mail délivré) |

**Hors milestones, aussi livré :** audit trail, page Compte (avatar) + **i18n FR/EN** + **thème
clair/sombre**, **ErrorBoundary** (plus d'écran blanc), aperçu **PDF.js** local-first.

---

## 10. Journal (PR mergées sur `main`)

| PR | Date | Contenu |
|---|---|---|
| #124 | 06-12 | **Jalon H — Correspondance** : envoi tokenisé (SHA-256, PBKDF2 600k), page publique /r/{token}, Edge `share` service-role rate-limitée, fil append-only à décision révisable, états home dérivés, notify Resend |
| #125 | 06-12 | fix realtime : setAuth explicite sur le socket + observabilité CHANNEL_ERROR |
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

## 11. Cap — prochaines étapes

> **Le cap d'exécution vit dans [ROADMAP-MVP.md](ROADMAP-MVP.md)** (ancré le 2026-06-12, après la
> recette n°7). Résumé des jalons — chacun livrable, recettable en prod :

| Jalon | Contenu | Durée | État |
|---|---|---|---|
| **H** | **Module Correspondance & Partage du dossier CTD** — H0 cadrage mockups CEO → fil offline-first par dossier (soumission/requêtes/réponses/décision, statuts), lettres de réponse + échéances par agence, partage org en lecture + lien externe signé à expiration | ~4 s. | ⏳ **H0 = prochaine action** |
| **I** | **Ops & filets** — backup hebdo pg_dump chiffré → R2 + restore drill TESTÉ, alertes seuils, uptime (avant les pilotes réels) | 1 s. | ⏳ (secret SUPABASE_DB_URL à poser — CEO) |
| **J** | **Branding** — landing, domaine custom (~12 $/an, seule dépense), offres affichées, e-mails domaine | 2 s. | ⏳ |
| **K** | **i18n EN/FR complet** (UI + e-mails ; templates réglementaires inchangés = langue du pays cible) | 1,5 s. | ⏳ |
| **L** | **Admin & quotas** — console admin, **quotas IA par org** (verrou coûts Gemini), invitations/rôles | 2 s. | ⏳ |
| **M** | **Durcissement final & gate GO-LIVE** — revue RLS/rate-limits/CSP, budgets perf en CI (LCP ≤ 2,5 s, INP < 200 ms), k6 Edge, checklist signée CEO | 2 s. | ⏳ GATE |

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
