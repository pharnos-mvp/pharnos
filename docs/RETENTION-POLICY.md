# Politique de rétention des données — dossiers réglementaires

> **Argument conformité client** (GxP / ALCOA++). Ce document décrit ce que Pharnos conserve,
> restaure et purge, et où chaque règle est appliquée dans le code. Livré au LOT 9 (corbeille +
> purge de rétention) ; concrétise [STORAGE-DATA-POLICY.md](STORAGE-DATA-POLICY.md) §7.
> Périmètre : les **dossiers** (opérations réglementaires) et leurs données attachées. La
> suppression de compte/organisation (RGPD) reste traitée dans STORAGE-DATA-POLICY §7.

## 1. Les trois états d'un dossier

| État | Qui | Ce qui s'applique |
|---|---|---|
| **Actif** | tout dossier en cours | Conservation intégrale (données + fichiers + journal du cycle de vie). |
| **Archivé** (`archived_at`) | dossier **soumis** à une agence (enregistrement réglementaire) | **Jamais supprimé, jamais purgé** — la réglementation impose la rétention. Restaurable à tout moment dans l'actif. Motif d'archivage tracé à l'audit (ALCOA « reason for change »). |
| **Corbeille** (`deleted_at`) | **brouillon jamais soumis**, supprimé par un membre | Restaurable pendant la **fenêtre de grâce de 30 jours**, puis **purge définitive automatique**. Suppression, restauration et purge tracées à l'audit. |

**Un dossier soumis ne peut PAS être supprimé** : l'UI ne propose que l'archivage, et le serveur
re-vérifie (un dossier ayant une correspondance — même révoquée — n'est jamais purgé).

## 2. La purge automatique (fenêtre de grâce échue)

Chaque nuit (cron `retention-purge`, 05:37 UTC — migration `0054`), les brouillons supprimés
depuis plus de **30 jours** sont purgés définitivement :

1. **Fichiers effacés** du Storage (pièces jointes du dossier, pièces du cycle de vie) — via
   l'API Storage, les octets sont réellement libérés ;
2. **Données effacées** : pièces jointes, documents générés, journal du cycle de vie ;
3. **Squelette tombstone conservé** : la ligne `dossiers` reste (identité + dates + `purged_at`),
   vidée de son contenu — c'est la **preuve d'audit de la purge** et le vecteur de propagation
   vers les appareils hors-ligne (sync offline-first) ;
4. **Entrée au journal d'audit** de l'organisation (acteur `system`, action `purge`).

Les **backups** conservent les données purgées jusqu'à expiration de leur propre fenêtre de
rétention (voir STORAGE-DATA-POLICY §5) — c'est le comportement attendu d'une sauvegarde.

## 3. Où chaque règle est appliquée (défense en profondeur)

| Règle | UI | Base / serveur |
|---|---|---|
| Brouillon → corbeille (soft delete + motif) | dialogue de confirmation | `deleted_at` (tombstone, `0003`) |
| Soumis → archive uniquement | seul « Archiver » proposé | `archived_at` (`0030`) |
| Restauration (corbeille & archive) | vues Corbeille / Archivés du board Opérations | audit `restore` |
| Purge à 30 j | compte à rebours « purge automatique dans N j » | Edge `retention-purge` + cron `0054` ; **jamais** si correspondance ou `archived_at` |
| `purged_at` réservé au serveur | — | trigger `protect_dossier_purged_at` (`0054`) : un client ne peut pas simuler une purge (qui sauterait le nettoyage réel) |
| Immuabilité de l'audit | — | RLS append-only (`0008`) |

## 4. Constantes à garder alignées

| Constante | Valeur | Où |
|---|---|---|
| `TRASH_RETENTION_DAYS` | 30 | `web/src/features/workspace/dossier-repository.ts` (affichage + dialogues) |
| `RETENTION_DAYS` | 30 | `supabase/functions/retention-purge/index.ts` (purge réelle) |
| Cron | `37 5 * * *` | migration `0054` (décalé des relances auto 05:17) |

## 5. Réponse type à un auditeur / client

- « Que devient un dossier soumis si je le retire de mes vues ? » → **Archivé, conservé sans
  limite de durée, restaurable, motif tracé.** Rien d'un enregistrement réglementaire n'est
  jamais détruit.
- « Que devient un brouillon supprimé ? » → **Corbeille 30 jours (restaurable), puis purge
  définitive automatique, tracée au journal d'audit.** Les fichiers sont réellement effacés.
- « Qui peut purger ? » → **Personne manuellement.** La purge est un traitement serveur planifié,
  authentifié par secret Vault, avec garde-fous SQL (jamais un dossier soumis).
