-- lifecycle_reminders_cron.test.sql — Relances automatiques (migration 0050, LOT 10).
--
-- La dérivation « qui relancer » est testée en pur côté Edge (Deno,
-- supabase/functions/_shared/lifecycle-reminders-core.test.ts). Ici on prouve la PLOMBERIE :
--   1. les extensions pg_cron + pg_net sont posées ;
--   2. le job nocturne est programmé (nom stable, horaire attendu) ;
--   3. le job ne contient AUCUN secret en clair : il lit Vault à l'exécution.

begin;
select plan(9);

select has_extension('pg_cron', 'extension pg_cron posée');
select has_extension('pg_net', 'extension pg_net posée');

select ok(
  exists(select 1 from cron.job where jobname = 'lifecycle-auto-reminders'),
  'job cron « lifecycle-auto-reminders » programmé'
);

select is(
  (select schedule from cron.job where jobname = 'lifecycle-auto-reminders'),
  '17 5 * * *',
  'horaire quotidien 05:17 UTC'
);

-- Anti-régression sécurité : la commande du job référence Vault (pas de littéral de secret).
select ok(
  (select command from cron.job where jobname = 'lifecycle-auto-reminders')
    like '%vault.decrypted_secrets%',
  'les secrets du job sont lus dans Vault à l''exécution'
);

-- RPC hash du secret (0051) : présente, et réservée au service-role — anon/authenticated NE
-- peuvent PAS lire le hash (le secret reste indéductible, mais le hash n'a rien à faire dehors).
select has_function('public', 'lifecycle_cron_secret_hash', 'RPC lifecycle_cron_secret_hash présente');
select ok(
  not has_function_privilege('anon', 'public.lifecycle_cron_secret_hash()', 'execute'),
  'anon ne peut pas exécuter la RPC hash'
);
select ok(
  not has_function_privilege('authenticated', 'public.lifecycle_cron_secret_hash()', 'execute'),
  'authenticated ne peut pas exécuter la RPC hash'
);
select ok(
  has_function_privilege('service_role', 'public.lifecycle_cron_secret_hash()', 'execute'),
  'service_role exécute la RPC hash (Edge lifecycle-reminders)'
);

select * from finish();
rollback;
