# ADR 0002 — Revue de sécurité du MVP (posture & contrat Edge Functions)

- **Statut :** Accepté
- **Date :** 2026-06-09
- **Contexte :** Revue de sécurité formelle avant d'ouvrir la couche IA (Lot B, Edge Functions).
  Objectif : acter la posture réelle (vérifiée dans le code), combler les écarts, et fixer le
  **contrat de sécurité** que devront respecter les futures Edge Functions `regafy-ai`/`translate`.

## Décision — posture de sécurité (vérifiée)

| Pilier | État (preuve dans le code) |
|---|---|
| **Isolation multi-tenant** | **RLS activée sur toutes les tables** org-scoped via `current_user_org_ids()` (SECURITY DEFINER) : `orgs`, `memberships`, `profiles`, `products`, `documents`, `dossiers`, `generated_docs`, `pro_settings`, `dossier_attachments`, `audit_log`. Migrations `0001`→`0013`. |
| **Preuve continue** | Suite **pgTAP** `supabase/tests/rls_isolation.test.sql` exécutée en CI (`supabase test db`). Étendue à **14 assertions** : isolation produits/documents/**dossiers/docs générés/pièces jointes/audit**, signature **owner-only**, et **anti-spoof** d'audit. |
| **Signature (artefact légal)** | **Owner-only** (`pro_settings` kind `userSignature`) — un membre de l'org ne voit pas la signature d'un autre. Branding (`orgBranding`) partagé par l'org. |
| **Audit ALCOA++** | `audit_log` **append-only** (policies select+insert uniquement, pas d'update/delete) ; l'INSERT vérifie `actor_id = auth.uid()` (**non-répudiation**, migration `0009`). |
| **Storage** | Fichiers (documents + pièces jointes de nœud) servis via **URLs signées 5 min** (`createSignedUrl(path, 300)`) — **aucun bucket public**. |
| **Secrets** | Côté client : **uniquement** `VITE_SUPABASE_URL` + anon key (`.env.local` gitignoré) ; DSN Sentry = clé publique. **Jamais** dans le repo/chat : `service_role`, clés Vertex/Gemini → **secrets Supabase / env Edge** exclusivement. `.env` racine (clé Resend) gitignoré. |
| **Dépendances** | `npm audit` = **0 vulnérabilité** ; **garde-fou CI** ajouté (`npm audit --audit-level=high` dans le job `web`). |
| **Observabilité** | Sentry **sans PII** (`sendDefaultPii:false`), pas de session replay, échantillonnage faible, lazy/opt-in. |

## Écarts comblés par cette revue

1. **Couverture pgTAP** élargie aux tables récentes (`dossiers`, `generated_docs`, `dossier_attachments`, `audit_log`) + assertion **anti-spoof** d'audit.
2. **`npm audit` continu en CI** (high+), pour ne pas dépendre d'un audit manuel ponctuel.

## Contrat de sécurité des Edge Functions IA (Lot B — à appliquer dès `regafy-ai`/`translate`)

- **Auth** : vérifier le **JWT Supabase** de l'appelant ; rejeter sans session valide.
- **Validation** : **zod** sur toutes les entrées (taille, types, bornes) ; rejet strict.
- **Multi-tenant** : toute requête DB depuis l'Edge respecte la **RLS** (jamais de `service_role` pour lire des données tenant) ; scoper par `org_id` de l'appelant.
- **Secrets GCP** : `GCP_SA_KEY`/`GCP_PROJECT_ID`/`GCP_LOCATION` **uniquement en env Edge** (secrets Supabase), jamais exposés au client ni journalisés.
- **Rate limiting** : par utilisateur/org (anti-abus + maîtrise des coûts IA).
- **Confidentialité IA** : **Vertex no-train** ; **contexte minimal** + **redaction PII** avant envoi au modèle.
- **Gouvernance** : IA **assistive only** (human-in-the-loop, jamais finale) ; sorties tracées (audit).

## Conséquences

- La posture multi-tenant est **prouvée à chaque run CI** (régression bloquée).
- La couche IA démarre sur un cadre de sécurité explicite (pas d'improvisation par Edge Function).
- Coût nul : pas d'outil de sécu payant ; garde-fous intégrés à la CI existante.

## Hors scope (post-MVP)

SSO/MFA avancé, secret-scanning tiers, pentest externe, WAF applicatif, résidence des données
(souveraineté non prioritaire au MVP — cf. `docs/PLAN.md`).
