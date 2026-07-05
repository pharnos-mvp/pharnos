-- admin_audit.test.sql — RPC journal complet de la console admin (migration 0053, LOT 8b).
--
-- La pagination/le filtre sont du SQL déclaratif simple ; l'enjeu de sécurité est le VERROU
-- des privilèges : audit_log est cross-org via cette RPC → si anon/authenticated pouvaient
-- l'exécuter, n'importe quel compte lirait le journal de TOUTES les organisations.

begin;
select plan(5);

select has_function(
  'public', 'admin_audit', array['int4', 'timestamptz', 'uuid', 'uuid'],
  'RPC admin_audit présente (journal complet paginé)'
);

select ok(
  not has_function_privilege('anon', 'public.admin_audit(int, timestamptz, uuid, uuid)', 'execute'),
  'anon ne peut PAS exécuter admin_audit (données cross-org)'
);
select ok(
  not has_function_privilege('authenticated', 'public.admin_audit(int, timestamptz, uuid, uuid)', 'execute'),
  'authenticated ne peut PAS exécuter admin_audit (le gate est l''Edge is_platform_admin)'
);
select ok(
  has_function_privilege('service_role', 'public.admin_audit(int, timestamptz, uuid, uuid)', 'execute'),
  'service_role exécute admin_audit (Edge admin uniquement)'
);

-- L'index du parcours global (at desc, id desc) existe — le keyset ne seq-scan pas à volume.
select ok(
  exists(select 1 from pg_indexes where schemaname = 'public' and indexname = 'audit_log_at_id_idx'),
  'index audit_log_at_id_idx posé (tri global du journal)'
);

select * from finish();
rollback;
