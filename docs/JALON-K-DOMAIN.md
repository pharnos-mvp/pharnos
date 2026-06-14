# Jalon K — Branchement du domaine (pharnos.com + app.pharnos.com)

> Topologie validée CEO : **pharnos.com = landing** (statique) · **app.pharnos.com = application**.
> Coût : domaine ~12 $/an (seule dépense). Tout le reste reste à **0 €** (Cloudflare Pages gratuit).
> ⚠️ **Ordre important** : autoriser le nouveau domaine côté Edge + Supabase **AVANT** d'envoyer des
> utilisateurs sur app.pharnos.com, sinon login/correspondance cassent.

## Pré-requis
- **pharnos.com possédé** et son **DNS géré par Cloudflare** (déjà le cas : domaine vérifié côté Resend).
- 2 projets Cloudflare Pages : `pharnos` (app, existant) et `pharnos-landing` (landing, créé en §1).

## 1. Déployer la landing comme 2ᵉ projet Pages *(CTO)*
```bash
# depuis la racine du repo (wrangler authentifié sur la machine)
npx wrangler pages deploy landing --project-name pharnos-landing --branch main
```
→ donne une URL `https://pharnos-landing.pages.dev` pour recette **avant** le DNS.

## 2. Custom domains Cloudflare Pages *(CEO — dashboard)*
1. **Workers & Pages → `pharnos` (app) → Custom domains → Set up a custom domain** → `app.pharnos.com`
   (Cloudflare crée le CNAME automatiquement si le DNS de pharnos.com est sur Cloudflare).
2. **Workers & Pages → `pharnos-landing` → Custom domains** → `pharnos.com` (apex) **et** `www.pharnos.com`
   (rediriger www → apex, au choix).

## 3. Autoriser app.pharnos.com côté backend *(AVANT d'annoncer le domaine)*
- **Supabase → Authentication → URL Configuration** *(CEO — dashboard)* :
  - **Site URL** = `https://app.pharnos.com`
  - **Redirect URLs** : ajouter `https://app.pharnos.com/**` (garder `https://pharnos.pages.dev/**` et
    `https://*.pharnos.pages.dev/**` pour les previews). → e-mails d'inscription / reset pointent vers app.pharnos.com.
- **Edge Functions CORS** *(CTO, sur GO CEO — `supabase functions deploy`)* : `_shared/cors.ts` autorise
  désormais `https://app.pharnos.com` (déjà en code + test). Redéployer les fonctions pour qu'app.pharnos.com
  puisse appeler `share`/`translate`/`regafy-ai`/`upgrade` :
  ```bash
  supabase functions deploy share translate regafy-ai upgrade
  ```
  *(La canonical URL des e-mails de correspondance suit automatiquement l'origine validée → app.pharnos.com.)*

## 4. Build de l'app avec le bon domaine
Le build front actuel ne code en dur aucun domaine d'app (routing relatif). Aucun changement requis ; au
prochain `deploy.yml` (push main) l'app sur app.pharnos.com sert le bundle normal. Vérifier que les
variables `VITE_*` (secrets GitHub) restent inchangées.

## 5. Recette (sur les vrais domaines)
- **pharnos.com** : landing charge, **Lighthouse perf/a11y ≥ 95**, toggle FR/EN, CTA « Essayer » → app.pharnos.com.
- **app.pharnos.com** : login OK (Supabase Auth) ; Dashboard ; **envoi d'une correspondance** (Edge `share`
  CORS depuis app.pharnos.com → 200) ; l'e-mail reçu a son bouton « Ouvrir le dossier » pointant vers
  `https://app.pharnos.com/r/…`.
- `https://pharnos.pages.dev` reste fonctionnel (fallback + previews).

## Ordre recommandé
§1 (deploy landing) → §3 (Supabase Auth URLs + deploy Edge cors) → §2 (custom domains) → §5 (recette).
Tant que §3 n'est pas fait, **ne pas** diriger d'utilisateurs vers app.pharnos.com.

## Rollback
Retirer les custom domains des projets Pages → l'app reste servie sur `pharnos.pages.dev` (toujours
autorisée côté CORS/Auth). Aucune perte de données (DNS/branchement uniquement).
