-- create_org_rate_limit.test.sql — Garde anti-abus de create_org (migration 0015).
-- Vérifie qu'un utilisateur authentifié peut créer 3 organisations en 24 h, pas une de plus.
-- Même pattern que rls_isolation.test.sql : claim JWT `sub` + rôle authenticated.

begin;
select plan(2);

-- Utilisateur frais, sans aucune organisation (le trigger crée son profile).
insert into auth.users (instance_id, id, aud, role, email)
values
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-00000000000d', 'authenticated', 'authenticated', 'd@pharnos.test');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000d"}', true);

-- 3 créations dans la fenêtre de 24 h : toutes doivent passer.
select public.create_org('Org D1');
select public.create_org('Org D2');
select public.create_org('Org D3');

select is(
  (select count(*)::int from public.memberships
    where user_id = '00000000-0000-0000-0000-00000000000d' and role = 'admin'),
  3,
  'create_org : 3 créations en 24 h passent'
);

-- La 4e est rejetée (raise exception → SQLSTATE P0001).
select throws_ok(
  $$ select public.create_org('Org D4') $$,
  'P0001',
  null,
  'create_org : la 4e création en 24 h est bloquée (rate limit)'
);

reset role;
select * from finish();
rollback;
