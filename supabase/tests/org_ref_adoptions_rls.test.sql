-- org_ref_adoptions_rls.test.sql — Adoption du référentiel par org (migration 0072, P4.2).
--
-- Prouve les trois promesses du consentement tracé :
--   1) isolation tenant (une org ne voit pas les adoptions d'une autre) ;
--   2) écriture IMPOSSIBLE côté client (aucune policy) — l'unique chemin est le RPC ;
--   3) RPC : ADMIN seul, version PUBLIÉE seule, idempotent, audité.
-- Piège pgTAP rappelé : UPDATE/DELETE sans policy ne lèvent RIEN (0 ligne visible) → on prouve
-- le contenu INCHANGÉ, pas une exception.

begin;
select plan(12);

insert into auth.users (instance_id, id, aud, role, email)
values
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000c1', 'authenticated', 'authenticated', 'refadmin@pharnos.test'),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000c2', 'authenticated', 'authenticated', 'refreader@pharnos.test'),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000c3', 'authenticated', 'authenticated', 'refother@pharnos.test');

insert into public.orgs (id, name)
values
  ('00000000-0000-0000-0000-00000000ca01', 'Org RefA'),
  ('00000000-0000-0000-0000-00000000cb02', 'Org RefB');

insert into public.memberships (org_id, user_id, role)
values
  ('00000000-0000-0000-0000-00000000ca01', '00000000-0000-0000-0000-0000000000c1', 'admin'),
  ('00000000-0000-0000-0000-00000000ca01', '00000000-0000-0000-0000-0000000000c2', 'reviewer'),
  ('00000000-0000-0000-0000-00000000cb02', '00000000-0000-0000-0000-0000000000c3', 'admin');

-- Une version publiée et un brouillon (le seed 0071 v2026.1 existe aussi en base de test).
insert into public.ref_versions (id, label, status, published_at)
values
  ('00000000-0000-0000-0000-0000000000f2', 'vtest-pub2', 'published', now()),
  ('00000000-0000-0000-0000-0000000000d2', 'vtest-draft2', 'draft', null);

-- ----------------------------------------------------------------------------
-- Éditeur/Lecteur (rôle `reviewer`) : lit, mais n'adopte PAS
-- ----------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c2"}', true);

select throws_ok(
  $$ select public.adopt_ref_version('00000000-0000-0000-0000-0000000000f2',
                                     '00000000-0000-0000-0000-00000000ca01') $$,
  '42501',
  null,
  'un NON-admin ne peut pas adopter (décision CEO : admin seul)'
);
select throws_ok(
  $$ insert into public.org_ref_adoptions (org_id, version_id)
     values ('00000000-0000-0000-0000-00000000ca01', '00000000-0000-0000-0000-0000000000f2') $$,
  '42501',
  null,
  'aucune policy d''insert : un client ne peut pas s''auto-adopter une version'
);

-- ----------------------------------------------------------------------------
-- Admin de l'org A
-- ----------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c1"}', true);

select throws_ok(
  $$ select public.adopt_ref_version('00000000-0000-0000-0000-0000000000d2',
                                     '00000000-0000-0000-0000-00000000ca01') $$,
  '42501',
  null,
  'on ne peut JAMAIS adopter un brouillon (garde serveur, pas seulement le filtre client)'
);
select throws_ok(
  $$ select public.adopt_ref_version('00000000-0000-0000-0000-0000000000f2',
                                     '00000000-0000-0000-0000-00000000cb02') $$,
  '42501',
  null,
  'un admin ne peut pas adopter POUR une autre org (p_org vérifié membre)'
);
select lives_ok(
  $$ select public.adopt_ref_version('00000000-0000-0000-0000-0000000000f2',
                                     '00000000-0000-0000-0000-00000000ca01') $$,
  'l''admin adopte une version publiée de SON org'
);
select lives_ok(
  $$ select public.adopt_ref_version('00000000-0000-0000-0000-0000000000f2',
                                     '00000000-0000-0000-0000-00000000ca01') $$,
  'ré-adopter est idempotent (double clic, deux onglets, rejeu réseau)'
);
select is(
  (select count(*)::int from public.org_ref_adoptions
   where org_id = '00000000-0000-0000-0000-00000000ca01'),
  1,
  'une seule ligne d''adoption malgré le rejeu'
);
select is(
  (select adopted_by_email from public.org_ref_adoptions
   where org_id = '00000000-0000-0000-0000-00000000ca01'),
  'refadmin@pharnos.test',
  'la trace nomme QUI a adopté (journal du consentement)'
);
select is(
  (select count(*)::int from public.audit_log
   where org_id = '00000000-0000-0000-0000-00000000ca01' and action = 'adopt'
     and entity = 'ref_version'),
  1,
  'l''adoption est journalisée à l''audit dans la même transaction'
);

-- Écritures directes : silencieuses (aucune policy) — la preuve est le contenu intact.
select lives_ok(
  $$ delete from public.org_ref_adoptions
     where org_id = '00000000-0000-0000-0000-00000000ca01' $$,
  'DELETE sans policy : silencieux (0 ligne touchée)'
);

-- ----------------------------------------------------------------------------
-- Isolation tenant : l'admin de B ne voit pas l'adoption de A
-- ----------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c3"}', true);
select is(
  (select count(*)::int from public.org_ref_adoptions),
  0,
  'Org RefB ne voit AUCUNE adoption d''Org RefA'
);

reset role;
select is(
  (select count(*)::int from public.org_ref_adoptions
   where org_id = '00000000-0000-0000-0000-00000000ca01'),
  1,
  'la trace d''adoption a survécu au DELETE client (journal append-only)'
);

select * from finish();
rollback;
