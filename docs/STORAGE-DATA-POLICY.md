# Politique de stockage & données — Pharnos (MVP)

> Statut : **v1, 2026-06-13** — rédigée par le CTO, à ratifier par le CEO. Cadre les **données
> utilisateurs**, le **stockage des fichiers**, les **backups**, la **rétention**, la **sécurité** et la
> **trajectoire de scale**. Complète [JALON-I-OPS.md](JALON-I-OPS.md) (ops/backups) et l'ADR-0003 (sécurité
> correspondance).

## 1. Principes

1. **Confidentialité d'abord** — les dossiers réglementaires sont sensibles (secret industriel, données
   d'AMM). Tout est **privé par défaut**, isolé par organisation (RLS), chiffré en transit et au repos.
2. **Isolation multi-tenant stricte** — chaque donnée porte un `org_id` ; RLS Postgres hermétique
   (testée pgTAP). Aucun accès cross-org possible, même via un bug applicatif.
3. **Résidence des données UE** — projet Supabase en région **eu-west-3 (Paris)** : pertinent pour des
   clients francophones / souveraineté (UEMOA-CEDEAO, RGPD-compatible).
4. **0 € jusqu'au 1er revenu** — paliers gratuits (Supabase Free, GitHub, Cloudflare Pages) ; bascule
   payante déclenchée par des **seuils mesurés** (voir §7), pas par anticipation.
5. **Restaurabilité prouvée** — un backup non testé n'existe pas (restore drills, §5 + JALON-I-OPS §2/§5).

## 2. Où vivent les données

| Donnée | Emplacement | Quota gratuit | Sauvegardé par |
|---|---|---|---|
| Tables (dossiers, produits, correspondances, users, métadonnées fichiers) | **Supabase Postgres** | 500 Mo | Backup DB (artefact GitHub) |
| **Fichiers** (PDF sources, générés, compilés, pièces correspondance, en-têtes) | **Supabase Storage**, bucket privé `documents` | 1 Go | Backup Storage (Release GitHub) |
| Auth (comptes, sessions) | Supabase Auth | inclus | Backup DB (schéma `auth`) |
| Secrets serveur (service_role, Resend…) | Supabase Edge secrets / GitHub secrets | — | non sauvegardés (régénérables) |
| Backups chiffrés | **GitHub** (artefacts + Releases) — **hors Supabase** | voir §5 | clé privée age (offline, CEO) |

> **Les backups ne consomment PAS le quota Supabase** : ils sont sur GitHub. Aucun risque de saturer le
> 1 Go Supabase avec les sauvegardes.

## 3. Politique des documents utilisateurs

- **Bucket unique** `documents` (privé, `public=false`), chemins :
  `‹org_id›/‹dossier_id›/‹doc_id›/‹nom_fichier›` — l'`org_id` en tête garantit l'isolation par RLS.
- **Types stockés** : (a) **sources téléversées** (AMM, COPP, GMP, RCP, Notice, Étiquette, Licence…) ;
  (b) **documents générés** (traductions, versions conformes) ; (c) **PDF compilés** (Module 1) ;
  (d) **pièces de correspondance** (voir §4) ; (e) **en-têtes/logos** d'organisation.
- **Accès** : jamais public. Lecture via URL **signée/authentifiée** (RLS côté client ; `service_role`
  **uniquement** côté serveur — Edge / backup). Le front télécharge via `download()` authentifié.
- **Formats** : PDF en priorité (documents réglementaires). Images (en-têtes) tolérées.
- **Re-dérivabilité** : les **PDF compilés** et **documents générés** sont **re-générables** depuis les
  données + templates ; les **sources téléversées** et **pièces reviewer** sont **irremplaçables**
  → ce sont elles que la sauvegarde protège en priorité.

## 4. Fichiers de correspondance

- **On les stocke — et on doit** : ils constituent la **trace d'audit réglementaire** (preuve de ce qui a
  été soumis à l'agence locale et de sa réponse).
- **PDF compilé envoyé** : `correspondences.pdf_path` + `pdf_size`, **write-once** (`v‹ts›.pdf` à chaque
  renvoi) → immuable, jamais écrasé (intégrité de l'audit).
- **Pièces jointes** (reviewer / labo) : référencées dans `correspondence_messages.attachments` (jsonb,
  métadonnées) ; octets dans le bucket `documents`.
- **Tout est dans `documents`** → **couvert par le backup Storage** (§5). **Reco MVP : conserver tel
  quel**, sans purge (volume faible, valeur probatoire élevée).

## 5. Backups (récapitulatif — détail dans JALON-I-OPS.md)

| Cible | Quoi | Où | Rétention | Restore testé |
|---|---|---|---|---|
| **DB** | rôles + schéma + données (chiffré age) | artefact GitHub | 90 j (~13 copies) | ✅ 2026-06-13 |
| **Storage** | bucket `documents` complet (chiffré age) | Release GitHub `storage-backup` | 12 snapshots | ✅ 2026-06-13 |

- **Chiffrement asymétrique age** : la **clé privée reste offline** (CEO), jamais en CI. Même un backup
  téléchargé (repo public) est inexploitable sans elle.
- **Empreinte actuelle** : DB ~4 Mo/run ; Storage ~92 Mo/snapshot → ~1,1 Go sur Releases. **Négligeable
  et gratuit** (hors Supabase).
- **Limite connue (scale)** : le snapshot Storage est **complet** à chaque run → croît linéairement avec
  le bucket. **Seuil de bascule : > ~1–2 Go de fichiers** → passer à de l'**incrémental** (ex. `rclone`
  vers R2 avec versioning/lifecycle) plutôt que des snapshots complets.

## 6. Sécurité des données

- **En transit** : TLS 1.2+ partout, HSTS sur le front.
- **Au repos** : Supabase chiffre la base et le Storage (AES-256) ; backups re-chiffrés age par-dessus.
- **Isolation** : RLS tenant hermétique (pgTAP) ; partage public correspondance via tokens 256-bit hachés
  + PBKDF2 (mot de passe optionnel) + rate-limits + filigrane + journal d'accès (ADR-0003).
- **Secrets** : `service_role` jamais côté front ni en clair ; clés API rotables.
- **Pas d'E2EE** (chiffrement de bout en bout) au MVP — documenté ; niveau L3 activable si un client
  l'exige contractuellement.
- **Journalisation** : `audit_log` (actions sensibles) + `share_access_log` (accès aux liens publics).

## 7. Rétention & suppression

- **Pendant la vie du dossier** : conservation intégrale (données + fichiers).
- **Suppression** : *soft-delete* (`deleted_at`) → purge réelle des octets Storage après une **période de
  grâce** (proposé : 30 j) ; les backups conservent les fichiers supprimés sur leur fenêtre de rétention.
- **Rétention réglementaire** : les dossiers d'AMM se conservent souvent des années → **par défaut on ne
  purge pas automatiquement** ; la durée légale relève du client. À formaliser par client au-delà du MVP.
- **RGPD / droit à l'effacement** : suppression de compte/organisation → purge DB + Storage + exclusion
  des prochains snapshots (les snapshots antérieurs expirent par rétention).

## 8. Quotas & garde-fous (sous-jalon M)

- **Quota de stockage par organisation** (à implémenter jalon M) — empêche une org de saturer le palier
  partagé ; condition d'ouverture au-delà des pilotes.
- **Taille de fichier max** par upload (proposé : 25–50 Mo MVP) ; **types autorisés** (PDF + images).
- **Alertes seuils** (déjà en place, JALON-I-OPS §3) : e-mail si DB ou Storage > 70 % du palier.

## 9. Trajectoire de scale (du MVP au volume)

| Phase | Déclencheur | Stockage fichiers | Base | Backups |
|---|---|---|---|---|
| **MVP / pilotes** *(actuel)* | — | **Supabase Storage** (1 Go, gratuit) | Supabase Free | GitHub (artefacts + Releases) |
| **Décollage** | 1er client payant **ou** Storage > 70 % **ou** egress sensible | **→ Cloudflare R2** (10 Go gratuits puis 0,015 $/Go·mois, **egress 0 $**) ; servi via URL signée / Worker | **Supabase Pro** (25 $/mois, DB 8 Go, Storage 100 Go) | DB → R2 ; Storage → R2 versioning/lifecycle |
| **Volume / CTD complets** | dossiers CTD lourds (Module 3 = 100 Mo–Go), multi-orgs | **R2 reste le backbone** + lifecycle (archivage froid), quotas par org, dédup | Supabase Pro + compute add-ons / read replicas | incrémental + cross-region |

**Pourquoi R2 et pas autre chose au scale.** Les CTD pharma complets sont **très lourds** et **servis en
boucle** (aperçus, compilations, correspondances). Le coût qui explose alors n'est pas le stockage mais
l'**egress** : **R2 facture 0 $ d'egress** (vs Supabase/S3 qui le facturent). C'est l'avantage structurel
qui fait qu'**on adopte R2 au décollage et qu'on y reste** — il scale à l'infini (compatible S3, lifecycle,
multi-région). Seul prérequis : **une carte sur le compte Cloudflare** (palier gratuit ensuite à 0 $ sous
10 Go), ce qui tombe naturellement au 1er revenu.

**Ce que le MVP NE fait PAS** (volontairement) : stocker des **CTD complets/Module 3**. Le périmètre MVP =
**Module 1 + documents de conformité** (PDF de quelques Mo) → le 1 Go Supabase est largement suffisant pour
les pilotes ; le sujet « fichiers lourds » est explicitement une affaire de **phase de scale → R2**.

## 10. Seuils de décision (résumé actionnable)

- **Storage Supabase > 70 % (≈700 Mo)** → activer R2 + Supabase Pro.
- **Backup Storage (bucket) > ~1–2 Go** → passer du snapshot complet à l'incrémental (R2 lifecycle).
- **1er client payant** → ajouter une carte Cloudflare, basculer fichiers + backups sur R2.
- **Stockage de CTD lourds demandé** → R2 obligatoire dès le départ de cette fonctionnalité.
- **Exigence E2EE client** → activer le niveau L3 (ADR-0003).
