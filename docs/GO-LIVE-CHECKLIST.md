# Checklist GO-LIVE (gate N / P1) — à signer par le CEO

> **MAJ 2026-06-17.** Tout le **technique** du gate est livré, déployé et recetté (CLI + MCP + Chrome).
> Restent **3 actions humaines** : recette 3 pilotes, bascule Supabase Pro, signature.
> Le **parcours-type pilote** est cadré + **validé en prod** (dry-run CTO compte Enterprise) :
> voir [KIT-PILOTE.md](KIT-PILOTE.md) — création produit/dossier, Regafy EN, gate localisé, **compile M1 ~2 s**.

## ✅ Produit / modèle (livré)
- [x] **Quota recentré sur la COMPILATION (dépôt)** — création de dossiers/brouillons **illimitée** (`0039`/`0040`),
      garde **client + serveur** (`record_compilation` fail-closed), pgTAP, recette prod.
- [x] **Offline privé par org** — feature `cloud_sync` 3 états en god mode (`AdminPlans`) + toggle org
      (Compte → Préférences) + `sync_enabled` qui **gate les 8 modules de sync** (`0041`) → mode local = rien ne sort.
- [x] **Robustesse** — poison-pill outbox drainé (fin du *Sentry storm*) ; **stockage persistant** (`persist()`).
- [x] **Polish pilote Phase 0** — P0-1 en-tête template sticky + P0-2 Regafy localisé FR/EN (PR #188, recettés prod Chrome).
- [ ] **3 pilotes** : chacun **1 dossier réel compilé < 1 j + 1 correspondance + 1 partage** ([parcours-type](KIT-PILOTE.md) prêt). ⟵ **ACTION CEO**

## ✅ Sécurité (livré)
- [x] 0 vuln high ; RLS pgTAP par table ; helpers internes verrouillés ; rate-limit IA ; rotation secrets documentée.
- [x] Backup DB + Storage chiffrés + **restore TESTÉ** ; advisors **0 ERROR** (WARN restants = acceptés par conception).
- [ ] **leaked-password ON** + **`auth.pharnos.com`** (marque sur l'écran Google) — **Supabase Pro only**. ⟵ bascule Pro

## ✅ Perf / Scalabilité (livré)
- [x] Gates a11y/best-practices ; budget bundle **130,5 / 135 Ko** ; code-split workspace.
- [x] Sync indexée (`0035`) ; quotas (compilation / IA / stockage) actifs ; **k6** gardes Edge verts (`load/`).
- [ ] **Quota stockage DUR (D2)** — au moment Pro. ⟵ bascule Pro

## ✅ Opérabilité (livré)
- [x] **Uptime · Alertes seuils · Backup DB · Backup Storage** : tous verts.
- [x] Console admin (god mode) OK.
- [ ] **Bascule Supabase Pro (25 $/mois)** au 1ᵉʳ déclencheur (1ᵉʳ client payant **OU** Storage/DB > 70 %). ⟵ **ACTION CEO**

## Migrations en prod
Dernière appliquée = **`0041`** (set_org_sync). Reprendre à `0042`.

## Signature
GO-LIVE approuvé par : ____________________   Date : ____________
