-- lifecycle_reminders_cron.test.sql — Relances automatiques (migration 0050, LOT 10).
--
-- La dérivation « qui relancer » est testée en pur côté Edge (Deno,
-- supabase/functions/_shared/lifecycle-reminders-core.test.ts). Ici on prouve la PLOMBERIE :
--   1. les extensions pg_cron + pg_net sont posées ;
--   2. le job nocturne est programmé (nom stable, horaire attendu) ;
--   3. le job ne contient AUCUN secret en clair : il lit Vault à l'exécution.

begin;
select plan(5);

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

select * from finish();
rollback;
