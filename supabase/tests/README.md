# Tests de sécurité — RLS / isolation multi-tenant (pgTAP)

L'isolation par organisation via **Row Level Security** est le pilier de la confidentialité des
données pharma. Ces tests prouvent qu'**une organisation ne voit jamais les données d'une autre**,
et qu'une **signature** n'est lisible que par son propriétaire.

## Fichiers

- `rls_isolation.test.sql` — isolation inter-organisations (`products`, `documents`), branding
  partagé vs **signature owner-only** (`pro_settings`), et blocage RLS d'une écriture cross-org.

## Exécuter

Nécessite **Docker** (Postgres local éphémère). Le CLI applique les migrations puis lance pgTAP :

```bash
supabase test db
```

> Non câblé dans la CI principale (pas de base de données dans le job). Peut être ajouté à un job
> CI dédié avec un service Postgres + extension `pgtap` (suivi M8).

## Principe

On simule l'utilisateur connecté avec le rôle `authenticated` et le claim JWT `sub`
(lu par `auth.uid()`), exactement comme une requête PostgREST authentifiée. Le seeding est fait
en superuser (la RLS ne s'y applique pas), puis chaque assertion s'exécute sous l'identité d'un
utilisateur donné.
