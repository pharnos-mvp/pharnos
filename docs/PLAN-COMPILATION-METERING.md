# PLAN — Recentrage « compilation = livrable métré » + offline privé par org (P1)

> **Cadre (2026-06-17).** Issu de la session stratégique CTO·Product·Growth. Ne remplace pas
> [PLAN.md](PLAN.md) (vision immuable). Chaîne : PLAN.md → … → [PLAN-N-EXECUTION.md](PLAN-N-EXECUTION.md) → **ce doc**.
> Déclencheur : incident « 8 brouillons sous plafond Pro 5 » → le quota était à la **création** (mauvais
> événement) + un **poison-pill** de synchro. Décision CEO : **compter la COMPILATION** (le livrable),
> **brouillons illimités en local**, **synchro opt-in par organisation**.

## 0. North star (positionnement validé)
**Pharnos = l'usine du Module 1 régional, eCTD-v4-ready, qui s'enclenche dans tout dossier CTD global.**
M1 = régional ; M2-5 = communs/réutilisables (ICH) → un labo réutilise ses modules communs et génère le M1
du pays visé sur Pharnos. **Invariant produit : « la compilation est l'événement métré »** — compteur
constant, livrable qui grandit (PDF M1 → séquence eCTD v4). Phases : **P1 go-live propre (ce doc)** ·
P2 chiffrement repos + local-only 1ʳᵉ classe · P3 sortie eCTD v4 M1 + R2 · P4 assemblage + validateur intégré +
desktop app (Tauri) · P5 BYO-API IA + publication complète.

---

## 1. Objectif & métrique de succès
- **Objectif** : déplacer le quota de la *création* vers la **compilation** (le livrable), rendre l'offline
  **privé par org** et **robuste** (fin du poison-pill), **avant** d'onboarder des pilotes payants — et poser
  la 1ʳᵉ brique du moteur eCTD (le *ledger* de dépôts).
- **Succès** : un utilisateur n'atteint sa limite **qu'à la compilation** (jamais à la création), avec upsell ;
  **0 boucle de retry / 0 e-mail Sentry** sur dépassement ; une org peut choisir **cloud on/off** ; **3 pilotes**
  compilent un M1 réel sous le bon quota. Mesure : 0 alerte Sentry « quota » sur 7 j ; quota prouvé client+serveur
  (pgTAP + smoke prod) ; recette 3 pilotes verte.

## 2. Scope (tranche verticale fine)
1. **Quota à la compilation** : table `compilations` (ledger) + RPC `consume_compilation_quota` (garde) +
   `record_compilation` (enregistrement) ; **retrait du trigger `enforce_dossier_quota`** (création libre).
2. **Garde client au compile** (pré-check + upsell) + **relabel UI** « dossiers/mois » → « dépôts/mois ».
3. **Fix poison-pill** `dossier-sync` : classer permanent (23514/23505/42501) vs transitoire ; drainer ;
   **ne plus reporter à Sentry** les rejets métier.
4. **`navigator.storage.persist()`** (durabilité — la donnée locale n'est plus purgeable par le navigateur).
5. **Synchro opt-in par org** : colonne `orgs.sync_enabled` + garde des 7 hooks de synchro + choix à l'onboarding.

## 3. Non-goals (explicitement PAS maintenant)
Sortie **eCTD v4**, **R2**, moteur de **publication/validation**, **desktop app**, **chiffrement au repos**,
**BYO-API IA**, encaissement. Refonte du compilateur (reste **client** pour M1). → Phases P2-P5.

## 4. Architecture & stack
Réutilise le stack (Supabase Postgres + RLS, Cloudflare). Aucun nouveau composant d'infra. Patterns calqués
sur l'existant **`ai_usage` / `consume_ai_quota`** (éprouvé, leçon B1).

- **`compilations`** (ledger) : `id, org_id, dossier_id, kind ('m1_pdf'|…), created_at`. 1 compile = 1 ligne.
  C'est **la métrique de valeur** ET la **porte d'entrée future du moteur eCTD**. RLS : lecture org, écriture via RPC.
- **`consume_compilation_quota(p_kind)`** (SECURITY DEFINER, garde *check-before*, fail-closed) : cap =
  `coalesce(override, plan).max_compilations` ; période (mois calendaire) ; `count(compilations ce mois) < cap`
  → `allowed` sinon `quota_exceeded`. **Privacy-preserving** : ne lit/écrit **aucun contenu** → marche même
  pour une org local-only (l'acte de compiler est en ligne ; on compte un *nombre*, jamais les données).
- **`record_compilation(dossier_id, kind)`** : insère la ligne ledger après compile réussi (atomique).
- **`plan_limits`** : `+ max_compilations int`, `+ compilations_period text`. `max_dossiers` (création) **déprécié**
  (trigger retiré) ; conservé en rétro-compat le temps de la bascule.
- **`orgs.sync_enabled boolean not null default true`** : gate des 7 modules de synchro
  (`syncDossiers`/`syncCatalogue`/… : `if (!sync_enabled) return`).
- **Client** : `handleCompile` → `consume_compilation_quota` AVANT de produire le PDF ; si refus → upsell
  (réutilise `useUpsell`) ; sinon compile + `record_compilation`. Pré-check proactif via `my_org_plan`
  (`compilations_used`/cap) pour désactiver+upseller le bouton. `NewDossierPage` : **création dé-gardée**.
  `persist()` demandé au 1er enregistrement (geste utilisateur). Hooks de synchro gardés sur `sync_enabled`.
- **Migration = `0039`** (dernier appliqué = `0038`).

## 5. Jalons (tranches livrables)
- **M1 — Modèle serveur (sensible/billing)** : migration `0039` (ledger + 2 RPC + retrait trigger création +
  `max_compilations`) + **pgTAP** (sur-quota→refus, sous→passe, local-only→compté) + validation read-only prod. ~1 tranche.
- **M2 — Garde client compile + UI** : `handleCompile` garde+record, pré-check+upsell, relabel
  (`plan-catalog`/Abonnement/`AdminPlans`), création illimitée. Tests. ~1 tranche.
- **M3 — Robustesse + privacy** : fix poison-pill (classer erreurs, drainer, filtre Sentry) + `persist()` +
  `sync_enabled` (flag + garde des 7 syncs + toggle onboarding). Tests. ~1 tranche.
- **M4 — Go-live (clôt N4)** : recette navigateur + **3 pilotes** (M1 réel compilé + correspondance + partage) +
  **bascule Supabase Pro** + checklist GO-LIVE signée. ~1 tranche (gated pilotes).

## 6. Risques & mitigations (top 3)
1. **Changement sensible (facturation)** → playbook B1 : `create or replace` diffé contre le vrai prédécesseur,
   **pgTAP + smoke prod rolled-back**, double garde client+serveur, rétro-compat de l'ancien cap pendant la bascule.
2. **Métrage d'une org local-only** (jamais en ligne ⇒ non mesurable serveur) → la **compilation est un acte EN
   LIGNE** (record au compile) ; si compile hors-ligne : autoriser + **réconcilier au retour** (jamais de boucle).
3. **Dérive de scope vers l'eCTD** → non-goals stricts : la brique = **ledger + garde**, **format de sortie
   inchangé (PDF M1)**. L'eCTD est P3.

## 7. Definition of Done
- Quota appliqué **à la compilation**, **client** (pré-check + upsell) **et serveur** (RPC garde) ; pgTAP
  (sur-quota→refus / sous→passe / local-only compté) + **smoke prod rolled-back**.
- **Création de dossier illimitée** (trigger retiré) ; **0 boucle / 0 e-mail Sentry** sur dépassement (poison-pill classé).
- `navigator.storage.persisted() === true` après geste utilisateur.
- `sync_enabled` respecté (org local-only ne pousse **rien** — vérifié).
- Gates verts (typecheck/lint/format/test/build/budget + pgTAP/e2e) · recette navigateur prod · **3 pilotes** · checklist N4 signée CEO.

## 8. Prochaine étape (action n°1)
**M1** : concevoir + écrire la **migration `0039`** (ledger `compilations` + `consume_compilation_quota` +
`record_compilation` + retrait du trigger création + `max_compilations`) avec pgTAP, **validée read-only sur la
donnée prod** (playbook B1). Aucune écriture prod sans GO explicite.
