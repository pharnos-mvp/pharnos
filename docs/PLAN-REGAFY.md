# PLAN REGAFY — marque d'acquisition (regafy.com)

> **Cadrage CTO (2026-07-19, demande CEO : « séparer le plan Pharnos du plan Regafy »).**
> Regafy est une branche de Pharnos, mais **son exécution obéit à un régime différent** — ce
> document est la **source unique** du cap Regafy. Les plans Pharnos
> ([PLAN-LANCEMENT.md](PLAN-LANCEMENT.md), [PLAN-RESTANT.md](PLAN-RESTANT.md), [BOARD.md](BOARD.md))
> ne couvrent QUE le produit ; l'état technique Regafy reste dans
> [`regafy/README.md`](../regafy/README.md) (architecture, env, pièges).
>
> ⚠️ **Désambiguïsation** : dans les docs Pharnos antérieures, « Regafy » désigne la feature IA
> in-app (Edge `regafy-ai`, renommée « Audit de conformité » côté UI). Ici, Regafy = la **marque
> publique d'acquisition** sur regafy.com.

## Mission

**Regafy = le haut de funnel de Pharnos.** Marque freemium façon iLovePDF pour les professionnels
RA UEMOA/CEDEAO : contenus et outils au niveau **document** (individuel, one-shot) qui captent des
leads qualifiés, alimentent **Regafy Pulse** (la liste e-mail), et débouchent sur des
**invitations Pharnos** (le produit dossier/équipe, accessible uniquement sur code d'invitation
depuis #346/#348).

**Frontière produit (garde-fou absolu)** : Regafy = DOCUMENT (individuel, one-shot) ;
Pharnos = DOSSIER / cycle de vie / équipe. **Aucune fonctionnalité dossier/équipe ne va dans
Regafy** — le jour où un utilisateur Regafy a besoin d'un dossier, la réponse est une invitation
Pharnos, pas une feature Regafy.

## Deux régimes d'exécution (pourquoi les plans DOIVENT différer)

| | **Pharnos** (produit) | **Regafy** (acquisition) |
|---|---|---|
| Nature | SaaS profond, GxP, données clients réelles | vitrine + outils one-shot, zéro donnée dossier |
| Cadence | lots verrouillés, recette CEO par lot, zéro-dette | itération rapide, contenu > code, droit à l'expérimentation |
| Gate qualité | CI 6/6, pgTAP, e2e, recette navigateur prod | CI deploy + recette manuelle regafy.pages.dev ; le seul gate dur = **exactitude réglementaire du contenu (CEO)** |
| Stack | React/TS/Supabase/Dexie offline-first | statique sans build + Pages Functions + D1 (pas de Supabase tant que pas nécessaire) |
| Métrique | GO-LIVE, orgs pilotes actives, compilations | joueurs quiz, contacts Pulse, invitations Pharnos demandées |
| i18n | FR d'abord (marché primaire) | **EN par défaut**, FR si navigateur fr (portée D1 mondiale) |
| E-mail | Resend Pharnos (`pharnos.com`) | **compte Resend séparé** (`pulse@regafy.com`, API Contacts flat) |
| Déploiement | merge `main` → app.pharnos.com / pharnos.com | merge `main` touchant `regafy/**` → `deploy-regafy.yml` → regafy.com |
| Coût | 0 € jusqu'au 1er client payant | 0 € (Pages + D1 + Resend free tier) |

**Points de jonction (les SEULS, tout le reste est étanche)** :
1. **Le funnel** : Regafy capte → Pulse nourrit → l'expert attribue un **code d'invitation**
   Pharnos (console admin Acquisition, migration `0064` ; orgs actives = base de rémunération
   des experts prescripteurs).
2. **La réuse de code, à sens unique `web/` → `regafy/`** (templates bilingues, mammoth→TipTap,
   prévisualiseur A4 pour R2) — jamais l'inverse, jamais de dépendance Regafy dans l'app.

## État (2026-07-19)

**R0 ✅ LANCÉ — regafy.com en prod, feature unique : Le Test RA UEMOA.**
Quiz bilingue chronométré (banque 53 questions / 25 familles, tirage 10, timer sonore),
classement D1 mondial + pays (amorçage social 115 dans les totaux seulement), clair/sombre,
écran résultat par score, partage LinkedIn, capture e-mail = corrigé personnalisé + **opt-in
simple Pulse** (décision CEO 2026-07-18, pas de double opt-in — liste protégée Turnstile +
honeypot), Turnstile Managed vérifié serveur. PRs #345→#361. Détail technique + pièges :
[`regafy/README.md`](../regafy/README.md).

## Jalons

### R1 — Consolidation contenu (EN COURS)
- **R1a · Relecture CEO de la banque q11+** (`regafy/public/bank.js`) — q01–q10 validées.
  *Gate : rien d'autre ne presse tant que le contenu public n'est pas irréprochable.*
  ⚠️ banque dupliquée : recopier dans `functions/api/bank.js` (`const` → `export const`).
- **R1b · Regafy Pulse n°1** — premier envoi à la liste. **À cadrer avec le CEO d'abord** :
  cadence (hebdo ? bimensuel ?), format (veille réglementaire ? actualité agences ?), FR/EN.
  Les contacts portent déjà la langue. *Pré-requis : R1a (crédibilité).*

### R2 — Premier OUTIL documentaire : mise au format RCP/Notice
Le vrai « move iLovePDF » : l'utilisateur dépose son document, Regafy le met au format
réglementaire UEMOA. **Réuse du moteur doc de `web/`** (templates bilingues RCP/Notice,
mammoth→TipTap, prévisualiseur A4) — **pas de réécriture**. Freemium : X documents gratuits →
**Regafy Pro** payant (prix à faire valider CEO). Backend : Supabase **séparé** de Pharnos à ce
moment-là (pas avant). CTA permanent vers Pharnos pour le niveau dossier.

### R3 — Outils suivants (ordre selon traction R2)
- **Traduction réglementaire** (garde-fou MedDRA : terminologie à la main, pas d'IA seule).
- **Simulateur de coûts de soumission** — les barèmes officiels Bénin + Sénégal + Côte d'Ivoire
  sont déjà encodés dans Pharnos (#337–#339) : exposition read-only côté Regafy.

### Transverse (au fil de l'eau, jamais bloquant)
- **Boucle growth** : partage LinkedIn du score, SEO du quiz, preuve sociale `/api/stats`.
- **Mesure du funnel** : joueurs réels vs amorçage, contacts Pulse, demandes d'invitation —
  rapprochement avec la console Acquisition côté Pharnos (codes utilisés par expert).

## Garde-fous

1. **Frontière document/dossier** (cf. Mission) — non négociable.
2. **Zéro affirmation réglementaire non sourcée** : toute question/contenu public cite ses
   références ; validation CEO avant publication (même bar que le produit : zéro hallucination).
3. **Étanchéité des comptes** : Resend Regafy ≠ Resend Pharnos ; Supabase séparé à R2 ;
   aucun secret partagé entre les deux périmètres.
4. **Réuse à sens unique** `web/` → `regafy/` ; Regafy n'introduit jamais de dépendance dans l'app.
5. **CSP stricte, pas de PII en URL, Turnstile serveur** — acquis R0, à maintenir sur chaque
   nouvelle page/outil.

## Décisions en attente (CEO)

| Décision | Bloque | Note |
|---|---|---|
| Validation banque q11+ | R1a (et moralement R1b) | q01–q10 déjà validées |
| Cadence + format Pulse | R1b | la liste grossit pendant ce temps — décider avant qu'elle refroidisse |
| Prix Regafy Pro | R2 (fin) | cohérence à vérifier avec la grille Pharnos en attente ([PLAN-RESTANT.md](PLAN-RESTANT.md) « barème chiffré ») |

## Pièges d'exécution (appris à R0 — ne pas repayer)

- **Arbre partagé** : le working tree porte du WIP CEO → tout chantier Regafy passe par un
  **worktree** dédié.
- **wrangler** : les Functions sont résolues depuis le CWD → toujours lancer depuis `regafy/`
  avec `public` en dossier d'assets.
- **Turnstile armé** : un `curl` direct sur `/api/subscribe` répond 403 **par design** — la
  recette e-mail se fait par une vraie partie dans un vrai navigateur (le pane headless gèle
  sur le challenge Managed).
- **Course async/defer** : `api.js` Turnstile en async + `quiz.js` en defer → init des deux
  côtés (PR #359).
- **D1 locale** : créer le schéma serveur ARRÊTÉ (verrou sqlite).
