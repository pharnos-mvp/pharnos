# ADR-0003 — Correspondance : review publique par token, sans compte reviewer

**Date** : 2026-06-12 · **Statut** : accepté (jalon H) · **Périmètre** : module Correspondance
(envoi du Module 1 compilé à l'agence locale, review Accepter/Suspendre/Rejeter, fil de discussion).

## Contexte

Le correspondant (agence locale de représentation) ne doit PAS avoir besoin d'un compte Pharnos
(brief CEO). Il faut donc une surface publique — la première de l'app — sans affaiblir le modèle
RLS multi-tenant existant, en restant offline-first côté labo et à coût zéro.

## Décisions

1. **Aucune policy RLS anonyme.** L'accès public passe exclusivement par l'Edge Function `share`
   (service-role), qui valide le token AVANT toute lecture/écriture. La RLS reste la barrière
   pour l'API authentifiée ; le service-role n'est utilisé qu'après preuve de possession du token.
2. **Token 256 bits, stocké hashé.** Généré côté client (`crypto.getRandomValues`), porté par
   l'URL `/r/{token}`, stocké uniquement en SHA-256 (index unique → lookup timing-safe par
   construction). Le lien en clair ne vit que chez l'expéditeur (table Dexie locale, jamais
   synchronisée). Fuite de la DB = aucun lien exploitable.
3. **Mot de passe optionnel PBKDF2-HMAC-SHA256 600 000 itérations** (OWASP), sel 16 o, format
   auto-descriptif `pbkdf2$iter$salt$hash`, hashé côté client, vérifié côté Edge uniquement,
   **rate-limité 5 essais/15 min par token** (+ 60 req/10 min par IP) via `share_hit()`
   (SECURITY DEFINER, service-role only). Le mot de passe ne transite JAMAIS par e-mail.
4. **L'état du dossier est DÉRIVÉ, jamais écrit par le serveur.** `correspondences.status` est la
   source de vérité (écrit par l'Edge à la décision) ; l'UI dérive l'état affiché du dossier
   (Draft/En review/Accepté/En suspens/Rejeté) de la dernière correspondance non révoquée
   (`dossierDisplayStatus`, pur et testé). L'Edge ne touche pas `dossiers` → zéro conflit avec la
   sync offline-first (un upsert client ne peut pas écraser une décision, et réciproquement).
5. **Fil append-only (ALCOA).** `correspondence_messages` : INSERT (org, `author='sender'`
   imposé par policy) + SELECT seulement ; le reviewer n'écrit que via l'Edge
   (`author='recipient'`). Pas de policy UPDATE/DELETE : l'historique des échanges et décisions
   est infalsifiable par l'API. Décision RÉVISABLE (suspendu → frais reçus → accepté) : chaque
   décision est un nouveau message, le statut = la dernière.
6. **Temps réel = accélérateur, pull = source de vérité.** Realtime (INSERT sur messages, filtré
   org, RLS) alimente Dexie + toasts ; la sync pull incrémentale paginée garantit la cohérence
   (rattrapage au subscribe et à chaque reconnexion). Aucune dépendance fonctionnelle au websocket.
7. **E-mail best-effort, lien = chemin nominal.** Action `notify` authentifiée (JWT + membership),
   plafonnée 20/h/org, via l'API Resend si `RESEND_API_KEY` est posé. Anti-relais de phishing :
   l'URL fournie doit être d'origine autorisée ET re-hasher vers le `token_hash` de la
   correspondance. Tant que le domaine n'est pas vérifié (jalon J), l'échec d'envoi est visible
   et non bloquant.
8. **Pièces jointes reviewer bornées** : 3 × 4 Mo par message, whitelist (pdf/png/jpg/webp/docx),
   noms assainis, chemins Storage contrôlés par l'Edge, servies en URLs signées 1 h. Le PDF
   compilé est uploadé dans le bucket privé `documents` ({orgId}/shares/{id}/module1.pdf).
9. **Révocation** : `revoked_at` → 410 pour le reviewer ; révoquée sans décision, la
   correspondance ne compte plus dans l'état dérivé ; révoquée après décision, la décision reste.
10. **Zéro dépendance npm ajoutée** (WebCrypto, fetch, PdfViewer existant) ; page publique en
    chunk lazy hors AppGate (budget bundle intact).

## Conséquences

- Surface publique auditable en un point unique (logs JSON corrélés `x-request-id`, sans PII).
- pgTAP prouve : anon = zéro accès ; isolation multi-tenant ; append-only ; `share_hit`
  service-role only ; unicité du `token_hash` (`supabase/tests/correspondences_rls.test.sql`).
- Limite acceptée : l'envoi exige le réseau (upload du PDF) — l'UI l'explique hors-ligne ;
  les réponses du labo, elles, partent offline (outbox).
- Limite acceptée (org-scopée) : un membre authentifié de l'org peut écrire directement dans
  Storage sous `{org}/shares/...` (policy bucket existante) en contournant les bornes Edge des
  pièces reviewer — impact limité à sa propre org, les lignes de messages restent RLS-contrôlées.
  Le PDF compilé, lui, est write-once (`upsert: false`).
- Post-MVP : délais réglementaires par agence + rappels (reporté), compte « Agence » authentifié,
  multi-destinataires.
