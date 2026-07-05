-- retention_purge_cron.test.sql — Purge de rétention de la corbeille (migration 0054, LOT 9).
--
-- La purge elle-même (Storage + enfants + squelette tombstone) vit côté Edge
-- (supabase/functions/retention-purge). Ici on prouve la PLOMBERIE + les garde-fous SQL :
--   1. la colonne `purged_at` et son index partiel de scan existent ;
--   2. le job nocturne est programmé (nom stable, horaire attendu, décalé des relances) ;
--   3. le job ne contient AUCUN secret en clair : il lit Vault à l'exécution ;
--   4. `purged_at` est server-managed : un membre authentifié ne peut PAS le poser lui-même
--      (sinon la purge réelle saute — fichiers jamais nettoyés).

begin;
select plan(12);

select has_column('public', 'dossiers', 'purged_at', 'colonne dossiers.purged_at posée');

select ok(
  exists(
    select 1 from pg_indexes
    where schemaname = 'public' and indexname = 'dossiers_trash_purge_idx'
  ),
  'index partiel de scan de la corbeille présent'
);

select ok(
  exists(select 1 from cron.job where jobname = 'retention-purge'),
  'job cron « retention-purge » programmé'
);

select is(
  (select schedule from cron.job where jobname = 'retention-purge'),
  '37 5 * * *',
  'horaire quotidien 05:37 UTC (décalé des relances 05:17)'
);

-- Anti-régression sécurité : la commande du job référence Vault (pas de littéral de secret).
select ok(
  (select command from cron.job where jobname = 'retention-purge')
    like '%vault.decrypted_secrets%',
  'les secrets du job sont lus dans Vault à l''exécution'
);

-- Trigger de protection : présent, et la fonction n'est pas exécutable en RPC.
select has_function('public', 'protect_dossier_purged_at', 'fonction trigger protect_dossier_purged_at présente');
select has_trigger('public', 'dossiers', 'protect_dossier_purged_at_trg', 'trigger anti-écriture client posé');
select ok(
  not has_function_privilege('authenticated', 'public.protect_dossier_purged_at()', 'execute'),
  'authenticated ne peut pas exécuter la fonction trigger en RPC'
);

-- 4) purged_at server-managed : un membre de l'org (JWT authenticated) NE peut PAS le poser.
--    Fixture : org + membership + dossier supprimé (corbeille), puis tentative d'update.
--    En prod, PostgREST pose TOUJOURS le claim `role` — le test le reproduit (lu par auth.role()).
insert into auth.users (instance_id, id, aud, role, email)
values ('00000000-0000-0000-0000-000000000000', 'a0000000-0000-4000-8000-000000000001',
        'authenticated', 'authenticated', 'purge-test@pharnos.test');

insert into public.orgs (id, name)
values ('b0000000-0000-4000-8000-000000000001', 'Org purge test');

insert into public.memberships (org_id, user_id, role)
values ('b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'admin');

insert into public.dossiers (id, org_id, product_name, format, activity, country, status, deleted_at)
values ('c0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001',
        'Brouillon corbeille', 'ctd', 'new_ma', 'SN', 'draft', now());

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"a0000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

select throws_ok(
  $$ update public.dossiers
       set purged_at = now()
     where id = 'c0000000-0000-4000-8000-000000000001' $$,
  'purged_at is server-managed (retention purge)',
  'un membre authentifié ne peut pas poser purged_at (purge = serveur uniquement)'
);

reset role;
select set_config('request.jwt.claims', null, true);

-- Le même update en rôle propriétaire (SQL direct, auth.role() NULL) passe : réparation manuelle possible.
update public.dossiers
   set purged_at = now()
 where id = 'c0000000-0000-4000-8000-000000000001';
select ok(
  (select purged_at is not null from public.dossiers
    where id = 'c0000000-0000-4000-8000-000000000001'),
  'le rôle propriétaire (SQL direct) peut poser purged_at (réparation/ops)'
);

-- 5) Tombstone purgé = TERMINAL côté API : l'upsert d'un appareil retardataire (deleted_at → null,
--    contenu re-rempli) est NEUTRALISÉ sans erreur (l'outbox client se draine, le squelette reste).
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"a0000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

select lives_ok(
  $$ update public.dossiers
       set deleted_at = null, product_name = 'Zombie ressuscité', tree = '[{"id":"n1"}]'::jsonb
     where id = 'c0000000-0000-4000-8000-000000000001' $$,
  'l''écriture retardataire d''un client sur un tombstone purgé ne lève PAS d''erreur (no-op silencieux)'
);

reset role;
select set_config('request.jwt.claims', null, true);

select ok(
  (select deleted_at is not null and product_name = 'Brouillon corbeille' and tree = '[]'::jsonb
     from public.dossiers where id = 'c0000000-0000-4000-8000-000000000001'),
  'le tombstone purgé est resté intact (pas de résurrection : deleted_at, nom et arbre inchangés)'
);

select * from finish();
rollback;
