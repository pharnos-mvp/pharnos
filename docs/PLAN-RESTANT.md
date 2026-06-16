# PLAN — Travail restant Pharnos : du gate GO-LIVE à l'OS RIM

> **Doc de cadrage consolidé (2026-06-16).** Chaîne documentaire : [PLAN.md](PLAN.md) → [PLAN-V2.md](PLAN-V2.md)
> → [ROADMAP-MVP.md](ROADMAP-MVP.md) → [PLAN-M-N-GOLIVE.md](PLAN-M-N-GOLIVE.md) → **ce document** (tout ce qui reste).
> Exécution dans une discussion dédiée — ici on **cadre et on priorise**, on ne code pas.

## 0. Où on en est
Tout **H → M (+O)** est livré en prod. Recettes CEO #1/#2, logo officiel, **rétention GxP** (#162),
**erreur invitation + CTA upgrade** (#163) livrés. Santé : `npm audit` 0 vuln, **0 lint DB ERROR**,
231 tests + 6 e2e, backups chiffrés + restore drill, uptime + alertes actifs, 0 €.

**Le seul jalon roadmap restant est N (gate GO-LIVE).** Tout le reste est du **backlog post-N**
(améliorations produit / moat) qui **ne bloque pas** l'ouverture aux pilotes payants.

---

## PHASE 1 — Jalon N (GATE GO-LIVE) · priorité absolue · ~2 sessions
Rien ne sort vers des clients payants sans N. Détail dans [PLAN-M-N-GOLIVE.md](PLAN-M-N-GOLIVE.md) §N ; ici la
liste **concrète** issue des advisors Supabase live (2026-06-16) et des décisions de session.

### N1 — Sécurité + Auth · ~1 session
- **Google OAuth one-click** (provider Supabase natif) — réduit la friction + supprime la surface mot de passe.
- **Activer leaked-password protection** (Auth → HaveIBeenPwned) — actuellement OFF.
- **Revoke EXECUTE** des helpers `SECURITY DEFINER` internes (`current_user_*_org_ids`, `is_org_admin`,
  `is_platform_admin`, `handle_new_user`, `rls_auto_enable`) — pas censés être des RPC REST.
- Vérifier `consume_ai_quota`/`record_ai_usage` (→ service-role only si possible).
- **Poser un DSN Sentry** : `lib/sentry.ts` câblé mais inerte sans DSN → obs front (erreurs + Web Vitals) OFF.
- **RLS table-par-table (pgTAP)** : compléter pour les tables récentes (`invitations`, `dossiers.archived_at`,
  rôles, `org_templates` à venir) — négatifs anon/cross-tenant/non-admin = 0.
- Rate-limit Edge IA par user/org ; CSP/headers re-audit ; rotation secrets documentée. (`npm audit` 0, gitleaks vert.)

### N2 — Performance · ~0,5 session
- **Fix `auth_rls_initplan`** sur `profiles`/`pro_settings`/`audit_log` → `(select auth.uid())` (évalué une fois, pas par ligne).
- Budgets re-serrés ; **LCP ≤ 2,5 s (4G), INP < 200 ms** ; Lighthouse perf ≥ 90 / a11y ≥ 95 **en CI**.
- Code-splitting : le chunk `DossierWorkspacePage` (~594 ko) — isoler pdf.js / TipTap.
- e2e offline du parcours complet (montage → compile → correspondance).

### N3 — Scalabilité · ~0,5 session
- Index sur `invitations.invited_by` ; `EXPLAIN` sur les requêtes de sync ; pagination/chunking vérifiés.
- **k6** léger sur les Edge critiques (`regafy-ai`, `translate`, `share`, `admin`, `team`).
- Capacité par palier re-documentée.

### N4 — Gate GO-LIVE · ~0,5 session
- **Checklist chiffrée signée CEO** : restore drill re-confirmé, alertes/uptime actifs, quotas actifs,
  domaines/e-mails OK, **recette 3 pilotes** (dossier réel compilé < 1 j + 1 fil de correspondance + 1 partage utilisé).

**Parallélisable pendant N** : la landing (Phase 2 #4) est un site isolé → 0 risque sur le gate.

---

## PHASE 2 — Backlog post-N (produit / moat) · priorisé
Ordre = valeur × dépendance. Chaque item est une tranche verticale livrable + recettable.

| # | Tranche | Pourquoi | Effort |
|---|---------|----------|--------|
| 1 | **Messages d'erreur actionnables (audit complet)** | Standard *quoi / pourquoi / que faire* + CTA. Priorité aux erreurs d'**offre** (quota IA 429, sièges) = tunnel de conversion. 1er pas livré (#163). | ~0,5-1 session |
| 2 | **Bibliothèque Templates (couche RIM)** | Onglet sidebar : templates en vigueur + lettres ; l'org sauvegarde ses versions réutilisables et les rappelle dans le CTD builder. **= le moat RIM** (≈ content library Veeva). Table `org_templates` offline-first. **Garde-fou : templates réglementaires read-only (zéro hallucination).** | ~1-2 sessions |
| 3 | **Corbeille brouillons + Archive enrichie + doc rétention** | Finition de la rétention GxP (#162) : restore brouillons + purge N j + vue Archive + *Politique de rétention* (argument conformité vendeur). | ~0,5 session |
| 4 | **Landing « Veeva africain »** | Site `landing/` isolé : branding premium (couleur d'accent, typo, mouvement), tour produit, 3 piliers (intelligence réglementaire / offline / conformité), Lighthouse ≥ 95. App reste neutre 2 tons. **Parallélisable avec N.** | ~1-2 sessions |
| 5 | **Pricing finalisé + facturation** | Grille finale (à caler avec 3-5 entretiens pilotes sur le willingness-to-pay ; reprend les tokens Team/Business « à confirmer » de jalon O) ; **mobile money (Wave/Orange Money/MoMo)** + Stripe quand ~5 clients payants. **Zéro dette à différer.** | décision now / implé later |
| 6 | **Correspondance v3 — suivi de soumission (RIM)** | Délais réglementaires par agence + **rappels**, **export PDF du fil**, lettre de réponse générée ; (option) **compte Agence authentifié** + multi-destinataires. Approfondit le moat correspondance (déféré depuis ADR-0003 / jalon H). | ~1-2 sessions |

---

## Décisions verrouillées (rappel)
- **Auth = Supabase Auth + Google OAuth** ; **pas d'Auth0/Clerk** ; **WorkOS / Supabase-SAML réservé au 1er client enterprise** exigeant SSO/SCIM (financé par son contrat).
- **Résidence des données** : DB en eu-west-3 (Paris) — préparer la réponse commerciale (EU = grade GDPR ; régional/self-host pour l'enterprise).
- **App = chrome neutre 2 tons ; landing = premium** (branding ≠ DA de l'app).
- **0 € jusqu'au 1er client payant** ; bascule **Supabase Pro (25 $)** au 1er contrat signé (PITR + anti-pause).

## Séquencement recommandé
1. **N1 → N2 → N3 → N4** (le gate, priorité absolue), **landing en parallèle** (isolée).
2. Post-N : **erreurs actionnables** → **corbeille/rétention** → **bibliothèque Templates** → **correspondance v3 (RIM)** → **pricing/mobile money** au fil des clients.

## Definition of Done du GO-LIVE (gate N, chiffré)
- **Produit** : 3 orgs pilotes — dossier réel compilé < 1 j + 1 fil de correspondance + 1 partage utilisé ; parcours e2e offline vert.
- **Sécurité** : 0 vuln high ; RLS pgTAP par table ; rate-limits IA ; leaked-password ON ; secrets rotation documentée ; backup + restore TESTÉ.
- **Perf** : LCP ≤ 2,5 s (4G), INP < 200 ms, Lighthouse perf ≥ 90 / a11y ≥ 95 en CI ; budget bundle tenu.
- **Scalabilité** : syncs paginées, indexes vérifiés (EXPLAIN + auth_rls_initplan), quotas IA actifs, k6 sur Edge critiques.
- **Opérabilité** : alertes + uptime actifs ; console admin OK ; **checklist GO-LIVE signée CEO**.

## Actions CEO / ops en attente (loose ends — à clôturer avant/pendant N)
- **Backup** : ranger la clé privée age `C:\Users\ASUS\pharnos-backup-age.key` **hors-ligne** (coffre) puis supprimer le fichier — sa perte = backups illisibles.
- **GitHub** : activer Settings → Notifications → Actions (e-mails d'échec) — alerte si backup/uptime tombent.
- **DNS / e-mail (sécurité & délivrabilité)** : durcir **SPF** (`+include:amazonses.com`), **CAA**, **DNSSEC**, **DMARC** (parqué au jalon K).

## Vision / horizon (au-delà du GO-LIVE — à ne pas oublier, arbitrage selon traction)
- **eCTD v4** — backbone XML / livrable ECOWAS (aujourd'hui hooks + PDF compilé seulement).
- **CTD Modules 2-5** (le MVP couvre le Module 1).
- **IDMP complet** (modèle déjà IDMP-ready, ADR-0001) + **règles réglementaires versionnées par pays** (jamais en dur — recoupe la bibliothèque Templates #2).
- **Abstraction LLM** : swap du provider (Claude / EU / self-host) — la couche existe, le swap reste à activer.
- **Sécurité de maturité** : **pentest externe**, WAF applicatif avancé, secret-scanning tiers (ADR-0002 hors-scope MVP) — attendus par les gros clients enterprise.
- **Export DOCX du dossier compilé** (les formulaires exportent déjà en DOCX) ; **KPIs dashboard** (délai moyen de montage, taux d'acceptation) ; **apps natives**.
