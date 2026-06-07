# Pharnos MVP — Plan d'exécution (CTO) — variante « near-zero cost »

> Statut : **APPROUVÉ par le CEO** (go donné). Source de vérité **du plan** (vision, scope, DoD).
> 👉 **État vivant du projet (avancement, journal, cap) : [`docs/BOARD.md`](./BOARD.md).**

---

## Contexte (pourquoi ce build)

Pharnos = l'OS des affaires réglementaires pharma UEMOA/CEDEAO (« Veeva africain, en mieux »).
Le MVP cible **3 fonctionnalités**, online **et** offline, qualité RegTech, **coût proche de zéro** :
1. **Catalogue** — CRUD produits + documents.
2. **CTD Workspace (Module 1)** — arborescence éditable, panneau central édition/preview,
   panneau droit complétude/alertes, upload, génération lettres/formulaires, traduction
   in-place, édition, compilation PDF, Regafy AI.
3. **Dashboard** — monitoring validité des pièces admin + veille réglementaire.

**Profil équipe :** le **CEO est expert RA UEMOA/CEDEAO** (fournit/valide le contenu
réglementaire) ; le **CTO (Claude Code) réalise 100 % du dev, tests, CI/CD, déploiement**.
**Souveraineté des données : non prioritaire au MVP** (labos clients majoritairement asiatiques)
→ région la moins chère/rapide, infra portable.

---

## Décisions d'architecture verrouillées (recommandations CTO)

| # | Question | Décision CTO | Pourquoi |
|---|----------|--------------|----------|
| 1 | **Offline** | **Local-first pragmatique** : authoring offline (produits, arborescence, brouillons) via PWA + base locale + file de synchro. Pas de collab temps réel au MVP ; architecture prête pour le sync complet plus tard. | Le full-CRDT temps réel est trop lourd/risqué/coûteux pour le MVP. On livre la vraie valeur offline (terrain) sans couler le planning. |
| 2 | **IA / données** | **Google Gemini (Flash) via Vertex AI** = moteur de **Regafy AI**, derrière une couche d'abstraction provider. **Vertex = no-train par défaut** (gouvernance enterprise) ; **démarrage sur crédits/free tier** Google Cloud. | Confidentialité dès le départ (pas d'entraînement Google), très bon marché, multimodal (OCR/vision + traduction). Abstraction = swap (Claude/EU/self-host) plus tard. |
| 3 | **Résidence données** | **Pas de contrainte au MVP** → région managée la moins chère/rapide ; infra portable (IaC) si un client l'exige un jour. | Confirmé par le CEO : souveraineté non prioritaire pour le pilote. |
| 4 | **Édition** | **Éditeur web TipTap/ProseMirror → PDF**. Docs en JSON ProseMirror ; **export DOCX en fast-follow** (post-MVP). | Colle au brief « Google Docs » minimaliste, le plus rapide, propre. |

---

## 1. Objectif & métrique de succès

- **Objectif :** un SaaS web rapide et offline-capable où un responsable RA enregistre un
  produit, **monte un dossier CTD Module 1 conforme** (upload/générer/traduire/éditer), le
  **compile en PDF**, et **suit la validité** des pièces admin + la veille — pour ≥1 pays UEMOA/CEDEAO.
- **Succès :** **≥ 3 organisations pilotes** compilent chacune **≥ 1 dossier Module 1 réel** en
  PDF (complétude au vert), **en < 1 jour**, **fonctionnel hors-ligne**.

## 2. Scope (tranche verticale qui crée de la valeur d'abord)

Produit → dossier → livrable, de bout en bout : Catalogue (CRUD + upload, offline+sync) →
Workspace M1 (arborescence éditable, **auto-classement** des docs produit, complétude/alertes) →
génération/édition (templates → TipTap) → Regafy AI v1 (validité, langue, conformité template,
bon doc/bon nœud) → traduction in-place (streaming + glossaire MedDRA) → **compilation PDF**
(signets/numéroté, + hooks eCTD v4) → Dashboard (validité + veille).

## 3. Non-goals (pas maintenant)

Modules Traduction/Audit/Correspondance standalone ; CTD Modules 2-5 ; livrable eCTD v4 (hooks
seulement) ; collab temps réel ; portail public review agence ; soumission directe agences ;
apps natives ; facturation ; SSO/MFA avancé ; i18n au-delà de FR (+EN si trivial) ; licence MedDRA complète.

## 4. Architecture & stack (near-zero cost, serverless)

> Principe : **gratuit/managé d'abord, ultra rapide, sécurisé, simple**. Pas de serveur lourd au MVP.

**Frontend (offline-first)**
- **Vite + React + TypeScript (strict)** en **PWA (Workbox)** → **Cloudflare Pages** (free, edge/CDN mondial).
- **Tailwind CSS + shadcn/ui (Radix)** — rapide, accessible (WCAG AA), minimaliste.
- **TanStack Query + Dexie.js (IndexedDB)** (données offline réactives) + **OPFS/Cache API**
  (blobs documents offline, pinning sélectif).
- **TipTap (ProseMirror)** — éditeur rich-text, modèle JSON.

**Données / Auth / Storage**
- **Supabase (free tier)** — **Postgres + Auth (JWT) + Storage (S3-compat) + RLS + Realtime**.
  Isolation tenant stricte par **RLS** = pilier confidentialité pharma.

**Logique serveur**
- **Supabase Edge Functions (Deno/TS)** — orchestration Regafy AI, traduction (streaming),
  génération depuis templates, réconciliation sync. **Pas de NestJS/conteneur au MVP**
  (ajout possible plus tard si la charge le justifie).
- **pg_cron + Edge Functions** — alertes de validité + ingestion veille. **Pas de Redis/BullMQ au MVP.**

**IA (Regafy AI) — Google Gemini (Flash) via Vertex AI, abstraction provider**
- Extraction dates d'expiration, génération Cover/PGHT/formulaires, classification arborescence,
  conformité template, détection langue, **OCR/vision** (pièces scannées), **traduction** + **glossaire MedDRA**, streaming texte.
- **Vertex AI = no-train par défaut** (confidentialité enterprise) ; **démarrage sur crédits/free tier** Google Cloud. Couche d'abstraction → swap Claude/EU/self-host sans réécriture.

**PDF — côté client/edge (pas de Chromium)**
- **@react-pdf/renderer** ou **pdfmake** (génération lettres) + **pdf-lib** (fusion, signets,
  numérotation Module 1). Déployable partout, coût nul. (+ points d'extension **eCTD v4**.)

**Offline / Sync**
- Service worker Workbox ; Dexie (données) ; OPFS (blobs) ; **pattern outbox** (push à la
  reconnexion + pull) ; résolution **server-authoritative (LWW + version vector)**, conflits exposés en UI.

**Sécurité**
- Supabase Auth + **RLS** (isolation org/tenant) ; **RBAC** (admin labo, RA officer, reviewer
  agence) ; **URLs signées** courte durée ; **audit log** des actions dossier/document ;
  validation zod ; rate limiting ; TLS + chiffrement at-rest ; secrets en secret-manager.

**Ops / Observabilité**
- **GitHub Actions** (lint, typecheck, test, build, deploy) ; **Sentry (free)** ; backups Supabase + PITR.

**Modèle de données (haut niveau)**
- `Org`, `User`, `Membership(role)` · `Product` (nom commercial, DCI, dosage, forme,
  présentation, classe thérapeutique, code ATC…) · `Document` (type RCP/Notice/Artwork/COA/ML/
  GMP/FSC/COPP/AMM ; catégorie info|admin ; fichier, version, langue, `expiry_date`, statut,
  validité) · `Country`, `RegulatoryActivity`, `AgencyInfo` (agence, dossier requis, frais,
  échantillons, délais → **Roadmap**) · `Dossier`, `DossierNode` (arborescence M1 éditable),
  `DossierItem` (Document→nœud) · `Template` (lettres/formulaires « en vigueur », **versionnés**) ·
  `ValidityAlert`, `RegulatoryWatch` · `AuditLog`.

## 5. Coûts (posture near-zero — MVP/pilote)

- **Dev humain : ~0 €** — CTO (Claude Code) écrit code + tests + CI/CD + déploiement.
- **Infra MVP : ~0 €** — Supabase free, Cloudflare Pages free, Sentry free, **Vertex AI** (crédits offerts ~300 $ + free tier au début).
- **À assumer** : domaine ~10-15 €/an ; Vertex AI au-delà des crédits (Flash très bon marché, ~qq $/mois).
- **Falaises de scaling** (post-pilote) : dépassement free tiers → Supabase Pro (~25 $/mois), bande passante, volume IA.
- ✅ **Vertex AI = pas d'entraînement Google sur tes données** (gouvernance enterprise) → confidentialité pharma OK dès le départ.

## 6. Qui fait quoi

- **CTO (moi)** : 100 % du dev, tests, CI/CD, déploiement, sécurité.
- **CEO (toi, expert RA)** : contenu réglementaire (arborescence M1, templates, roadmap pays/
  activité), décisions produit, **comptes + clés API**, **approbation** des actions sortantes.

## 7. Milestones (tranches verticales livrables)

> Estimations relatives, MVP réalisé par le CTO. Première valeur dès **M1 (Catalogue)**.

| # | Milestone | Contenu | Effort |
|---|-----------|---------|--------|
| **M0** | **Fondations** | Repo, Supabase (Auth + multi-tenant **RLS**), CI/CD, **PWA shell**, design system. | S |
| **M1** | **Catalogue** ⭐ | CRUD produit (3 sessions) + upload docs → Storage, métadonnées (expiry/langue/type), **offline read+brouillon+sync**. | M |
| **M2** | **CTD Workspace M1** | 3 panneaux (arborescence éditable / central / complétude+alertes), **auto-classement** docs produit. | L |
| **M3** | **Génération & édition** | Templates Cover/PGHT/formulaires → TipTap → édition in-place. | M |
| **M4** | **Regafy AI v1** | Détection expiry, détection langue+suggestion, conformité template, bon doc/bon nœud (assistif). | M |
| **M5** | **Traduction in-place** | Gemini + glossaire MedDRA, streaming texte, traduction document. | M |
| **M6** | **Compilation PDF** | Assemblage Module 1 → PDF signets/numéroté + téléchargement (+ hooks eCTD v4). | S |
| **M7** | **Dashboard** | Monitoring validité (GMP/ML/FSC/COPP/AMM) + feed veille. | M |
| **M8** | **Durcissement** | Offline E2E, budget perf, tests sécurité/RLS, a11y, observabilité, pilote. | S |

*(S ≈ petit, M ≈ moyen, L ≈ large.)*

## 8. Risques & mitigations (top 3)

1. **Exactitude réglementaire** — **fortement atténué** (le CEO est expert RA et fournit/valide
   le contenu). Reste à : structurer ce contenu en **données versionnées** (jamais en dur) +
   provenance « template en vigueur » + sorties IA toujours **revisables, jamais finales**.
2. **Complexité offline / conflits de sync** → scope = offline *authoring* + outbox + LWW
   server-authoritative ; pas de collab temps réel ; architecture ouverte (PowerSync/Electric plus
   tard) ; **tests offline E2E** rigoureux.
3. **Fiabilité & confidentialité IA** → IA **assistive only** (flags/suggestions), human-in-the-loop ;
   **checks déterministes** (parsing dates) préférés au LLM ; **Vertex AI (no-train)** + contexte
   minimal + redaction PII ; abstraction provider ; audit log complet.

## 9. Definition of Done

- **Fonctionnel :** 3 flux cœur vérifiés **E2E**, **online et offline** (smoke offline OK).
- **Tests :** Vitest (unit) + intégration + **Playwright (E2E, incl. offline)** + tests **RLS/isolation tenant**.
- **Sécurité :** RLS prouvée, URLs signées, audit log, `npm audit`/secret-scan verts, validation d'entrée.
- **Perf (budgets) :** app-shell **TTI < 2,5 s** ; transitions **< 200 ms** (local-first) ;
  **compile PDF M1 < ~10 s** ; **1er token traduction < ~2 s** ; **Lighthouse PWA ≥ 90**.
- **Qualité :** TS strict, ESLint/Prettier verts, **a11y WCAG AA** sur les flux cœur.
- **Ops :** CI/CD vert, Sentry branché, backups/PITR actifs.

## 10. Prochaine étape recommandée (action unique)

**Démarrer M0 — Fondations** : scaffold repo (Vite React PWA), projet **Supabase** (Auth +
multi-tenant **RLS**), CI/CD, PWA shell, design system.
→ **En parallèle (toi) :** commencer à formaliser le **contenu réglementaire** (arborescence
CTD Module 1 + roadmap par pays/activité + 1-2 templates « en vigueur ») pour alimenter M2/M3.

---

## Vérification (test de bout en bout)

- **M1 :** créer un produit + uploader un GMP daté → visible, disponible offline (couper le
  réseau, recharger), sync au retour réseau.
- **M2 :** Workspace → doc auto-classé sous le bon nœud M1 ; éditer l'arborescence ; panneau droit = complétude/alertes.
- **M3-M5 :** générer une Cover depuis template → éditer (TipTap) ; traduire un RCP in-place (streaming, terminologie normalisée).
- **M6 :** « Compiler » → PDF M1 signets/numéroté en < ~10 s.
- **M7 :** pièce admin expirée → alerte Dashboard ; feed veille affiché.
- **Transverse :** Playwright (online+offline) vert ; tests RLS (un org ne voit jamais un autre) ; Lighthouse PWA ≥ 90 ; budgets perf tenus.
