-- monitoring_reminders_rls.test.sql — Sécurité du journal des relances FABRICANT (0058, Slice 2b).
--
-- Le cron (service-role) est le SEUL à écrire ce journal d'idempotence/ALCOA ; les membres le LISENT
-- (affichage à venir), personne d'autre. On prouve : (1) anon ne voit rien ; (2) un membre voit SA
-- ligne mais ne peut PAS écrire (pas de policy INSERT → service-role only) ; (3) le service-role
-- écrit ; (4) l'unicité (document_id, expiry_date) garantit UNE relance par pièce/échéance.

begin;
select plan(6);

insert into auth.users (instance_id, id, aud, role, email)
values
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000aa', 'authenticated', 'authenticated', 'a@pharnos.test'),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000bb', 'authenticated', 'authenticated', 'b@pharnos.test');

insert into public.orgs (id, name)
values
  ('00000000-0000-0000-0000-0000000000a1', 'Org A'),
  ('00000000-0000-0000-0000-0000000000b2', 'Org B');

insert into public.memberships (org_id, user_id, role)
values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000aa', 'admin'),
  ('00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000000bb', 'admin');

-- Une relance par org (superuser : contourne la RLS pour le seeding).
insert into public.monitoring_reminders (org_id, document_id, expiry_date, doc_type, contact_email)
values
  ('00000000-0000-0000-0000-0000000000a1', 'd0000000-0000-0000-0000-00000000000a', '2027-01-01', 'gmp', 'qa-a@ext.test'),
  ('00000000-0000-0000-0000-0000000000b2', 'd0000000-0000-0000-0000-00000000000b', '2027-01-01', 'gmp', 'qa-b@ext.test');

-- 1) ANON : aucune lecture.
set local role anon;
select set_config('request.jwt.claims', '{}', true);
select is(
  (select count(*)::int from public.monitoring_reminders),
  0,
  'anon : aucune relance fabricant visible'
);

-- 2) MEMBRE ORG A : voit la SIENNE ; écriture INTERDITE (réservée au service-role).
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000aa"}', true);
select is(
  (select count(*)::int from public.monitoring_reminders),
  1,
  'org A : voit uniquement SA relance (isolation tenant)'
);
select is(
  (select org_id from public.monitoring_reminders limit 1),
  '00000000-0000-0000-0000-0000000000a1'::uuid,
  'org A : la relance visible est bien la sienne'
);
select throws_ok(
  $$ insert into public.monitoring_reminders (org_id, document_id, expiry_date, contact_email)
     values ('00000000-0000-0000-0000-0000000000a1', 'd0000000-0000-0000-0000-0000000000ff',
             '2027-02-01', 'x@ext.test') $$,
  '42501',
  null,
  'org A : INSERT interdit (aucune policy → service-role only)'
);

-- 3) SERVICE-ROLE (le cron) : écrit ; 4) unicité (document_id, expiry_date) = idempotence.
reset role;
set local role service_role;
select set_config('request.jwt.claims', '{}', true);
select lives_ok(
  $$ insert into public.monitoring_reminders (org_id, document_id, expiry_date, doc_type, contact_email)
     values ('00000000-0000-0000-0000-0000000000a1', 'd0000000-0000-0000-0000-0000000000cc',
             '2027-03-01', 'coa', 'x@ext.test') $$,
  'service-role : INSERT de relance autorisé (le cron journalise)'
);
select throws_ok(
  $$ insert into public.monitoring_reminders (org_id, document_id, expiry_date, contact_email)
     values ('00000000-0000-0000-0000-0000000000a1', 'd0000000-0000-0000-0000-00000000000a',
             '2027-01-01', 'dup@ext.test') $$,
  '23505',
  null,
  'idempotence : (document_id, expiry_date) unique — jamais deux relances pour la même échéance'
);

select * from finish();
rollback;
