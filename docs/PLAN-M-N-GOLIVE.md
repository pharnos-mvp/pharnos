# Jalon M (Pharnos Admin) & N (gate GO-LIVE) — plan d'exécution CTO

> **Dernière ligne droite avant GO-LIVE.** Chaîne documentaire : [PLAN.md](PLAN.md) (V1, stable) →
> [PLAN-V2.md](PLAN-V2.md) (durcissement) → [ROADMAP-MVP.md](ROADMAP-MVP.md) (cap H→N) → **ce document**.
> Suivi d'état vivant : [BOARD.md](BOARD.md).
>
> **Pré-requis : DONE.** H, I, J, K, L **livrés en prod**. Il ne reste que **M** puis **N** (le GATE).
>
> **Cadrage CEO (2026-06-15)** : Jalon M = **console d'administration Pharnos** « digne du Veeva
> africain » — voir en un coup d'œil **la santé et l'évolution de Pharnos**. Construction **en pleine
> autonomie CTO**, accès complets (GitHub, Supabase, Cloudflare, Vertex, Resend). **Smoke test après
> chaque sous-jalon** (CLI + MCP + Chrome), **suite de tests complète** en fin de jalon.

---

## 1. Objectif & métrique de succès

- **Objectif** — doter Pharnos d'un **poste de pilotage plateforme** : un admin Pharnos gère les
  **utilisateurs**, les **plans** (free/pro/business/enterprise) et les **quotas** (nb de dossiers,
  **tokens IA**, **features**), et lit d'un coup d'œil la **santé de l'app**, la **growth**
  (consommation, ressources) et le **monitoring** — le tout en bornant le **seul coût variable**
  (tokens Gemini) côté serveur.
- **Succès (« shippé »)** — en prod : (a) un org **ne peut pas** dépasser son quota de tokens IA ni
  son plafond de dossiers (coût/ressources bornés, messages propres FR/EN) ; (b) l'admin Pharnos
  **voit** orgs/users/usage/santé/growth et **agit** (changer un plan, ajuster un quota, (dés)activer
  un compte) ; (c) tous les chiffres sont **déterministes** (dérivés des données réelles, zéro IA,
  zéro mock) ; (d) **smoke vert** (CLI+MCP+Chrome) à chaque tranche, suite complète verte en fin.

## 2. Scope (tranche verticale qui crée de la valeur d'abord)

Du socle au tableau de bord : **M1 socle plateforme & verrou quotas** (data + sécurité + capture
tokens Vertex + enforcement) → **M2 Edge `admin`** (agrégats + actions, service-role gated) →
**M3 Admin dashboard UI** (Santé · Growth · Monitoring · Organisations · Users · Plans & Quotas) →
**M4 invitations & rôles** (onboarding équipe). Chaque tranche **indépendamment livrable, smoke-testée**.

## 3. Non-goals (pas maintenant)

Facturation/paiement automatisé (Stripe → post-MVP ; le changement de plan est une **action admin**,
pas un self-service payant) ; SSO/MFA entreprise ; alerting externe nouveau (on **réutilise** uptime +
alertes seuils du jalon I) ; APM tiers (Datadog…) — monitoring = signaux **déterministes** déjà
queryables (taille DB/Storage, compteurs, erreurs Edge loggées, feed d'audit) ; quotas IA « temps
réel à la milliseconde » (fenêtre = **mois calendaire**, check-before + record-after).

## 4. Architecture & décisions (ancrées sur le code réel)

> Principe inchangé : **tout passe par RLS/Edge**, **jamais** d'accès cross-tenant côté client ;
> additif et réversible ; FR/EN sur toute nouvelle UI (jalon L) ; DA Pharnos ; **zéro mock**.

### Existant réutilisé (vérifié dans le dépôt)
- **Rôles d'org** : enum `org_role = ('admin','ra_officer','reviewer')` + `memberships` (`0001`).
  Réutilisé, mapping UI **Admin / Éditeur / Lecteur**.
- **Rate-limit** : seul `create_org` borné (`0015`). **Aucun compteur d'usage IA** → à construire.
- **Edge IA** : `regafy-ai`, `translate`, `upgrade` → Vertex via `_shared/vertex.ts`. Le code **jette**
  aujourd'hui `usageMetadata` → on l'**expose** (additif) pour compter les **tokens** réels.
- **E-mail** : Resend branché (domaine `pharnos.com` vérifié) → invitations.
- **Audit** : `audit_log` (`0008`/`0009`) → toute action admin/invite tracée.
- **Ops jalon I** : uptime + alertes seuils (GitHub Actions) → la carte « Santé » les **agrège/lie**.

### M1 — Socle plateforme & verrou quotas · *effort M*
- **Schéma** (migration additive `0019`) :
  - `platform_admins(user_id uuid PK, created_at)` — **seedé avec le compte CEO**.
  - `orgs.plan` enum `plan_tier = ('free','pro','business','enterprise')` default `'free'` ;
    `orgs.disabled_at timestamptz null`.
  - `plan_limits(plan plan_tier PK, max_dossiers int, monthly_ai_tokens bigint, features jsonb)`
    seedé (caps **éditables** depuis la console) ; `org_quota_override(org_id, max_dossiers,
    monthly_ai_tokens, features)` nullable (override par org).
  - `ai_usage(org_id, period_month date, kind text, calls int, input_tokens bigint,
    output_tokens bigint, updated_at)`, **PK `(org_id, period_month, kind)`**.
- **Capture tokens** : `vertex.ts` renvoie `{ text, usage:{ in, out } }` (lecture de
  `usageMetadata.promptTokenCount` / `candidatesTokenCount`) — **additif**, signatures compatibles.
- **RPCs SECURITY DEFINER** :
  - `is_platform_admin() returns boolean`.
  - `consume_ai_quota(p_kind) returns jsonb` : résout l'org via `auth.uid()` (jamais passée par le
    client), résout le cap mensuel de tokens (`override ?? plan_limits`), **refuse si le cumul du mois
    a déjà atteint le cap** (check-before, **fail-closed**), sinon autorise. Renvoie `{allowed,
    remaining, cap}`.
  - `record_ai_usage(p_kind, p_in, p_out)` : **atomique** `insert … on conflict … do update set
    calls+1, input_tokens+=in, output_tokens+=out` (record-after l'appel Vertex).
- **Plafond dossiers** : **trigger BEFORE INSERT** sur `dossiers` (compte org vs cap, lève si dépassé)
  → enforce **quel que soit le chemin client** (RLS-safe).
- **Enforcement IA** : dans les 3 Edge IA, `consume_ai_quota` **avant** Vertex → si `!allowed` →
  **HTTP 429** `{error:'quota_exceeded',…}` (message propre FR/EN) ; `record_ai_usage` **après**.
- **RLS** : `ai_usage`/`plan_limits`/override lisibles par les membres de l'org (vue usage), écriture
  **RPC/admin only**. pgTAP : anon=0, cross-org=0.

### M2 — Edge `admin` (API plateforme) · *effort M*
- **Edge `admin`** (service-role, **gated `is_platform_admin()` sinon 403**) — lecture cross-org
  agrégée **côté serveur uniquement** :
  - `overview` : KPIs plateforme (nb orgs/users/dossiers/produits, octets Storage, **tokens IA du
    mois**, deltas **growth** 30 j) + **santé** (taille DB %, Storage %, erreurs Edge récentes, état
    uptime jalon I).
  - `orgs` : liste + détail par org (plan, quotas, usage, état, membres).
  - `users` : liste (org, rôle, dernière activité).
  - **Actions** : `set_plan`, `set_quota_override`, `set_feature`, `deactivate_org|user`,
    `reactivate_org|user` — **toutes `audit_log`**.
- **Désactivation = effet RLS réel** : les policies d'accès ajoutent `and not exists(disabled)` →
  un org/user désactivé est **coupé**, pas masqué. pgTAP dédié.
- Smoke : `curl`/CLI + Supabase MCP.

### M3 — Admin dashboard UI (`/admin`) · *effort L*
- Route **`/admin` lazy-loaded**, rendue **uniquement si `is_platform_admin`** (sinon 404) — **zéro
  régression de bundle** sur l'app principale (chunk séparé). DA Pharnos, FR/EN, a11y AA, offline-N/A
  (admin = online).
- **Sections** (toutes alimentées par l'Edge `admin`, **chiffres réels**) :
  1. **Santé** — DB/Storage % vs palier Free, uptime, erreurs Edge récentes, dernier backup/restore.
  2. **Growth** — orgs/users/dossiers dans le temps, **consommation tokens IA**, ressources.
  3. **Monitoring** — flux d'erreurs/événements récents + feed `audit_log`.
  4. **Organisations** — table dense : plan, quotas, usage, état + actions (plan, quota, (dés)activer).
  5. **Users** — table : org, rôle, état + actions.
  6. **Plans & Quotas** — éditer caps (dossiers, tokens IA) + **features** par plan, et override par org.
- Smoke : **Chrome MCP** (navigation réelle, login admin, chaque section, une action).

### M4 — Invitations d'équipe & rôles · *effort M*
- `invitations(id, org_id, email citext, role org_role, token_hash, invited_by, expires_at,
  accepted_at)` — token 256 b, **seul le hash SHA-256 stocké**. Edge `invite` (org-admin-gated) +
  e-mail Resend bilingue (`/invite/{token}`). RPC `accept_invitation(token)` SECURITY DEFINER.
- **Rôles effectifs** : Lecteur (`reviewer`) **réellement read-only** via RLS sur
  `products/documents/dossiers/generated_docs` ; gestion membres **admin-only**.
- UI : Compte → onglet **Équipe**. Smoke : Chrome MCP (invite → accept).

### N — Durcissement final & gate GO-LIVE · *effort 2 sessions* (inchangé)
- **N1 Sécurité** : RLS **table par table** (pgTAP incl. les nouvelles tables M + policies `disabled`) ;
  rate-limit Edge IA par user/org ; rotation secrets documentée ; CSP/headers re-audités ; `npm audit`
  0 high ; gitleaks vert.
- **N2 Performance** : budgets re-serrés ; **LCP ≤ 2,5 s (4G), INP < 200 ms** ; Lighthouse **perf ≥ 90 /
  a11y ≥ 95 EN CI** ; code-splitting (`/admin` isolé) ; **e2e offline du parcours complet**.
- **N3 Scalabilité** : EXPLAIN/index sur les syncs ; pagination/chunking ; **k6** sur Edge critiques
  (`regafy-ai`, `translate`, `share`, `admin`) ; capacité par palier re-documentée.
- **N4 Gate** : checklist GO-LIVE **signée CEO** (restore drill, alertes/uptime, **quotas actifs**,
  domaines/e-mails, **recette 3 pilotes**).

## 5. Milestones (ordre, livrables, effort)

| # | Tranche | Contenu | Effort | Smoke |
|---|---------|---------|--------|-------|
| **M1** | **Socle & verrou quotas** ⭐ | migration `0019` (admins, plans, quotas, usage) + capture tokens Vertex + RPCs atomiques + enforcement 429 + trigger dossiers + pgTAP | **M** | Supabase MCP + tests Edge |
| **M2** | **Edge `admin`** | API service-role gated : overview/santé/growth/orgs/users + actions, audit | **M** | curl/CLI + MCP |
| **M3** | **Admin dashboard UI** | `/admin` lazy gated : Santé · Growth · Monitoring · Orgs · Users · Plans & Quotas | **L** | Chrome MCP |
| **M4** | **Invitations & rôles** | invitations + Resend + accept + RLS rôles + UI Équipe | **M** | Chrome MCP |
| **N1** | **Sécurité (gate)** | RLS table-par-table pgTAP + rate-limit IA + secrets/CSP + audits 0 high | **M** | CI |
| **N2** | **Perf (gate)** | budgets + e2e offline complet + code-splitting | **S/M** | CI Lighthouse |
| **N3** | **Scalabilité (gate)** | EXPLAIN/index + k6 Edge critiques + capacité documentée | **S/M** | k6 |
| **N4** | **Gate GO-LIVE** | checklist chiffrée signée CEO + recette 3 pilotes | **S** | recette |

*M ≈ 2-3 sessions (M3 est gros), N ≈ 2 sessions.*

## 6. Risques & mitigations (top 3)

1. **Contournement / course sur le quota tokens** → org résolue **server-side** (`auth.uid()`),
   `consume_ai_quota` **check-before fail-closed**, `record_ai_usage` **atomique** ; trigger dossiers
   côté DB (tous chemins) ; pgTAP + tests Edge du chemin 429.
2. **Fuite cross-tenant via la surface admin** → **jamais** de RLS relâchée : toute lecture cross-org
   passe par l'Edge `admin` **service-role gated `is_platform_admin()`** ; pgTAP prouve
   anon/non-admin = 0 ; actions **audit-loggées** ; (dés)activation = **effet RLS** testé, pas un masquage.
3. **M3 volumineux + dernière ligne droite** → tranches **indépendamment shippables et smoke-testées**
   (M1/M2 livrables sans l'UI) ; **zéro mock** (si une donnée n'est pas queryable, la carte l'indique
   honnêtement plutôt que d'inventer) ; `/admin` en chunk lazy (pas de risque sur l'app principale).

## 7. Definition of Done (barre concrète)

- **Tests** : pgTAP par **nouvelle table** (incl. négatifs anon/cross-tenant/non-admin = 0) ; tests Edge
  (consume/record quota, chemin 429, gating admin 403) ; **Playwright** (quota dépassé ; invite→accept ;
  admin visible admin-only) ; **75 unit + 9 e2e** existants restent verts.
- **Sécurité** : RLS prouvée par table ; Edge `admin` gated allowlist ; quota server-side atomique ;
  rate-limit IA ; `npm audit` 0 high ; gitleaks vert ; CSP enforce.
- **Perf** : Lighthouse **perf ≥ 90 / a11y ≥ 95** en CI ; `/admin` **lazy** (pas de régression bundle) ;
  **LCP ≤ 2,5 s (4G), INP < 200 ms**.
- **Qualité** : TS strict, lint/format verts, **a11y AA** sur les nouveaux écrans, **i18n FR/EN** partout.
- **Smoke (exigence CEO)** : après **chaque** sous-jalon → CLI + MCP + Chrome ; **suite complète** verte
  en fin de jalon.
- **Ops** : alertes + uptime actifs ; quotas actifs ; restore drill re-confirmé.

## 8. Prochaine étape recommandée (action unique — EN COURS)

**Démarrer M1** : migration `0019` (platform_admins, `plan_tier`, `plan_limits`, `org_quota_override`,
`ai_usage`, `disabled_at`) + exposer `usageMetadata` dans `vertex.ts` + RPCs `is_platform_admin` /
`consume_ai_quota` / `record_ai_usage` + trigger plafond dossiers + enforcement 429 dans les 3 Edge IA,
derrière pgTAP + tests Edge. Validé sur **branche Supabase de préview** avant prod, PR dédiée.

### Défauts de quotas proposés (éditables dans la console — n'impactent pas l'archi)
| Plan | max dossiers | tokens IA / mois | features |
|---|---|---|---|
| **free** | 5 | 1 000 000 | core (catalogue, CTD M1, compile, Regafy validité) |
| **pro** | 50 | 10 000 000 | + traduction, correspondance |
| **business** | 200 | 50 000 000 | + tout (audit global, upgrade templates) |
| **enterprise** | illimité | sur mesure | tout + support |
