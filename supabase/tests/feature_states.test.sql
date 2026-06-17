-- feature_states.test.sql — Modèle de features à 3 états (migration 0038).
--
-- Prouve que les gardes serveur lisent l'ÉTAT de `features` (pas un booléen) :
--   consume_ai_quota  : regafy 'teaser'/'hidden' → feature_disabled ; 'enabled' → passe ;
--                       rétro-compat booléenne `true` → passe.
--   create_invitation : team 'teaser' → team_disabled ; 'enabled' (+ sièges) → invitation créée.
-- Vérifie aussi que le reseed 0038 a bien converti les plans canoniques (free=regafy 'teaser', pro 'enabled').

begin;
select plan(10);

-- ── Seed (superuser : contourne la RLS) ──────────────────────────────────────────────────────
insert into auth.users (instance_id, id, aud, role, email)
values ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000fa',
        'authenticated', 'authenticated', 'fs@pharnos.test');

-- Org X sur 'free' (après 0038 : regafy='teaser', team='teaser').
insert into public.orgs (id, name) values ('00000000-0000-0000-0000-0000000000f1', 'Org FS');
insert into public.memberships (org_id, user_id, role)
values ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000fa', 'admin');

-- ── 0) Le reseed 0038 a converti booléen → état sur les plans canoniques ──────────────────────
select is(
  (select features ->> 'regafy' from public.plan_limits where plan = 'free'),
  'teaser',
  'reseed 0038 : free.regafy false → teaser (Vitrine)'
);
select is(
  (select features ->> 'regafy' from public.plan_limits where plan = 'pro'),
  'enabled',
  'reseed 0038 : pro.regafy true → enabled (Activée)'
);
select is(
  (select features ->> 'team' from public.plan_limits where plan = 'pro'),
  'teaser',
  'reseed 0038 : pro.team false → teaser (Vitrine)'
);

-- ── 1) consume_ai_quota lit l'état de regafy ─────────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000fa"}', true);

-- free → regafy 'teaser' → feature_disabled (Vitrine = visible mais pas opérationnelle).
select is(
  public.consume_ai_quota('regafy') ->> 'reason',
  'feature_disabled',
  'regafy=teaser (Vitrine) → feature_disabled'
);

-- Override regafy='hidden' (Masquée) → feature_disabled.
reset role;
insert into public.org_quota_override (org_id, features)
values ('00000000-0000-0000-0000-0000000000f1', '{"regafy":"hidden"}'::jsonb);
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000fa"}', true);
select is(
  public.consume_ai_quota('regafy') ->> 'reason',
  'feature_disabled',
  'regafy=hidden (Masquée) → feature_disabled'
);

-- Override regafy='enabled' (Activée) + cap de tokens → autorisé.
reset role;
update public.org_quota_override
set features = '{"regafy":"enabled"}'::jsonb, monthly_ai_tokens = 100000
where org_id = '00000000-0000-0000-0000-0000000000f1';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000fa"}', true);
select is(
  (public.consume_ai_quota('regafy') ->> 'allowed')::boolean,
  true,
  'regafy=enabled (Activée) + tokens → autorisé'
);

-- Rétro-compat : un override portant encore le BOOLÉEN `true` reste honoré (fenêtre de bascule).
reset role;
update public.org_quota_override
set features = '{"regafy":true}'::jsonb
where org_id = '00000000-0000-0000-0000-0000000000f1';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000fa"}', true);
select is(
  (public.consume_ai_quota('regafy') ->> 'allowed')::boolean,
  true,
  'rétro-compat : regafy=true (booléen) → autorisé'
);

-- ── 2) create_invitation lit l'état de team ──────────────────────────────────────────────────
-- Retour au plan free (team='teaser') en effaçant l'override de features.
reset role;
update public.org_quota_override set features = null
where org_id = '00000000-0000-0000-0000-0000000000f1';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000fa"}', true);
select throws_ok(
  $$select public.create_invitation('00000000-0000-0000-0000-0000000000f1',
      'invitee@pharnos.test'::citext, 'ra_officer'::public.org_role, 'hash_teaser',
      now() + interval '7 days')$$,
  '42501',
  'team_disabled',
  'team=teaser (Vitrine) → team_disabled'
);

-- Override team='enabled' + sièges dispo → invitation créée (retourne un uuid non-null).
reset role;
update public.org_quota_override
set features = '{"team":"enabled"}'::jsonb, max_seats = 5
where org_id = '00000000-0000-0000-0000-0000000000f1';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000fa"}', true);
select isnt(
  public.create_invitation('00000000-0000-0000-0000-0000000000f1',
    'invitee@pharnos.test'::citext, 'ra_officer'::public.org_role, 'hash_enabled',
    now() + interval '7 days'),
  null,
  'team=enabled (Activée) + sièges → invitation créée'
);

-- Rétro-compat de la garde Équipe : le booléen `true` reste honoré (fenêtre de bascule / rollback).
reset role;
update public.org_quota_override set features = '{"team":true}'::jsonb
where org_id = '00000000-0000-0000-0000-0000000000f1';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000fa"}', true);
select isnt(
  public.create_invitation('00000000-0000-0000-0000-0000000000f1',
    'invitee2@pharnos.test'::citext, 'ra_officer'::public.org_role, 'hash_team_bool',
    now() + interval '7 days'),
  null,
  'rétro-compat : team=true (booléen) → invitation créée'
);

select * from finish();
rollback;
