-- org_ref_adoptions_rls.test.sql — Adoption du référentiel par org (migration 0072, P4.2).
--
-- Prouve les trois promesses du consentement tracé :
--   1) isolation tenant (une org ne voit pas les adoptions d'une autre) ;
--   2) écriture IMPOSSIBLE côté client (aucune policy) — l'unique chemin est le RPC ;
--   3) RPC : ADMIN seul, version PUBLIÉE seule, idempotent, audité.
-- Piège pgTAP rappelé : UPDATE/DELETE sans policy ne lèvent RIEN (0 ligne visible) → on prouve
-- le contenu INCHANGÉ, pas une exception.
-- NB 0075 : créer une org AUTO-ADOPTE la dernière version publiée (trigger orgs_auto_adopt_ref)
-- → chaque assertion cible explicitement la version du test (jamais un count brut par org).

begin;
select plan(16);

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
   where org_id = '00000000-0000-0000-0000-00000000ca01'
     and version_id = '00000000-0000-0000-0000-0000000000f2'),
  1,
  'une seule ligne d''adoption malgré le rejeu'
);
select is(
  (select adopted_by_email from public.org_ref_adoptions
   where org_id = '00000000-0000-0000-0000-00000000ca01'
     and version_id = '00000000-0000-0000-0000-0000000000f2'),
  'refadmin@pharnos.test',
  'la trace nomme QUI a adopté (journal du consentement)'
);
-- Une SEULE trace malgré le rejeu : l'`on conflict` protège la table, la garde `if not found`
-- protège le JOURNAL (un consentement déjà donné ne se re-journalise pas).
select is(
  (select count(*)::int from public.audit_log
   where org_id = '00000000-0000-0000-0000-00000000ca01' and action = 'adopt'
     and entity = 'ref_version'
     and entity_id = '00000000-0000-0000-0000-0000000000f2'),
  1,
  'l''adoption est journalisée UNE fois à l''audit, dans la même transaction'
);

-- Écritures directes : silencieuses (aucune policy) — la preuve est le contenu intact.
select lives_ok(
  $$ update public.org_ref_adoptions set version_id = '00000000-0000-0000-0000-0000000000d2'
     where org_id = '00000000-0000-0000-0000-00000000ca01' $$,
  'UPDATE sans policy : silencieux (0 ligne touchée)'
);
select lives_ok(
  $$ delete from public.org_ref_adoptions
     where org_id = '00000000-0000-0000-0000-00000000ca01' $$,
  'DELETE sans policy : silencieux (0 ligne touchée)'
);

-- ----------------------------------------------------------------------------
-- Côté POSITIF : sans lui, une régression de `current_user_org_ids()` passerait
-- inaperçue — le client retomberait au socle en SILENCE (panne muette).
-- ----------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c2"}', true);
select is(
  (select count(*)::int from public.org_ref_adoptions
   where org_id = '00000000-0000-0000-0000-00000000ca01'
     and version_id = '00000000-0000-0000-0000-0000000000f2'),
  1,
  'un membre NON scopé LIT l''adoption de son org (le plafond se calcule côté client)'
);

-- CS1 : un membre SCOPÉ (agence invitée sur des dossiers précis) ne lit pas la config de l'org.
reset role;
insert into public.membership_scopes (org_id, user_id, dossier_ids)
values ('00000000-0000-0000-0000-00000000ca01', '00000000-0000-0000-0000-0000000000c2',
        array['00000000-0000-0000-0000-0000000000e9']::uuid[]);
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c2"}', true);
select is(
  (select count(*)::int from public.org_ref_adoptions),
  0,
  'un membre SCOPÉ ne lit AUCUNE adoption (RESTRICTIVE CS1)'
);

-- ----------------------------------------------------------------------------
-- Isolation tenant : l'admin de B ne voit pas l'adoption de A
-- ----------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c3"}', true);
select is(
  (select count(*)::int from public.org_ref_adoptions
   where org_id = '00000000-0000-0000-0000-00000000ca01'),
  0,
  'Org RefB ne voit AUCUNE adoption d''Org RefA (il ne voit que la sienne, auto-adoptée 0075)'
);
-- Côté POSITIF de la même preuve : SANS filtre, l'admin de B voit EXACTEMENT 1 ligne — la
-- sienne (auto-adoption 0075 du seed à la création d'Org RefB). 0 = régression RLS muette,
-- 2+ = fuite cross-org : les deux bords sont couverts.
select is(
  (select count(*)::int from public.org_ref_adoptions),
  1,
  'l''admin de B voit EXACTEMENT sa propre adoption (1 ligne au total, rien de A)'
);

reset role;
select is(
  (select count(*)::int from public.org_ref_adoptions
   where org_id = '00000000-0000-0000-0000-00000000ca01'
     and version_id = '00000000-0000-0000-0000-0000000000f2'),
  1,
  'la trace d''adoption a survécu au DELETE client (journal append-only)'
);

select * from finish();
rollback;
