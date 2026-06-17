# Runbook — Rotation des secrets (Pharnos)

> **N1-d (gate GO-LIVE).** Inventaire des secrets, où ils vivent, comment les tourner, et à quelle
> cadence. Principe : **séparer les clés PUBLIQUES (non sensibles, bakées dans le bundle) des vrais
> SECRETS** (jamais côté client, jamais committés — vérifié en CI par `gitleaks`).

## 1. Clés PUBLIQUES (non secrètes — exposées par conception)
Bakées dans le bundle front au build ; les exposer ne crée **aucun** risque (elles n'autorisent que
ce que la RLS / les règles permettent). À tourner seulement si l'infra sous-jacente change.

| Clé | Où | Note |
|---|---|---|
| `VITE_SUPABASE_URL` | secret repo (commodité) | URL projet, publique |
| `VITE_SUPABASE_ANON_KEY` | secret repo | clé **anon** : tout passe par la **RLS** ; inoffensive seule |
| `VITE_SENTRY_DSN` | secret repo | DSN Sentry : **autorise l'ENVOI** d'events, pas la lecture |
| `AGE_RECIPIENT` | variable repo | clé **publique** age (chiffre les backups) — la privée reste offline |

## 2. Vrais SECRETS (sensibles — à tourner périodiquement / sur incident)

| Secret | Où | Donne accès à | Rotation |
|---|---|---|---|
| **Supabase `service_role`** | secret Edge Supabase + secret repo `SUPABASE_SERVICE_ROLE_KEY` (storage-backup) | **bypass RLS total** (god-mode données) | Supabase → Settings → API → *Roll* la clé `service_role` → re-poser dans les Edge (`supabase secrets set`) + `gh secret set SUPABASE_SERVICE_ROLE_KEY` |
| **`SUPABASE_DB_PASSWORD`** | secret repo (backup/alertes) | connexion Postgres directe (pooler) | Supabase → Database → *Reset password* → `gh secret set SUPABASE_DB_PASSWORD` (sans risque app : l'app se connecte par clés API) |
| **`CLOUDFLARE_API_TOKEN`** | secret repo (deploy) | déployer sur Pages, gérer les domaines | Cloudflare → My Profile → API Tokens → *Roll* → `gh secret set CLOUDFLARE_API_TOKEN` |
| **`RESEND_API_KEY`** | secret Edge Supabase | envoyer des e-mails au nom de pharnos.com | Resend → API Keys → révoquer + recréer → `supabase secrets set RESEND_API_KEY` |
| **Service account Vertex/Gemini** | secret Edge Supabase | appeler Vertex AI (coût IA) | Google Cloud → IAM → Service Accounts → créer une **nouvelle clé**, re-poser en secret Edge, supprimer l'ancienne |
| **Google OAuth — Client Secret** | Supabase → Auth → Providers → Google | flux OAuth « Se connecter avec Google » | Google Cloud → Auth Platform → Clients → *Pharnos Web* → **+ Add secret** → coller dans Supabase → supprimer l'ancien secret |
| **Supabase Management token** (`sbp_…`) | usage ponctuel CLI/API (NE PAS committer) | API de gestion du projet | Supabase → Account → Access Tokens → révoquer après usage ; ne jamais coller en clair durablement |

## 3. Clé privée age (backups)
- **Hors-ligne, détenue par le CEO** (`pharnos-backup-age.key` à ranger en coffre, fichier à supprimer).
- Sa **perte** = backups illisibles ; sa **fuite** = backups déchiffrables. Ne JAMAIS la mettre en CI.
- Rotation = générer une nouvelle paire age, re-poser `AGE_RECIPIENT` (publique), re-chiffrer/relancer les backups ; conserver l'ancienne privée tant que d'anciens backups chiffrés avec elle sont dans la fenêtre de rétention.

## 4. Cadence & déclencheurs
- **Périodique** : `service_role`, `CLOUDFLARE_API_TOKEN`, `RESEND_API_KEY`, SA Vertex → **tous les 6–12 mois**.
- **Sur incident** (fuite suspectée, départ d'un accès, machine compromise) : rotation **immédiate** du/des secret(s) concerné(s) + revue `audit_log` + `share_access_log`.
- **À chaque usage ponctuel** d'un token de gestion (Supabase `sbp_…`, jeton wrangler) → **révoquer juste après**.
- **CI** : `gitleaks` scanne tout l'historique à chaque PR ; `npm audit --audit-level=high` bloque les vulnérabilités. Une rotation ne dispense pas de ces garde-fous.

## 5. Après TOUTE rotation
1. Re-déployer ce qui consomme le secret (Edge : `supabase functions deploy …` ; front : push/`workflow_dispatch` Deploy).
2. **Smoke test** le chemin concerné (login Google, envoi e-mail, appel IA, backup) — un secret mal re-posé casse silencieusement.
3. Confirmer qu'aucune valeur n'a fuité dans les logs (les workflows masquent déjà ; vérifier).
