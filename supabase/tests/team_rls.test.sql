-- team_rls.test.sql — Jalon M4 : invitations + rôles effectifs (migration 0023).
--
-- Prouve : 1) anon ne lit aucune invitation ; 2) le 'reviewer' (Lecteur) est RÉELLEMENT lecture
-- seule (écriture bloquée par RLS, lecture OK) tandis que l'admin écrit (zéro régression) ;
-- 3) le flux d'invitation (create admin-only → accept lié à l'e-mail → membership → anti-rejeu) ;
-- 4) team_list réservé aux membres.

begin;
select plan(13);

insert into auth.users (instance_id, id, aud, role, email) values
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000a1', 'authenticated', 'authenticated', 'admin@x.test'),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000a2', 'authenticated', 'authenticated', 'reviewer@x.test'),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000a3', 'authenticated', 'authenticated', 'invitee@x.test'),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000a4', 'authenticated', 'authenticated', 'outsider@x.test');
insert into public.orgs (id, name) values ('00000000-0000-0000-0000-0000000000b1', 'OrgM4');
-- Plan 'team' : la feature « team » est activée (le nouveau 'free' la désactive — jalon O).
update public.orgs set plan = 'team' where id = '00000000-0000-0000-0000-0000000000b1';
insert into public.memberships (org_id, user_id, role) values
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000a1', 'admin'),
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000a2', 'reviewer');

-- 1) anon ne lit aucune invitation
set local role anon;
select set_config('request.jwt.claims', '', true);
select is_empty('select * from public.invitations', 'anon ne lit aucune invitation');

-- 2-3) orgs éditables par rôle
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a2"}', true);
select is((select count(*)::int from public.current_user_editable_org_ids()), 0, 'reviewer : 0 org éditable');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1"}', true);
select is((select count(*)::int from public.current_user_editable_org_ids()), 1, 'admin : 1 org éditable');

-- 4) admin écrit (pas de régression)
select lives_ok(
  $$insert into public.products (org_id, nom_commercial, dci, dosage, forme, presentation, classe_therapeutique, code_atc, titulaire, fabricant, titulaire_adresse, fabricant_adresse)
    values ('00000000-0000-0000-0000-0000000000b1','P','d','1mg','cp','b','c','A01','t','f','ta','fa')$$,
  'admin : insertion de produit autorisée'
);

-- 5-6) reviewer : écriture bloquée (RLS 42501), lecture OK
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a2"}', true);
select throws_ok(
  $$insert into public.products (org_id, nom_commercial, dci, dosage, forme, presentation, classe_therapeutique, code_atc, titulaire, fabricant, titulaire_adresse, fabricant_adresse)
    values ('00000000-0000-0000-0000-0000000000b1','R','d','1mg','cp','b','c','A01','t','f','ta','fa')$$,
  '42501', null, 'reviewer : insertion de produit bloquée par la RLS'
);
select is((select count(*)::int from public.products where org_id='00000000-0000-0000-0000-0000000000b1'), 1, 'reviewer : lecture des produits OK');

-- 7) create_invitation réservé à l'admin (reviewer → 42501)
select throws_ok(
  $$select public.create_invitation('00000000-0000-0000-0000-0000000000b1','x@x.test','reviewer','deadbeef', now()+interval '1 day')$$,
  '42501', null, 'create_invitation : non-admin refusé'
);

-- admin crée l'invitation (token 'tk')
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1"}', true);
select lives_ok(
  $$select public.create_invitation('00000000-0000-0000-0000-0000000000b1','invitee@x.test','ra_officer', encode(extensions.digest('tk','sha256'),'hex'), now()+interval '7 days')$$,
  'admin : création d''invitation autorisée'
);

-- 8) mauvais e-mail → email_mismatch
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a4"}', true);
select is(public.accept_invitation('tk') ->> 'reason', 'email_mismatch', 'accept : mauvais compte refusé');

-- 9-10) bon e-mail → ok + membership
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a3"}', true);
select is((public.accept_invitation('tk') ->> 'ok')::boolean, true, 'accept : bon compte accepté');
select is((select role::text from public.memberships where org_id='00000000-0000-0000-0000-0000000000b1' and user_id='00000000-0000-0000-0000-0000000000a3'), 'ra_officer', 'membership créé avec le bon rôle');

-- 11) anti-rejeu
select is(public.accept_invitation('tk') ->> 'reason', 'already_used', 'accept : rejeu refusé');

-- 12) team_list réservé aux membres (outsider → 42501)
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a4"}', true);
select throws_ok(
  $$select public.team_list('00000000-0000-0000-0000-0000000000b1')$$,
  '42501', null, 'team_list : non-membre refusé'
);

reset role;
select * from finish();
rollback;
