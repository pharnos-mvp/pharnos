# ROADMAP — du produit actuel au MVP livrable

> **Doc maître d'exécution** (ancré le 2026-06-12, recette n°7 en prod). Chaîne documentaire :
> [PLAN.md](PLAN.md) (V1, 3 modules — livré) → [PLAN-V2.md](PLAN-V2.md) (durcissement + recettes
> n°1-7 — livré, **en prod**) → **ce document** (jalons H→M jusqu'au GO-LIVE).
> Suivi d'état : [BOARD.md](BOARD.md).

## 1. Objectif & métrique de succès

- **Objectif** : transformer le produit en prod en **MVP commercialisable** — ultra performant,
  rapide, sécurisé, hautement scalable, **offline-first** — couvrant tout le cycle RA :
  montage CTD M1 → compilation → **correspondance avec l'autorité** → **partage du dossier**,
  sous marque propre (domaine, landing, offres), bilingue FR/EN, administrable et surveillé.
- **Succès (GO-LIVE)** : ≥ 3 organisations pilotes montent ET compilent un dossier réel en
  < 1 jour, gèrent ≥ 1 fil de correspondance réel, le tout 100 % fonctionnel hors-ligne ;
  gate M validé (perf/sécurité/scalabilité chiffrées, §7) ; coût d'infra : **0 €** jusqu'au
  premier client payant (bascule Supabase Pro 25 $/mois aux seuils définis §6).

## 2. Principes verrouillés (inchangés depuis V1)

Stack : Vite + React 19 + TS strict + Tailwind 4 + Dexie (offline-first) + Supabase
(Postgres/RLS, Auth, Storage, Edge Deno) + Vertex Gemini + Cloudflare Pages. Gratuit/managé
d'abord ; le client porte le travail ; IA uniquement À LA DEMANDE ; `main` = prod, features
en branches PR (CI 6 jobs, e2e/lighthouse/rls sur PR uniquement) ; recette CEO en prod après
chaque jalon ; zéro hallucination sur les contenus réglementaires (déterminisme par
construction partout où l'autorité fait foi).

## 3. Jalons (tranches verticales, chacune livrable et recettable)

### H — Module Correspondance & Partage du dossier CTD *(🚧 code complet en PR — recette restante)*
> **Cadrage H0 livré par le brief produit CEO (2026-06-12)** : flux **Labo → Agence locale de
> représentation** (et non l'autorité en direct), review **sans compte Pharnos**, 5 états de
> dossier. Plan d'exécution : [PLAN-H-CORRESPONDANCE.md](PLAN-H-CORRESPONDANCE.md) · décisions :
> [ADR-0003](adr/0003-correspondance-partage-public.md). Livré en branche `feat/correspondance` :

- **H1 · Envoi + review publique + décision** ✅ code : envoi du Module 1 compilé (e-mail
  destinataire, note, mot de passe optionnel) → lien `/r/{token}` (token 256 bits hashé SHA-256) ;
  page publique brandée (prévisualiser, télécharger, **Accepter / Suspendre / Rejeter** +
  commentaire + pièces 3 × 4 Mo) via Edge `share` service-role rate-limitée ; états home
  (Draft / En review / Accepté / En suspens / Rejeté) **dérivés** de la dernière correspondance.
- **H2 · Fil chat + temps réel** ✅ code : panneau Correspondance du dossier (fil append-only,
  réponses labo offline via outbox), Supabase Realtime (toasts + Dexie) avec pull incrémental
  paginé en source de vérité ; décision révisable (chaque décision tracée au fil).
- **H3 · E-mail + révocation + preuves** ✅ code : notification Resend best-effort (anti-phishing :
  l'URL doit re-hasher vers le token_hash), révocation (410), pgTAP RLS (anon = zéro accès,
  append-only, share_hit service-role), e2e Playwright, audit log.
- **Reste à faire** : CI verte sur la PR → **feu vert CEO** : `supabase db push` (0017) +
  `supabase functions deploy share --no-verify-jwt` + secrets `RESEND_API_KEY`/`EMAIL_FROM` →
  merge (deploy Pages auto) → **recette navigateur réel en prod** (fil complet aller-retour).
- **Reporté post-MVP** (décision de recadrage) : délais réglementaires par agence + rappels,
  lettre de réponse générée pour le fil, export PDF du fil, lecture seule par rôle org.

### I — Ops & filets de production *(1 session — AVANT d'ouvrir aux pilotes)*
- **Backup hebdo automatisé** `pg_dump` chiffré (age) → Cloudflare R2 (10 Go gratuits) —
  secret `SUPABASE_DB_URL` à poser (CEO).
- **Restore drill documenté et TESTÉ** (un backup qu'on n'a jamais restauré n'existe pas).
- Alertes seuils (cron : taille DB/Storage > 70 %, erreurs Edge) → e-mail.
- Uptime check externe gratuit sur pharnos.pages.dev + Edge health.

### J — Branding, landing, domaine, offres *(2 sessions)*
- Landing page (statique, même infra Cloudflare, Lighthouse ≥ 95) : proposition de valeur RA,
  captures produit, CTA inscription pilote.
- **Domaine custom** (achat CEO, ~12 $/an — seule dépense) : DNS Cloudflare, app sur
  `app.<domaine>`, landing sur la racine, e-mails Resend sur le domaine (SPF/DKIM).
- Offres/pricing affichés (Pilote gratuit · Pro · Entreprise — facturation HORS scope MVP :
  contact commercial), branding in-app finalisé (logo, favicon, e-mails transactionnels).

### K — i18n EN/FR complet *(1,5 session)*
- Extraction des chaînes UI → dictionnaires FR/EN (socle T11 à généraliser), bascule de
  langue persistée, e-mails bilingues. Les TEMPLATES réglementaires restent pilotés par la
  langue officielle du pays cible (déjà le cas — politique Regafy inchangée).

### L — Dashboard admin & quotas *(2 sessions)*
- Console d'administration (rôle admin Pharnos) : organisations, utilisateurs, usage
  (dossiers, storage, appels IA), désactivation de compte.
- **Quotas IA par organisation** (compteur Edge + plafond par offre) — verrou anti-dérive
  du SEUL coût variable (Gemini), prérequis à l'ouverture au-delà des pilotes connus.
- Invitations d'équipe propres (e-mail Resend) + rôles (admin org / éditeur / lecteur).

### M — Durcissement final & gate GO-LIVE *(2 sessions)*
- Sécurité : revue RLS table par table (pgTAP complétés), rate-limits Edge IA par
  user/org, rotation des secrets documentée, en-têtes/CSP re-audités, npm audit 0 high.
- Performance : budgets re-serrés (entry gzip, LCP ≤ 2,5 s sur 4G, INP < 200 ms,
  Lighthouse perf ≥ 90 / a11y ≥ 95 EN CI), audit code-splitting, e2e offline du parcours
  complet (montage → compile → correspondance).
- Scalabilité : EXPLAIN sur les requêtes de sync (indexes), pagination/chunking partout,
  test de charge léger (k6) sur les Edge critiques, capacité par palier re-documentée.
- **Checklist GO-LIVE** signée CEO : restore drill ok, alertes actives, quotas actifs,
  domaines/e-mails ok, recette pilote complète.

## 4. Non-goals du MVP (inchangés sauf promotion de la correspondance)

CTD Modules 2-5 ; livrable eCTD v4 (hooks seulement) ; soumission électronique directe aux
agences ; collaboration temps réel (CRDT) ; facturation automatisée (Stripe → post-MVP, les
offres sont contractées à la main) ; apps natives ; SSO/MFA entreprise ; licence MedDRA.

## 5. Ordre, durée, dépendances

**H → I → J → K → L → M** (~12-13 sessions ≈ 4-6 semaines au rythme actuel).
I avant l'entrée des pilotes réels (données réglementaires ⇒ backups testés d'abord).
J/K permutables selon l'agenda commercial du CEO. L bloque l'ouverture à des orgs non
accompagnées. M est un GATE : rien ne sort du pilote sans lui.

## 6. Coûts (posture validée CEO : 0 € jusqu'à X clients)

| Palier | Quand | Coût/mois | Capacité propre |
|---|---|---|---|
| **Pilote (actuel)** | maintenant | **0 €** (+ Gemini à l'usage, plafonné par L) | ~150 dossiers · ~30-50 users · 5-15 orgs |
| **Pro** | 1er contrat signé OU Storage > 70 % OU exigence PITR/SLA | 25 $ Supabase (+ ~12 $/an domaine) | ~10 000 dossiers · milliers d'users |
| **Scale** | > ~50 orgs actives | à l'usage (Supabase compute + R2 + Gemini) | horizontal — architecture inchangée |

## 7. Definition of Done du MVP (gate M, chiffré)

1. **Produit** : 3 orgs pilotes — dossier réel compilé < 1 j + 1 fil de correspondance réel +
   1 partage externe utilisé ; 100 % du parcours en e2e offline vert.
2. **Performance** : LCP ≤ 2,5 s (4G), INP < 200 ms, Lighthouse perf ≥ 90 / a11y ≥ 95 en CI,
   budget bundle entry tenu.
3. **Sécurité** : 0 vuln high/critical ; RLS pgTAP par table ; rate-limits IA ; CSP enforce ;
   gitleaks historique vert ; **backup hebdo chiffré + restore TESTÉ** ; secrets rotation doc.
4. **Scalabilité** : syncs paginées, indexes vérifiés (EXPLAIN), quotas IA actifs par org,
   capacité par palier documentée et mesurée (k6 sur Edge critiques).
5. **Opérabilité** : alertes seuils + uptime actifs ; console admin fonctionnelle ;
   checklist GO-LIVE signée.

## 8. Risques & mitigations (top 3)

1. **Spec correspondance floue** → H0 cadrage sur mockups CEO AVANT toute ligne de code
   (pattern éprouvé des recettes : le CEO fournit l'HTML, on l'applique à la règle).
2. **Dérive du coût Gemini à l'ouverture** → quotas par org (L) AVANT d'ouvrir au-delà des
   pilotes connus ; analyse uniquement à la demande (déjà en place).
3. **Perte de données réglementaires sur palier Free (pas de PITR)** → I en tête de file :
   backups chiffrés hebdo + restore drill ; bascule Pro contractuelle dès le 1er client.

## 9. Prochaine étape recommandée (action unique)

**Déployer le jalon H** : CI verte sur la PR `feat/correspondance`, puis feu vert CEO pour
`supabase db push` (migration 0017) + `supabase functions deploy share --no-verify-jwt` +
secrets Edge (`RESEND_API_KEY`, `EMAIL_FROM`), merge (deploy Pages auto) et **recette
navigateur réel en prod** (envoi → review publique → décision → réponse). Ensuite : **jalon I**
(backups chiffrés + restore drill) avant l'entrée des pilotes.
