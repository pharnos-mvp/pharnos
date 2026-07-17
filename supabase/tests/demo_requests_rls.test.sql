-- demo_requests_rls.test.sql — preuve RLS « deny-all » de la table des leads (0061).
--
-- `demo_requests` contient la PII des prospects (nom, e-mail, entreprise) écrite par l'Edge
-- publique `demo-request` via le service-role. RLS activée SANS policy — comme les autres
-- tables internes (internal_tables_rls.test.sql), on PROUVE la barrière plutôt que d'ajouter
-- des policies « using(false) » cosmétiques : lecture = 0, écriture refusée.

begin;
select plan(4);

-- ── Seeding (superuser : bypass RLS) — une ligne réelle, pour que « lecture = 0 » prouve
-- la RLS et pas une table vide.
insert into auth.users (instance_id, id, aud, role, email) values
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000e1', 'authenticated', 'authenticated', 'membera@demo-rls.test');
insert into public.demo_requests (full_name, email, company, job_title, country)
  values ('Prospect Seed', 'prospect@demo-rls.test', 'Labo Seed', 'Responsable AR', 'Bénin');

-- ── 1) ANON : ni lecture ni écriture ────────────────────────────────────────
set local role anon;
select set_config('request.jwt.claims', '', true);
select is_empty('select * from public.demo_requests', 'anon ne lit PAS les leads (PII)');
select throws_ok(
  $$insert into public.demo_requests (full_name, email, company, job_title, country)
    values ('Forge', 'forge@x.test', 'X', 'X', 'X')$$,
  '42501', null,
  'anon ne peut PAS insérer de lead en direct (seul l''Edge service-role écrit)'
);

-- ── 2) AUTHENTICATED : même deny-all ────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000e1"}', true);
select is((select count(*)::int from public.demo_requests), 0,
  'un utilisateur connecté ne lit PAS les leads (la ligne seedée reste cachée)');
select throws_ok(
  $$insert into public.demo_requests (full_name, email, company, job_title, country)
    values ('Forge', 'forge@x.test', 'X', 'X', 'X')$$,
  '42501', null,
  'un utilisateur connecté ne peut PAS insérer de lead en direct'
);

select * from finish();
rollback;
