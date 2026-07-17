-- create_org_rate_limit.test.sql — Garde anti-abus de la création d'org (0015, portée par 0063).
-- Depuis 0063 (accès sur invitation), la porte vivante est create_org_onboarding/3 : on vérifie
-- qu'un utilisateur muni d'un code valide crée 3 organisations en 24 h, pas une de plus, et que
-- le legacy create_org est définitivement fermé.

begin;
select plan(3);

-- Utilisateur frais + un code d'invitation à large quota (seedé en superuser, bypass RLS).
insert into auth.users (instance_id, id, aud, role, email)
values
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-00000000000d', 'authenticated', 'authenticated', 'd@pharnos.test');
insert into public.platform_invites (code, label, max_uses)
values ('RATE-TEST', 'Expert Rate Test', 100);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000d"}', true);

-- 3 créations dans la fenêtre de 24 h : toutes doivent passer.
select public.create_org_onboarding('Org D1', 'free', 'RATE-TEST');
select public.create_org_onboarding('Org D2', 'free', 'RATE-TEST');
select public.create_org_onboarding('Org D3', 'free', 'RATE-TEST');

select is(
  (select count(*)::int from public.memberships
    where user_id = '00000000-0000-0000-0000-00000000000d' and role = 'admin'),
  3,
  'create_org_onboarding : 3 créations en 24 h passent (code valide)'
);

-- La 4e est refusée (refus RETOURNÉ — cf. contrat jsonb de 0063), MÊME avec un code valide.
select is(
  public.create_org_onboarding('Org D4', 'free', 'RATE-TEST') ->> 'error',
  'rate_limited',
  'create_org_onboarding : la 4e création en 24 h est bloquée (rate limit)'
);

-- Le legacy create_org est une porte fermée (0063) — plus aucune création possible par ce chemin.
select throws_ok(
  $$ select public.create_org('Org legacy') $$,
  'P0403',
  null,
  'create_org legacy : porte fermée (accès sur invitation)'
);

reset role;
select * from finish();
rollback;
