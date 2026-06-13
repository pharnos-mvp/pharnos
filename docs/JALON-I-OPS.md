# Jalon I — Ops & filets de production

> Filet **obligatoire avant l'ouverture aux pilotes** (données réglementaires réelles).
> Cible : backups chiffrés hebdo testés, alertes seuils, uptime. **Coût : 0 € sans carte**
> (artefacts GitHub) ; upgrade R2 prévu si une carte est ajoutée côté Cloudflare.

## 1. Backup DB chiffré → artefact GitHub *(workflow `.github/workflows/backup.yml`)*

**Principe.** Chaque lundi (+ manuel), `supabase db dump` (rôles + schéma + données) → archive
`tar.gz` → **chiffrée avec `age`** (clé publique de destinataire) → publiée comme **artefact de
workflow** (rétention 90 j ≈ 12 sauvegardes). L'artefact étant chiffré, **même téléchargé** (le repo
est public) il est inexploitable sans la **clé privée** (offline, hors CI). Le workflow est
**no-op vert** tant que le secret/var ne sont pas posés.

**Pourquoi artefacts et pas R2 ?** R2 (10 Go gratuits) reste l'option robuste long terme (rétention
illimitée, hors écosystème GitHub) mais **exige une carte sur le compte Cloudflare**. Tant qu'on
veut 0 € **sans carte**, l'artefact GitHub chiffré est un offsite suffisant au stade pilote (GitHub
≠ Supabase). Bascule R2 = ré-ajout d'un job d'upload S3 (déjà écrit dans l'historique git).

### À fournir (une fois)

| Élément | Type | Où l'obtenir | Qui |
|---|---|---|---|
| `SUPABASE_DB_PASSWORD` | **secret repo** | Dashboard Supabase → Database → *Database password* → **Reset password** (le mot de passe n'est jamais réaffiché ; reset = nouveau, montré une fois). Le **mot de passe brut** suffit — le workflow assemble l'URI et encode les caractères spéciaux. | **CEO** (`gh secret set` en git bash, ou web UI) |
| `AGE_RECIPIENT` | **variable repo** | clé **publique** age (`age1…`) — voir ci-dessous | CTO génère (✅ fait), CEO garde la clé privée |

> **Connexion : Session pooler (IPv4)**, pas la connexion directe (IPv6, qui échoue depuis les
> runners GitHub IPv4-only). L'URI assemblée par le workflow :
> `postgresql://postgres.uhsireqwzqqymgsxuvqh:<pw>@aws-0-eu-west-3.pooler.supabase.com:5432/postgres`
> (ref + hôte ne sont **pas** secrets : déjà publics dans le bundle et l'URL projet).

### Clé de chiffrement age (asymétrique — la clé privée ne touche JAMAIS la CI)

```bash
age-keygen -o pharnos-backup-age.key      # génère la paire
# → "Public key: age1xxxx…"  (= AGE_RECIPIENT, variable repo, PUBLIQUE)
# → le fichier pharnos-backup-age.key contient la CLÉ PRIVÉE (ligne AGE-SECRET-KEY-1…)
```
- **Clé publique** (`age1…`) → variable repo `AGE_RECIPIENT` (publique, non sensible). **✅ posée.**
- **Clé privée** (`pharnos-backup-age.key`) : **générée le 2026-06-13** dans
  `C:\Users\ASUS\pharnos-backup-age.key`. **Action CEO : la déplacer dans un gestionnaire de mots de
  passe / coffre offline**, hors du dossier projet. Elle n'est **jamais** mise en CI. Sans elle,
  personne (même avec l'artefact téléchargé) ne peut lire les sauvegardes — **sa perte = backups
  illisibles**.

### Pose du secret + 1er backup (CTO / CEO)
```bash
gh secret set SUPABASE_DB_PASSWORD        # invite cachée — colle le mot de passe (jamais en clair dans l'historique)
gh workflow run "Backup DB"               # 1er backup à la demande
gh run watch                              # suivre jusqu'au vert
```

## 2. Restore drill (TESTÉ — sinon le backup n'existe pas)

À exécuter **une fois** après le 1er backup (puis chaque trimestre). La clé privée reste **locale**.

```bash
# 1. Récupérer le dernier artefact de backup (extrait le .tar.gz.age du zip d'artefact)
gh run download --name "pharnos-db-<stamp>" --dir ./_restore        # ou: dernier run du workflow Backup DB

# 2. Déchiffrer avec la clé privée offline, puis dépaqueter
age -d -i "C:/Users/ASUS/pharnos-backup-age.key" -o restore.tar.gz "./_restore/pharnos-db-<stamp>.tar.gz.age"
tar -xzf restore.tar.gz            # → roles.sql, schema.sql, data.sql

# 3a. Validation minimale (sans base) : l'archive est bien formée et non vide, tables clés présentes
grep -c "CREATE TABLE" schema.sql
grep -E "products|dossiers|correspondences|correspondence_messages" schema.sql | head

# 3b. Restauration réelle dans une base JETABLE — JAMAIS la prod (Supabase local OU conteneur pg)
supabase start                                   # base locale (Docker) ; OU un postgres:16 jetable
psql "$LOCAL_DB_URL" -f roles.sql || true        # rôles (best-effort en local)
psql "$LOCAL_DB_URL" -f schema.sql
psql "$LOCAL_DB_URL" -f data.sql

# 4. Vérifier : compter les lignes des tables clés (products, dossiers, correspondences,
#    correspondence_messages…) et comparer à la prod. Consigner le résultat + la durée ci-dessous.
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
pièces reviewer, non) ; (b) sync hebdo du bucket `documents` (`gsutil`/S3 → artefact ou R2).
**Recommandation : (b)** pour les pièces non re-dérivables. À confirmer CEO (volume = coût).

## Definition of Done (jalon I)
- [ ] Backup hebdo chiffré → artefact **vert** (1er run réussi).
- [ ] **Restore drill exécuté et consigné** (§2).
- [ ] Clé privée age déplacée offline par le CEO (§1).
- [ ] Alertes seuils actives (§3).
- [ ] Uptime check actif (§4).
- [ ] Décision Storage tranchée (§5).
