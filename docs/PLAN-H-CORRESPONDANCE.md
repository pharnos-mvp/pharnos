# PLAN — Jalon H · Module Correspondance & Partage du dossier CTD

> Doc de chantier du jalon **H** de [ROADMAP-MVP.md](ROADMAP-MVP.md). Cadrage (H0) figé sur le
> brief produit CEO du 2026-06-12 : flux **Labo → Agence locale de représentation**, page de
> review publique sans compte, 5 états de dossier sur la home du CTD Workspace.
> Chaîne documentaire : [PLAN.md](PLAN.md) (V1) → [PLAN-V2.md](PLAN-V2.md) → ce doc. Suivi : [BOARD.md](BOARD.md).

## 1. Objectif & métrique de succès

- **Objectif** : une fois le Module 1 compilé, le labo l'envoie (note optionnelle, mot de passe
  optionnel) à son correspondant par e-mail/lien ; le correspondant **review sans compte** sur une
  page brandée Pharnos (prévisualiser, télécharger, Accepter / Suspendre / Rejeter, commenter avec
  pièces jointes) ; le labo reçoit la review en quasi temps réel et répond comme sur un chat
  professionnel ; la home Workspace regroupe les dossiers par état
  (Draft / En review / Accepté / En suspens / Rejeté).
- **Succès** : fil complet envoi → review → décision → réponse **fonctionnel en prod** (recette
  navigateur réel), states visibles sur la home, gate GO-LIVE « ≥ 1 fil réel par org pilote ».

## 2. Périmètre (tranches verticales)

1. **H1 — Envoi, page publique, décision** : l'utilisateur compile → « Envoyer le dossier »
   (e-mail destinataire, note, mot de passe optionnel) → lien `/r/{token}` ; le destinataire
   ouvre, prévisualise/télécharge le PDF, décide (Accepter/Suspendre/Rejeter) avec commentaire
   et pièces jointes ; le statut du dossier suit la décision ; home groupée par états.
2. **H2 — Fil de discussion & temps réel** : panneau Correspondance du dossier (fil chronologique
   type chat), réponses du labo (offline-first via outbox), Supabase Realtime (toast + mise à
   jour instantanée), le destinataire répond aussi depuis sa page.
3. **H3 — E-mail, révocation, durcissement** : notification e-mail Resend (best-effort),
   révocation / régénération du lien, journal d'audit, tests RLS pgTAP + e2e Playwright,
   déploiement prod + recette.

## 3. Non-goals (ce jalon)

Compte « Agence » authentifié (la page publique suffit au MVP) ; multi-destinataires / transfert ;
délais réglementaires par agence et rappels automatiques (poussé post-MVP) ; édition/suppression
de messages (append-only ALCOA) ; eCTD v4 (PDF compilé uniquement) ; i18n EN de la page publique
(FR d'abord, jalon K généralisera).

## 4. Architecture & modèle de données

### 4.1 Décisions (ADR-0003 à venir dans docs/adr)

- **Accès public = Edge Function `share` (service-role), zéro policy RLS anonyme.** Le token de
  partage fait foi ; toute lecture/écriture du reviewer passe par l'Edge qui valide
  token (+ mot de passe) puis agit en service-role. RLS reste hermétique aux anonymes.
- **Token 256 bits** généré côté client (`crypto.getRandomValues`, base64url), stocké **hashé
  SHA-256** (lookup par index unique = comparaison timing-safe). Le lien en clair n'est conservé
  que localement chez l'expéditeur (table Dexie non synchronisée) pour ré-affichage/copie.
- **Mot de passe optionnel : PBKDF2-SHA256 210 000 itérations + sel 16 o** (WebCrypto, zéro
  dépendance), hashé côté client à la création, vérifié côté Edge à l'ouverture, **rate-limité**.
- **Temps réel : le pull incrémental (pattern sync existant) est la source de vérité ;
  Supabase Realtime (INSERT sur messages, filtré org) est un accélérateur UX** — aucune
  dépendance fonctionnelle au websocket (offline-first préservé).
- **E-mail : best-effort via API Resend** (clé déjà utilisée par l'Auth SMTP) depuis l'Edge,
  action réservée au JWT de l'expéditeur, rate-limitée org. **Le lien copiable est le chemin
  nominal** tant que le domaine n'est pas vérifié (jalon J). Le mot de passe ne transite JAMAIS
  par e-mail (canal séparé, à la charge de l'expéditeur).
- **PDF compilé uploadé dans le bucket privé `documents`** sous
  `{orgId}/shares/{correspondenceId}/module1.pdf` ; le reviewer y accède par **URL signée TTL 1 h**
  régénérée à chaque ouverture validée.
- **Statut du dossier DÉRIVÉ, jamais stocké** (décision affinée à l'exécution, ADR-0003 §4) :
  `correspondences.status` est la seule source (écrite par l'Edge) ; l'UI dérive l'état affiché
  (Draft/En review/Accepté/En suspens/Rejeté) de la dernière correspondance non révoquée
  (`dossierDisplayStatus`). Ni l'Edge ni le client ne réécrivent `dossiers.status` → zéro
  conflit avec la sync offline-first. Renvoi possible : nouvelle correspondance, la plus
  récente fait foi.
- **Pièces jointes reviewer bornées** : max 3 par message, 5 Mo chacune, types whitelist
  (pdf/png/jpg/webp/docx), noms assainis, chemins contrôlés par l'Edge uniquement.
- **Zéro nouvelle dépendance npm.**

### 4.2 Tables (migration `0017_correspondences.sql`)

```text
correspondences
  id uuid PK · org_id → orgs (RLS org) · dossier_id · product_name/country/activity (dénormalisés)
  sender_email · recipient_email · note · pdf_path · pdf_size
  token_hash (unique) · password_hash (null = lien libre)
  status in_review|accepted|suspended|rejected · decided_at · revoked_at
  created_at · updated_at · deleted_at
  RLS : membres de l'org (pattern current_user_org_ids) ; reviewer = service-role via Edge only.

correspondence_messages  (append-only)
  id uuid PK · org_id · correspondence_id · author sender|recipient · author_label
  kind note|decision|comment · decision (si kind=decision) · body · attachments jsonb [{path,name,size,mime}]
  created_at
  RLS : org SELECT + INSERT(author=sender) ; pas d'UPDATE/DELETE (grants explicites) ;
  publication Realtime activée.

share_hits  (anti-abus, service-role only)
  compteur par (token_hash, ip, fenêtre) — 5 essais mdp/15 min, 30 req/10 min par IP.
```

Miroir Dexie v9 : `correspondences`, `correspondenceMessages`, `shareLinks` (local-only : lien en
clair de l'expéditeur). Sync : push outbox (messages du labo) + pull incrémental paginé par
`updated_at`/`created_at` (pattern `dossier-sync.ts`).

### 4.3 Edge Function `share` (verify_jwt = false)

| Action | Auth | Effet |
|---|---|---|
| `open` | token (+ mdp) | métadonnées + fil + URL signée PDF 1 h |
| `decide` | token (+ mdp) | message `decision` + maj statut correspondance **et** dossier |
| `reply` | token (+ mdp) | message `comment` du reviewer (+ pièces base64 bornées) |
| `notify` | **JWT org** | e-mail Resend au destinataire (best-effort, rate-limit org) |

Garde-fous : CORS allowlist existante, rate-limit token+IP (table `share_hits`), validation
stricte des entrées, logs JSON sans PII (`_shared/log.ts`), `x-request-id`, 410 si révoqué.

### 4.4 Front

- **`/r/:token`** : page publique brandée Pharnos, **hors AppGate** (aucune auth/org/sync),
  chunk lazy séparé (budget entry intact). Écrans : mot de passe (si requis) → review
  (en-tête produit/pays/activité/expéditeur, note, visionneuse PDF, Télécharger,
  Accepter/Suspendre/Rejeter + commentaire + pièces) → fil de discussion (réponses).
- **Workspace dossier** : panneau « Correspondance » (fil chat, réponse, renvoi, révocation).
- **Home Workspace** : regroupement/filtres par les 5 états + badges colorés + compteurs.
- **Envoi** : dialog post-compilation (réutilise le PDF en mémoire) — e-mail, note, mdp optionnel ;
  online-only (l'upload l'exige), désactivé hors-ligne avec explication.

## 5. Risques & mitigations (top 3)

1. **Surface publique (brute-force, abus storage, scraping)** → token 256 b hashé, PBKDF2
   rate-limité, uploads bornés/whitelist, révocation + régénération, 0 RLS anon, logs corrélés.
2. **Realtime indisponible/quota** → pull sync incrémental suffit fonctionnellement ;
   Realtime est un bonus UX silencieusement dégradable.
3. **E-mail non délivrable (domaine Resend non vérifié avant jalon J)** → lien copiable =
   artefact principal ; échec d'envoi visible et non bloquant ; bascule automatique en J.

## 6. Definition of Done

- CI verte (lint, types, unit, build, e2e, lighthouse) ; budgets bundle/LCP intacts.
- Tests : unit (helpers token/hash, repos, actions Edge), **pgTAP RLS** sur les 2 tables
  (anon = zéro accès), **e2e Playwright** envoi → open → décision → état home.
- Sécurité : secrets en env uniquement ; mdp/token jamais en clair en DB ni dans les logs ;
  npm audit inchangé (0 dep ajoutée).
- Déployé en prod (migrations + Edge + Pages) + **recette navigateur réel** du fil complet.
- Docs : ADR-0003, BOARD.md, ROADMAP-MVP.md (H recalé sur le brief CEO).

## 7. Découpage d'exécution

| # | Slice | Contenu | Est. |
|---|---|---|---|
| H1a | Socle données | migration 0017 + RLS + grants + realtime publication + Dexie v9 + repos + tests | 0,5 s. |
| H1b | Envoi | upload PDF compilé + ShareDialog (token/mdp/note) + statut in_review + lien local | 0,5 s. |
| H1c | Page publique + Edge | `share` open/decide/reply + rate-limit + `/r/:token` complet | 1 s. |
| H1d | Home par états | groupes/filtres + badges + compteurs | 0,25 s. |
| H2 | Fil & temps réel | panneau Correspondance + réponses outbox + Realtime + toasts | 0,75 s. |
| H3 | Finitions | notify Resend + révocation/régén. + audit log + pgTAP + e2e + déploiement + recette | 1 s. |
