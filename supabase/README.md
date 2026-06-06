# Supabase (Pharnos)

Backend managé : Postgres + Auth + Storage + RLS + Edge Functions.

## Schéma

Les migrations SQL sont dans [`migrations/`](migrations/). `0001_init.sql` pose le socle
**multi-tenant + RLS** (organisations, profils, appartenances) — fondation de l'isolation
des données par organisation (confidentialité pharma).

## Brancher le projet (quand les clés sont prêtes)

```bash
# 1. Installer la CLI : https://supabase.com/docs/guides/cli
# 2. Lier au projet distant (PROJECT_REF dans l'URL du dashboard)
supabase link --project-ref <PROJECT_REF>
# 3. Appliquer les migrations
supabase db push
```

## Secrets serveur (jamais dans le bundle client)

Les secrets (clé service_role, identifiants Vertex AI) vivent côté Edge Functions :

```bash
supabase secrets set GOOGLE_VERTEX_PROJECT=... GOOGLE_VERTEX_LOCATION=europe-west1
```

> ⚠️ Le client ne reçoit QUE `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY`.
> Tout le reste reste serveur.
