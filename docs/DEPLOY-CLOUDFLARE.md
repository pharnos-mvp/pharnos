# Déploiement front — intégration Git native Cloudflare Pages

> Décision (Correspondance v2, 2026-06-12) : le quota GitHub Actions Free (2000 min/mois) est
> épuisé → le deploy sort des Actions. Cloudflare Pages build et déploie **directement depuis le
> repo GitHub** avec ses **propres** minutes (Free : 500 builds/mois, indépendantes de GitHub).
> `deploy.yml` ne reste qu'en fallback manuel (`workflow_dispatch`) ; la CI est PR-only.

## Branchement (une fois, dashboard Cloudflare — action CEO, ~5 min)

1. https://dash.cloudflare.com → **Workers & Pages** → projet **pharnos** → **Settings → Builds & deployments**
   (si le projet actuel a été créé en « Direct Upload » et ne propose pas la connexion Git :
   créer un projet Pages → **Connect to Git** → choisir `pharnos-mvp/pharnos`, puis transférer le
   nom/domaine — Cloudflare guide la migration).
2. **Production branch** : `main`.
3. **Build configuration** :
   - Build command : `npm install --no-audit --no-fund && npm run build`
   - Build output directory : `web/dist`
   - Root directory : `web`
4. **Environment variables** (Production) :
   - `VITE_SUPABASE_URL` = `https://uhsireqwzqqymgsxuvqh.supabase.co`
   - `VITE_SUPABASE_ANON_KEY` = (clé anon — la même que le secret repo GitHub)
   - `VITE_SENTRY_DSN` = (optionnel)
   - `NODE_VERSION` = `24`
5. Sauvegarder → **Retry deployment** (ou pousser un commit sur `main`) → vérifier
   https://pharnos.pages.dev.

## Comportement après branchement

- Chaque push sur `main` → build + deploy **prod** par Cloudflare (zéro minute GitHub).
- Chaque PR → **Preview deployment** Cloudflare automatique (URL `<hash>.pharnos.pages.dev`,
  déjà couverte par la whitelist CORS des Edge Functions).
- Les builds n'exécutent PAS les tests : la qualité reste garantie par la CI GitHub sur PR
  (typecheck/lint/tests/e2e/lighthouse/rls) — à la racine du quota restauré chaque mois.

## Dépannage local (si Cloudflare build indisponible)

```bash
cd web && npm run build
npx wrangler pages deploy dist --project-name pharnos --branch main
```
(wrangler est authentifié sur la machine du CEO.)
