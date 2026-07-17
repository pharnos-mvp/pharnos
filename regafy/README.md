# Regafy — by Pharnos

Marque publique d'acquisition de Pharnos : quiz, Dépêche RA (newsletter), puis outils documentaires
(mise au format RCP/Notice, traduction, simulateur de coûts). Modèle freemium façon iLovePDF.
**Frontière produit : Regafy = niveau document (individuel, one-shot) ; Pharnos = niveau dossier/équipe.**

## Structure

- `public/` — site statique sans build (comme `landing/`) : HTML + `styles.css` + JS externes (CSP stricte, cf. `public/_headers`). Liens internes en URL « propres » (`/quiz`, pas `/quiz.html` — Pages redirige les `.html` en 308).
- `functions/api/subscribe.js` — POST leads : contact Resend + corrigé quiz (transactionnel) + double opt-in Dépêche.
- `functions/api/confirm.js` — GET : confirmation double opt-in (HMAC), puis redirection `/merci`.
- ⚠️ wrangler résout les Functions depuis `<cwd>/functions` : toujours lancer wrangler DEPUIS `regafy/` avec `public` comme dossier d'assets (sinon `functions/` serait uploadé en statique).
- Fontes self-host copiées de `landing/assets/fonts` (CSP `font-src 'self'`).
- ⚠️ Les questions du quiz existent en DEUX exemplaires à garder synchrones : `quiz.js` (front) et
  `functions/api/corrige.js` (e-mail).

## Déploiement

`.github/workflows/deploy-regafy.yml` : merge sur `main` touchant `regafy/**` → Cloudflare Pages,
projet `regafy` (créé idempotent au premier run). URL de recette : `regafy.pages.dev`.
Domaine custom `regafy.com` : à attacher dans le dashboard Pages après la recette CEO.

## Variables d'environnement (projet Pages `regafy` → Settings)

Tant qu'elles manquent, `/api/subscribe` répond 503 (le site statique fonctionne, les formulaires affichent une erreur propre).

Compte Resend dédié Regafy (regafy.ai@gmail.com), domaine `regafy.com` vérifié (eu-west-1, DNS posés
le 2026-07-17). Nouvelle API Contacts « flat » (`POST /contacts`) — pas d'`audienceId`.

| Variable | Rôle |
| --- | --- |
| `RESEND_API_KEY` | Envoi e-mails + contacts (secret, clé du compte Resend REGAFY) |
| `CONFIRM_SECRET` | Clé HMAC des liens de confirmation (secret, générer 32+ octets aléatoires) |
| `FROM_ADDR` | Expéditeur (défaut `La Dépêche RA <depeche@regafy.com>`) |
| `SITE_URL` | Origine publique pour les liens e-mail (défaut : origine de la requête) |

## Test local

```
cd regafy && npx wrangler pages dev public
```

Sert le site + les Functions sur http://localhost:8788 (sans les env, `/api/subscribe` → 503 attendu).

## Reste à faire avant mise en ligne publique

1. Recette CEO du contenu (10 questions — 2/3/4/9 relèvent de la connaissance générale, à valider).
2. Renseigner les variables d'environnement ci-dessus (+ vérifier le domaine d'envoi dans Resend).
3. Attacher `regafy.com` au projet Pages.
4. Turnstile sur les formulaires (le honeypot suffit pour la recette, pas pour la durée).
