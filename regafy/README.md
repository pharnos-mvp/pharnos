# Regafy — by Pharnos

Marque publique d'acquisition de Pharnos (modèle freemium façon iLovePDF, à terme : mise au
format RCP/Notice, traduction, simulateur de coûts → Regafy Pro payant).
**Feature actuelle unique : Le Test RA UEMOA** — quiz bilingue chronométré avec classement,
sur https://regafy.com (projet Cloudflare Pages `regafy`).
**Frontière produit : Regafy = niveau DOCUMENT (individuel, one-shot) ; Pharnos = niveau
DOSSIER/cycle de vie/équipe.** Ne jamais mettre de fonctionnalité dossier/équipe ici.

## Fonctionnalités (état 2026-07-19)

- **Quiz** : 10 questions tirées de la banque (1 variante max par famille), timer 30 s/question
  avec bips Web Audio ≤ 10 s (aucun fichier son), timeout = question ratée + avance automatique
  sans retour ; séries 🔥, points, pastilles, confettis à score ≥ 8 ; barre d'action fixe.
- **i18n** : anglais par défaut, français si navigateur fr ; priorité `?lang` > localStorage
  `regafy-lang` > `navigator.languages` ; sélecteur FR/EN dans le header. Les E-MAILS suivent
  la même langue (`lang` transmis à l'API).
- **Thème** : « Chaleur & Or » clair par défaut, sombre via classe `html.dark` — priorité
  localStorage `regafy-theme` > `prefers-color-scheme` ; bouton 🌙/☀️ dans le header.
- **Classement (D1)** : rang mondial + rang pays (score DESC puis temps ASC), pays déterminé
  côté serveur par `request.cf.country`. **Amorçage social : 115 joueurs fantômes comptés dans
  les TOTAUX seulement** (répartition par pays dans `functions/api/seed.js`), jamais dans les
  rangs. Preuve sociale sur l'intro via `/api/stats`.
- **Écran résultat** : score ≥ 5 → classement (compact) puis boutons LinkedIn+Refaire puis gate
  e-mail ; score < 5 → « Refaire » seul après le résultat (pas de partage d'un mauvais score).
  Les boutons existent en UNE instance (déplacement DOM).
- **Capture e-mail** : corrigé personnalisé du tirage (salutation prénom si classement rempli,
  références citées en récap) + **opt-in SIMPLE** Regafy Pulse : case cochée = contact Resend
  abonné immédiatement, note « ✓ abonné » dans le corrigé, PAS d'e-mail de confirmation
  (décision CEO 2026-07-18 — la liste est protégée par Turnstile + honeypot).
- **Anti-bot** : honeypot (réponse 200 neutre) + **Turnstile Managed** (widget « regafy »,
  hostnames regafy.com + localhost) vérifié CÔTÉ SERVEUR (siteverify) dans `/api/subscribe` —
  403 sans jeton valide. `/api/score` : bornes de vraisemblance + honeypot seulement.

## Architecture

```
regafy/
  wrangler.toml            # config Pages (IaC) : pages_build_output_dir + binding D1 `DB`
  public/                  # statique sans build — CSP stricte (cf. public/_headers)
    index.html             # LE quiz (seule page ; /quiz → / en 301 via _redirects)
    quiz.js                # moteur (i18n, timer, tirage, classement, thème, Turnstile render)
    bank.js                # banque : 53 questions / 25 familles, FR+EN
    styles.css             # thème clair + bloc html.dark
    merci.html, confidentialite.html, 404.html
  functions/api/           # Pages Functions (résolues depuis le CWD par wrangler !)
    subscribe.js           # leads : Turnstile → contact Resend → corrigé (ids du tirage)
    score.js               # classement D1 + amorçage des totaux
    stats.js               # nombre de joueurs (réels + amorçage), cache 60 s
    seed.js                # constantes d'amorçage partagées
    bank.js                # COPIE de public/bank.js préfixée `export` — garder synchrone !
    confirm.js             # legacy (liens double opt-in déjà émis) — ne plus utiliser
```

- **⚠️ Banque dupliquée** : toute modification de questions se fait dans `public/bank.js` PUIS
  se recopie dans `functions/api/bank.js` (même contenu, `const BANK` → `export const BANK`).
- **⚠️ wrangler** : toujours lancer depuis `regafy/` avec `public` en dossier d'assets, sinon
  `functions/` partirait en statique.
- **⚠️ Turnstile** : `api.js` chargé en async avec `?onload=regafyTurnstileInit&render=explicit` ;
  quiz.js appelle AUSSI l'init si `window.turnstile` est déjà là (course async/defer, PR #359).
- Base D1 : `regafy` (WEUR), table `scores`. Sitekey Turnstile (publique) dans quiz.js.

## Variables d'environnement (projet Pages `regafy` → Settings → Variables)

| Variable | Rôle |
| --- | --- |
| `RESEND_API_KEY` | REQUIS — envoi e-mails + contacts (compte Resend REGAFY, domaine regafy.com vérifié eu-west-1, expéditeur par défaut `Regafy Pulse <pulse@regafy.com>`) |
| `TURNSTILE_SECRET` | active la vérification anti-bot serveur (sinon : pas d'enforcement) |
| `FROM_ADDR` | optionnel — remplace l'expéditeur par défaut |
| `SITE_URL` | optionnel — origine des liens e-mail (défaut : origine de la requête) |
| `CONFIRM_SECRET` | legacy — seulement pour honorer d'anciens liens `/api/confirm` |

Compte Resend Regafy = **nouvelle API Contacts « flat »** (`POST /contacts`), pas d'audienceId.

## Déploiement & test

- Merge sur `main` touchant `regafy/**` → `.github/workflows/deploy-regafy.yml` → Cloudflare
  Pages (`workingDirectory: regafy`, `pages deploy public`). Recette : `regafy.pages.dev`.
- Local : `cd regafy && npx wrangler pages dev public` (crée une D1 locale vide — schéma :
  `npx wrangler d1 execute regafy --local --command "<CREATE TABLE scores...>"`, à lancer
  SERVEUR ARRÊTÉ, verrou sqlite sinon).
- **Depuis l'armement Turnstile, un curl direct sur `/api/subscribe` répond 403 : c'est
  voulu.** Les vérifications du parcours e-mail se font par une vraie partie dans un
  navigateur (le pane headless gèle sur le challenge Managed).

## Reste à faire

1. Relecture CEO des familles de questions q11+ (`public/bank.js`) — les q01–q10 sont validées.
2. (Plus tard) outils documentaires P1 : réutiliser le moteur doc de `web/` (templates
   bilingues, mammoth→TipTap, prévisualiseur A4) — pas de réécriture ; Supabase séparé à ce
   moment-là ; prix Regafy Pro à faire valider.
