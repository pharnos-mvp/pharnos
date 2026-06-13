# Jalon I — Ops & filets de production

> Filet **obligatoire avant l'ouverture aux pilotes** (données réglementaires réelles).
> Cible : backups chiffrés hebdo testés, alertes seuils, uptime. Coût : 0 € (R2 10 Go gratuits).

## 1. Backup DB chiffré → R2 *(workflow `.github/workflows/backup.yml`)*

**Principe.** Chaque lundi (+ manuel), `supabase db dump` (rôles + schéma + données) → archive
`tar.gz` → **chiffrée avec `age`** (clé publique de destinataire) → uploadée sur **Cloudflare R2**
(API S3). Rétention : 8 sauvegardes (~2 mois). Le workflow est **no-op vert** tant que les
secrets ne sont pas posés.

### À fournir (une fois) — CEO + CTO

| Élément | Type | Où l'obtenir | Qui |
|---|---|---|---|
| `SUPABASE_DB_URL` | **secret repo** | Dashboard Supabase → Project Settings → Database → *Connection string* → **URI** (avec mot de passe, percent-encodé) | **CEO fournit l'URI ; le CTO pose le secret** (`gh secret set`) |
| `R2_BUCKET` | **variable repo** | Nom du bucket (ex. `pharnos-backups`) | CTO (création bucket) si le token CF a R2, sinon CEO |
| `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` | **secrets repo** | Cloudflare → R2 → *Manage API tokens* → token S3 (Object Read & Write) | **CEO** (dashboard) |
| `CLOUDFLARE_ACCOUNT_ID` | secret repo | déjà posé ✅ | — |
| `AGE_RECIPIENT` | **variable repo** | clé **publique** age (`age1…`) — voir ci-dessous | CTO génère, CEO garde la clé privée |

### Clé de chiffrement age (asymétrique — la clé privée ne touche JAMAIS la CI)

```bash
age-keygen -o pharnos-backup-age.key      # génère la paire
# → affiche "Public key: age1xxxx…"  (= AGE_RECIPIENT, variable repo, PUBLIQUE)
# → le fichier pharnos-backup-age.key contient la CLÉ PRIVÉE
```
- La **clé publique** (`age1…`) va dans la variable repo `AGE_RECIPIENT` (publique, non sensible).
- La **clé privée** (`pharnos-backup-age.key`, ligne `AGE-SECRET-KEY-1…`) : **CEO la stocke hors
  ligne** (gestionnaire de mots de passe / coffre). Elle n'est **jamais** mise en CI. Sans elle,
  personne (pas même un attaquant qui vole R2 + GitHub) ne peut lire les sauvegardes.

### Pose des secrets (CTO, une fois les valeurs reçues)
```bash
gh secret set SUPABASE_DB_URL --body "<URI>"
gh secret set R2_ACCESS_KEY_ID --body "<...>"
gh secret set R2_SECRET_ACCESS_KEY --body "<...>"
gh variable set R2_BUCKET --body "pharnos-backups"
gh variable set AGE_RECIPIENT --body "age1xxxx…"
gh workflow run "Backup DB"   # 1er backup à la demande
```

## 2. Restore drill (TESTÉ — sinon le backup n'existe pas)

Procédure à exécuter **une fois** après le 1er backup (puis à chaque trimestre) :

```bash
# 1. Récupérer la dernière sauvegarde depuis R2
aws s3 cp "s3://pharnos-backups/db/<dernier>.tar.gz.age" . \
  --endpoint-url "https://<ACCOUNT_ID>.r2.cloudflarestorage.com"   # creds R2

# 2. Déchiffrer avec la clé privée offline
age -d -i pharnos-backup-age.key -o restore.tar.gz "<dernier>.tar.gz.age"
tar -xzf restore.tar.gz            # → roles.sql, schema.sql, data.sql

# 3. Restaurer dans une base JETABLE (Supabase local OU projet de test) — JAMAIS la prod
supabase start                                   # base locale
psql "$LOCAL_DB_URL" -f roles.sql || true        # rôles (best-effort en local)
psql "$LOCAL_DB_URL" -f schema.sql
psql "$LOCAL_DB_URL" -f data.sql

# 4. Vérifier : compter les lignes des tables clés (products, dossiers, correspondences,
#    correspondence_messages…) et comparer à la prod. Consigner le résultat + la durée ici.
```

**Résultat du dernier drill** : _(à remplir — date, durée, tables vérifiées, OK/KO)_.

## 3. Alertes seuils *(à implémenter — sous-jalon)*

Cron (GitHub Actions ou Edge) : taille DB / Storage > 70 % du palier Free, erreurs Edge → e-mail
Resend. Déclenche la décision de bascule Supabase Pro (25 $/mois) avant saturation.

## 4. Uptime externe *(à implémenter — sous-jalon)*

Check externe gratuit sur `https://pharnos.pages.dev` + santé Edge `share`/`translate` (ping
périodique → alerte e-mail si KO). Option : un cron Actions `curl` simple (repo public → 0 €).

## 5. Backup des fichiers Storage *(décision à prendre)*

`pg_dump` sauvegarde la **base**, pas les **fichiers** (PDF compilés, pièces jointes, en-têtes).
Options : (a) rien (les PDF compilés sont re-générables ; mais les originaux téléversés et les
pièces reviewer, non) ; (b) sync hebdo du bucket `documents` → R2 (`rclone`/S3). **Recommandation :
(b)** pour les pièces non re-dérivables. À confirmer CEO (volume = coût R2, reste dans 10 Go au
stade pilote).

## Definition of Done (jalon I)
- [ ] Backup hebdo chiffré → R2 **vert** (1er run réussi).
- [ ] **Restore drill exécuté et consigné** (§2).
- [ ] Alertes seuils actives (§3).
- [ ] Uptime check actif (§4).
- [ ] Décision Storage tranchée (§5).
