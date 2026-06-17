-- compilation_metering.test.sql — P1/M1 (migration 0039) : quota à la COMPILATION.
--
-- Prouve record_compilation : garde fail-closed (refus au plafond, aucune insertion sur refus),
-- override d'org, plan illimité (enterprise), et que anon ne peut pas l'appeler.

begin;
select plan(9);

insert into auth.users (instance_id, id, aud, role, email) values
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000ca', 'authenticated', 'authenticated', 'ca@pharnos.test'),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000cb', 'authenticated', 'authenticated', 'cb@pharnos.test');

insert into public.orgs (id, name) values
  ('00000000-0000-0000-0000-0000000000c1', 'Org C1'),   -- free : 1 compilation / mois (seed 0039)
  ('00000000-0000-0000-0000-0000000000c2', 'Org C2');
update public.orgs set plan = 'enterprise' where id = '00000000-0000-0000-0000-0000000000c2';

insert into public.memberships (org_id, user_id, role) values
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000ca', 'admin'),
  ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000cb', 'admin');

-- anon : record_compilation non appelable (execute révoqué)
set local role anon;
select set_config('request.jwt.claims', '', true);
select throws_ok(
  'select public.record_compilation(null, ''m1_pdf'')', '42501', null,
  'anon ne peut PAS appeler record_compilation');

-- free (cap 1/mois) : 1re autorisée, 2e refusée, et le refus n'insère RIEN
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000ca"}', true);
select is((public.record_compilation(null, 'm1_pdf') ->> 'allowed')::boolean, true,
  'free : 1re compilation autorisée');
select is((select count(*)::int from public.compilations where org_id = '00000000-0000-0000-0000-0000000000c1'), 1,
  'ledger : 1 compilation enregistrée');
select is(public.record_compilation(null, 'm1_pdf') ->> 'reason', 'quota_exceeded',
  'free : 2e compilation refusée (cap 1)');
select is((select count(*)::int from public.compilations where org_id = '00000000-0000-0000-0000-0000000000c1'), 1,
  'ledger : refus → AUCUNE insertion (fail-closed)');

-- override cap = 3 : 2 de plus autorisées (total 3), la 4e refusée
reset role;
insert into public.org_quota_override (org_id, max_compilations)
values ('00000000-0000-0000-0000-0000000000c1', 3);
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000ca"}', true);
select is((public.record_compilation(null, 'm1_pdf') ->> 'allowed')::boolean, true,
  'override 3 : 2e compilation autorisée');
select is((public.record_compilation(null, 'm1_pdf') ->> 'allowed')::boolean, true,
  'override 3 : 3e compilation autorisée');
select is(public.record_compilation(null, 'm1_pdf') ->> 'reason', 'quota_exceeded',
  'override 3 : 4e compilation refusée');

-- enterprise : cap NULL = illimité
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000cb"}', true);
select is((public.record_compilation(null, 'm1_pdf') ->> 'allowed')::boolean, true,
  'enterprise : illimité → autorisé');

select * from finish();
rollback;
