# Jalon N — Plan d'EXÉCUTION du gate GO-LIVE (CTO)

> **Doc d'exécution (2026-06-16).** Traduit [PLAN-RESTANT.md](PLAN-RESTANT.md) §Phase 1 et
> [PLAN-M-N-GOLIVE.md](PLAN-M-N-GOLIVE.md) §N en **PRs ordonnées, chacune avec ses portes qualité**.
> Chaîne : [PLAN.md](PLAN.md) (vision, **immuable**) → PLAN-V2 → ROADMAP-MVP → PLAN-M-N-GOLIVE → PLAN-RESTANT → **ce doc**.
> Suivi vivant : [BOARD.md](BOARD.md). **Ici on exécute N1→N4** ; le reste est backlog post-N.

## ✅ Avancement (MAJ 2026-06-17 — reprise en nouvelle discussion sur N2-b)
- **N1 (SÉCURITÉ) COMPLET, en prod** : N1-a Google OAuth ([#165](https://github.com/pharnos-mvp/pharnos/pull/165)) · N1-b verrou RPC `0031` ([#166](https://github.com/pharnos-mvp/pharnos/pull/166)) · N1-c pgTAP deny-all ([#167](https://github.com/pharnos-mvp/pharnos/pull/167)) · N1-d Sentry EU + rate-limit IA `0032` + CSP + runbook secrets ([#168](https://github.com/pharnos-mvp/pharnos/pull/168)). Advisor sécurité **sans WARN actionnable** (reste : items deny-all/RPC acceptés-par-conception + leaked-password **Pro-gated**).
- **N2-a (PERF) LIVRÉ** : `auth_rls_initplan` (5 policies → `(select auth.uid())`) + index FK `invitations.invited_by` — migration `0033` ([#169](https://github.com/pharnos-mvp/pharnos/pull/169)) → **advisor perf sans WARN** (restent 6 `unused_index` INFO = conservés, low-traffic).
- **B1 (revue gate-N) CORRIGÉ, en prod** : la revue `/cto:review` a trouvé que `0032` (rate-limit N1-d) avait ré-émis tout le corps de `consume_ai_quota` en **omettant le garde d'offre Regafy** (`feature_disabled`) de `0025` → l'entitlement IA ne reposait plus que sur le cap de tokens (un override de tokens sur un plan sans IA aurait débloqué Gemini payant). **Exposition réelle = 0 fuite active** (free a 0 token), invariant rétabli par migration `0034` ([#170](https://github.com/pharnos-mvp/pharnos/pull/170)) : garde remis **avant** la rafale ; preuve live (free → `feature_disabled`) + 2 pgTAP. Zéro changement front/Edge. **Leçon : un `create or replace` qui ré-émet tout le corps doit être diffé contre son VRAI prédécesseur.**
- **RESTE** : **N2-b** (code-split `DossierWorkspacePage` ~594 ko — **INVASIF, recette navigateur obligatoire** ; e2e offline complet ; seuils Lighthouse perf≥90/a11y≥95 en CI) · **N3** (EXPLAIN/k6 + **D1 stockage** : garde-fous fichier + jauge usage par org — cf. [PLAN-DATA-STORAGE-QUOTA.md](PLAN-DATA-STORAGE-QUOTA.md)) · **N4** (gate signé + recette 3 pilotes + **bascule Supabase Pro** : leaked-password ON + `auth.pharnos.com` pour le branding « Pharnos » sur l'écran Google + quota stockage dur D2).
- **Migrations : dernier appliqué = `0034` (B1) → reprendre à `0035`.** Runbook secrets : [SECRETS-ROTATION.md](SECRETS-ROTATION.md).

## 0. Ancrage sur le RÉEL (advisors live, projet `uhsireqwzqqymgsxuvqh`, eu-west-3, 2026-06-16)

La liste N a été **re-vérifiée contre les advisors Supabase live** — elle correspond. Détail brut :

**Sécurité** — 0 ERROR. WARN/INFO à traiter :
- `rls_enabled_no_policy` (INFO) : `invitations`, `platform_admins`, `platform_admin_emails`, `share_hits`
  → RLS ON **sans policy = deny-all** (sécurisé, écrit via SECURITY DEFINER/service-role). À **prouver par pgTAP** + policy explicite ou commentaire d'intention.
- `anon_security_definer_function_executable` (WARN, 5) : `current_user_org_ids`, `current_user_editable_org_ids`,
  `current_user_submission_org_ids`, `handle_new_user`, `rls_auto_enable` → **REVOKE EXECUTE FROM anon, authenticated**.
- `authenticated_security_definer_function_executable` (WARN, ~16) : **à classer** (voir N1-b).
- `auth_leaked_password_protection` (WARN) : OFF → **ON** (console Auth).
- `extension_in_public` (WARN) : `citext` en `public` → déplacer en `extensions` **si sans risque**, sinon documenter.

**Performance** — WARN/INFO :
- `auth_rls_initplan` (WARN, 5 policies) : `profiles` (×3), `pro_settings` (×1), `audit_log` (×1) → `(select auth.uid())`.
- `unindexed_foreign_keys` (INFO) : `invitations.invited_by_fkey` → index.
- `unused_index` (INFO, 5) : `share_access_log_org_idx`, `generated_docs_dossier_idx`, `dossier_attachments_dossier_idx`,
  `correspondences_dossier_idx`, `dossiers_archived_idx` → **GARDER** (jamais utilisés car trafic pré-lancement ; ils
  couvrent des FK/chemins réels). Documenter « keep — low traffic », **ne pas droper**.

> **Méthode** : chaque PR validée sur **branche Supabase de préview** avant prod, advisors re-checkés après merge.

---

## N1 — Sécurité + Auth · ~1 session · **4 PRs**

### PR N1-a — Google OAuth one-click + leaked-password protection
- **Console (CEO/CTO)** : Google Cloud → OAuth Client (origines + `…/auth/v1/callback`) ; Supabase Auth → activer
  provider Google + **leaked-password protection (HaveIBeenPwned)**.
- **Code** : bouton « Continuer avec Google » dans [LoginPage.tsx](web/src/features/auth/LoginPage.tsx) →
  `signInWithOAuth({ provider:'google', options:{ redirectTo } })`. `detectSessionInUrl` est **déjà actif**
  (utilisé par le reset password) → le callback PKCE est géré. i18n FR/EN, a11y AA. Test LoginPage mis à jour.
- **Gate** : login Google réel (Chrome MCP) ; email/password intact ; advisor leaked-password disparaît.

### PR N1-b — Verrouiller la surface SECURITY DEFINER (migration `0031`)
- **REVOKE EXECUTE** (anon + authenticated) sur les **helpers purement internes** :
  `current_user_org_ids`, `current_user_editable_org_ids`, `current_user_submission_org_ids`, `handle_new_user`,
  `rls_auto_enable` (appelés par policies/triggers en tant que definer → **pas besoin** d'être des RPC REST).
- **Service-role only** : `consume_ai_quota`, `record_ai_usage` → REVOKE FROM authenticated (les 3 Edge IA utilisent
  la service-role). Vérifier que rien côté client ne les appelle.
- **Vérifier le caller puis décider** : `is_org_admin`, `is_platform_admin` (si l'UI en dépend pour gater `/admin`,
  garder — booléen read-only ; sinon revoke).
- **RPC légitimes → AUDIT du garde interne, on GARDE** : `create_org`, `create_org_onboarding`, `choose_plan`,
  `my_org_plan`, `accept_invitation`, `create_invitation`, `team_list`, `team_set_role`, `team_remove_member`,
  `team_revoke_invitation` (confirmer que chacun vérifie l'appartenance/le rôle en interne).
- **Gate** : advisors anon/internal disparaissent ; tests Edge IA verts (quota toujours appliqué) ; aucun appel client cassé.

### PR N1-c — RLS table-par-table (pgTAP) sur les tables récentes
- Couvrir : `invitations`, `platform_admins`, `platform_admin_emails`, `share_hits`, `dossiers.archived_at`,
  enum/rôles (`0027`/`0028`), tables admin/quotas (`ai_usage`, `plan_limits`, `org_quota_override`).
- Pour chaque : **négatifs = 0** (anon, cross-tenant, non-admin) ; policy explicite **ou** commentaire d'intention
  « write via SECURITY DEFINER/service-role only » pour lever `rls_enabled_no_policy`.
- **Gate** : pgTAP vert en CI ; advisor `rls_enabled_no_policy` traité (policy ou intention documentée).

### PR N1-d — Observabilité + rate-limit IA + hygiène secrets
- **Sentry** : poser le **DSN** (secret CI/prod) → erreurs front + Web Vitals ON ([sentry.ts](web/src/lib/sentry.ts)
  est câblé, inerte sans DSN). Vérifier capture réelle (1 erreur test) + 0 PII.
- **Rate-limit Edge IA par user/org** sur `regafy-ai`, `translate`, `upgrade` (en plus du quota tokens) → anti-abus/coût.
- **CSP/headers re-audit** (Cloudflare Pages `_headers`) ; **rotation des secrets documentée** (runbook) ;
  `npm audit` 0 high ; **gitleaks** vert.
- **Gate** : DSN actif (event visible Sentry) ; 429 rate-limit testé ; CSP enforce ; audits verts en CI.

---

## N2 — Performance · ~0,5 session · **2 PRs**

### PR N2-a — `auth_rls_initplan` + index FK (migration `0032`)
- Réécrire les 5 policies : `profiles` (select/insert/update own), `pro_settings_all`, `audit_log_insert` →
  `(select auth.uid())` (évalué une fois, pas par ligne).
- `create index … on invitations(invited_by)` (FK non couverte).
- Commenter les 5 `unused_index` « keep — low traffic pré-lancement ».
- **Gate** : advisors `auth_rls_initplan` + `unindexed_foreign_keys` disparaissent ; pgTAP toujours vert.

### PR N2-b — Code-splitting + budgets CI + e2e offline complet
- Isoler **pdf.js / TipTap** hors du chunk `DossierWorkspacePage` (~594 ko) → import dynamique.
- **Lighthouse en CI** : perf **≥ 90**, a11y **≥ 95** ; **LCP ≤ 2,5 s (4G)**, **INP < 200 ms** ; budget bundle re-serré.
- **e2e offline du parcours complet** : montage dossier → compile PDF → correspondance (Playwright, réseau coupé).
- **Gate** : Lighthouse CI au seuil ; bundle sous budget ; e2e offline vert.

---

## N3 — Scalabilité · ~0,5 session · **1 PR + 1 artefact**
- `EXPLAIN (ANALYZE)` sur les requêtes de **sync** (products/documents/dossiers/generated_docs) → confirmer index ;
  **pagination/chunking** vérifiés sur les listes lourdes.
- **k6** léger sur les Edge critiques : `regafy-ai`, `translate`, `share`, `admin`, `team` (latence p95 + 429 propre).
- **Capacité par palier** (free→Pro) **re-documentée** dans le doc + BOARD.
- **Gate** : rapport k6 archivé ; aucune requête de sync sans index ; capacité documentée.

---

## N4 — Gate GO-LIVE · ~0,5 session · **checklist signée CEO**
- Restore drill **re-confirmé** ; alertes + uptime **actifs** ; **quotas IA actifs** (429 prouvé) ; domaines/e-mails OK.
- **Recette 3 pilotes** : chacun **1 dossier réel compilé < 1 j** + **1 fil de correspondance** + **1 partage utilisé** ;
  parcours **e2e offline vert**.
- **Livrable** : checklist GO-LIVE **chiffrée et signée par le CEO** (la DoD du gate, ci-dessous).

---

## Parallélisable pendant N (zéro risque sur le gate)
- **Landing « Veeva africain »** (Phase 2 #4) — site `landing/` isolé : branding premium, tour produit, 3 piliers,
  Lighthouse ≥ 95. N'impacte pas le gate (déployable indépendamment).

## Actions CEO / ops à clôturer avant/pendant N (non-code)
- **Backup** : ranger la clé privée age `C:\Users\ASUS\pharnos-backup-age.key` **hors-ligne**, puis supprimer le fichier.
- **GitHub** : activer Settings → Notifications → Actions (e-mails d'échec).
- **DNS/e-mail** : durcir **SPF/CAA/DNSSEC/DMARC** (délivrabilité + sécurité).
- **Console Auth** : provider Google + leaked-password (couvert par PR N1-a côté config).

## Definition of Done du GO-LIVE (chiffrée — la barre)
- **Produit** : 3 orgs pilotes — dossier réel compilé < 1 j + 1 correspondance + 1 partage ; e2e offline vert.
- **Sécurité** : 0 vuln high ; RLS pgTAP **par table** ; helpers internes non-exposés ; rate-limit IA ; leaked-password ON ;
  rotation secrets documentée ; backup + **restore TESTÉ**.
- **Perf** : LCP ≤ 2,5 s (4G), INP < 200 ms, Lighthouse perf ≥ 90 / a11y ≥ 95 **en CI** ; budget bundle tenu.
- **Scalabilité** : syncs paginées + indexées (EXPLAIN + `auth_rls_initplan` corrigé) ; quotas IA actifs ; k6 sur Edge critiques.
- **Opérabilité** : alertes + uptime actifs ; console admin OK ; **checklist GO-LIVE signée CEO**.

## Séquencement
**N1-a → N1-b → N1-c → N1-d → N2-a → N2-b → N3 → N4**, **landing en parallèle**.
Chaque PR : branche dédiée, CI verte (typecheck/lint/format/test/build/budget + e2e/lighthouse/rls), advisors re-checkés, smoke (CLI+MCP+Chrome) avant merge.
