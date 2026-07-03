-- explicit_org_rpcs.test.sql — CS1 : attribution d'org explicite sur les RPC self-scopés (0049).
--
-- Le bug corrigé : caller_org_id() = plus ANCIENNE org du user → pour un utilisateur multi-org
-- (agence servant plusieurs labos), l'usage IA/compilations et les entitlements étaient imputés
-- à la mauvaise org. Prouve que :
--   1. p_org null   = comportement héritage intact (plus ancienne org) — bundles déployés OK ;
--   2. p_org fourni = l'org EXPLICITE est servie/facturée ;
--   3. p_org non-membre = REFUS (fail-closed), jamais de fallback silencieux ;
--   4. caller_org_id(uuid) reste interne (revoked pour authenticated).

begin;
select plan(13);

-- ── Seeding ──────────────────────────────────────────────────────────────────
insert into auth.users (instance_id, id, aud, role, email)
values ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000cc', 'authenticated', 'authenticated', 'multi-org@pharnos.test');

insert into public.orgs (id, name, plan)
values
  ('00000000-0000-0000-0000-0000000000e1', 'Org Ancienne', 'free'),
  ('00000000-0000-0000-0000-0000000000e2', 'Org Récente', 'pro'),
  ('00000000-0000-0000-0000-0000000000e3', 'Org Étrangère', 'free');

-- Membre des orgs 1 (la plus ancienne) et 2 — PAS de la 3. created_at explicites :
-- dans une même transaction now() est identique, le tri « plus ancienne » serait indéterminé.
insert into public.memberships (org_id, user_id, role, created_at)
values
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000cc', 'admin', now() - interval '2 days'),
  ('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000cc', 'admin', now() - interval '1 day');

-- Un dossier dans l'org 2 (cible d'une compilation imputée explicitement).
insert into public.dossiers (id, org_id, product_name, format, activity, country)
values ('d0000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000e2', 'Amoxi 500', 'ctd', 'enregistrement', 'CI');

-- Feature Regafy activée sur les plans testés (la garde d'offre est hors sujet ici).
update public.plan_limits set features = coalesce(features, '{}'::jsonb) || '{"regafy":"enabled"}'::jsonb
where plan in ('free', 'pro');

-- ── En tant qu'utilisateur multi-org ─────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000cc"}', true);

-- 1) Héritage : sans p_org, la plus ancienne org est servie (bundles déployés intacts).
select is(
  (public.my_org_plan() ->> 'plan'),
  'free',
  'my_org_plan() sans p_org : héritage = plus ancienne org (free)'
);

-- 2) Explicite : l'org demandée est servie.
select is(
  (public.my_org_plan('00000000-0000-0000-0000-0000000000e2') ->> 'plan'),
  'pro',
  'my_org_plan(p_org) : entitlements de l''org EXPLICITE (pro)'
);

-- 3) Fail-closed : org dont on n'est PAS membre → null, jamais de fallback.
select ok(
  public.my_org_plan('00000000-0000-0000-0000-0000000000e3') is null,
  'my_org_plan(org non-membre) : null (fail-closed, pas de fallback silencieux)'
);

-- 4) consume_ai_quota imputée à l'org explicite.
select is(
  (public.consume_ai_quota('regafy', '00000000-0000-0000-0000-0000000000e2') ->> 'allowed'),
  'true',
  'consume_ai_quota(p_org) : gate évaluée sur l''org explicite'
);

-- 5) record_ai_usage : la consommation atterrit dans la BONNE org.
select public.record_ai_usage('regafy', 100, 50, '00000000-0000-0000-0000-0000000000e2');
select is(
  (select count(*)::int from public.ai_usage where org_id = '00000000-0000-0000-0000-0000000000e2'),
  1,
  'record_ai_usage(p_org) : usage imputé à l''org explicite'
);
select is(
  (select count(*)::int from public.ai_usage where org_id = '00000000-0000-0000-0000-0000000000e1'),
  0,
  'record_ai_usage(p_org) : RIEN sur la plus ancienne org (le bug d''avant)'
);

-- 6) record_ai_usage vers une org non-membre : AUCUNE écriture (fail-closed).
select public.record_ai_usage('regafy', 100, 50, '00000000-0000-0000-0000-0000000000e3');
select is(
  (select count(*)::int from public.ai_usage where org_id = '00000000-0000-0000-0000-0000000000e3'),
  0,
  'record_ai_usage(org non-membre) : aucune écriture (fail-closed)'
);

-- 7) record_compilation imputée à l'org explicite.
select is(
  (public.record_compilation('d0000000-0000-0000-0000-0000000000e2', 'm1_pdf',
     '00000000-0000-0000-0000-0000000000e2') ->> 'allowed'),
  'true',
  'record_compilation(p_org) : compilation autorisée sur l''org explicite'
);
select is(
  (select count(*)::int from public.compilations where org_id = '00000000-0000-0000-0000-0000000000e2'),
  1,
  'record_compilation(p_org) : compteur incrémenté sur l''org explicite'
);
select is(
  (select count(*)::int from public.compilations where org_id = '00000000-0000-0000-0000-0000000000e1'),
  0,
  'record_compilation(p_org) : RIEN sur la plus ancienne org'
);

-- 8) set_org_sync sur l'org explicite (admin des deux).
select public.set_org_sync(false, '00000000-0000-0000-0000-0000000000e2');
select is(
  (select sync_enabled from public.orgs where id = '00000000-0000-0000-0000-0000000000e2'),
  false,
  'set_org_sync(p_org) : bascule l''org explicite'
);
select is(
  (select sync_enabled from public.orgs where id = '00000000-0000-0000-0000-0000000000e1'),
  true,
  'set_org_sync(p_org) : la plus ancienne org n''est PAS touchée'
);

-- 9) caller_org_id(uuid) : fonction interne, inaccessible à authenticated.
select throws_ok(
  $$ select public.caller_org_id('00000000-0000-0000-0000-0000000000e2'::uuid) $$,
  '42501',
  null,
  'caller_org_id(uuid) : execute révoqué pour authenticated (interne)'
);

select * from finish();
rollback;
