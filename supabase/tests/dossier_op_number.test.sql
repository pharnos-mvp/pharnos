-- dossier_op_number.test.sql — N° d'opération canonique (migration 0046).
-- Prouve : attribution séquentielle PAR (org, année) à l'insertion ; séquence indépendante par org
-- et par année ; un upsert d'UPDATE ne réattribue pas / ne « brûle » pas de numéro (anti-trou) ;
-- unicité (org, année, n°). pgTAP tourne en superuser (RLS contournée) ; le trigger fire quand même.

begin;
select plan(8);

insert into public.orgs (id, name) values
  ('00000000-0000-0000-0000-0000000000a1', 'Org A'),
  ('00000000-0000-0000-0000-0000000000a2', 'Org B');

-- ── Org A / 2026 : deux dossiers → 1 puis 2 ──────────────────────────────────────────────────
insert into public.dossiers (id, org_id, product_name, format, activity, country, created_at)
values ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000a1',
        'P1', 'ctd', 'new_ma', 'CI', '2026-02-01T00:00:00Z');
select is((select op_year from public.dossiers where id = '00000000-0000-0000-0000-0000000000d1'),
          2026::smallint, 'A/2026 #1 : année = 2026');
select is((select op_number from public.dossiers where id = '00000000-0000-0000-0000-0000000000d1'),
          1, 'A/2026 #1 : n° = 1');

insert into public.dossiers (id, org_id, product_name, format, activity, country, created_at)
values ('00000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-0000000000a1',
        'P2', 'ctd', 'new_ma', 'CI', '2026-03-01T00:00:00Z');
select is((select op_number from public.dossiers where id = '00000000-0000-0000-0000-0000000000d2'),
          2, 'A/2026 #2 : n° = 2 (séquentiel)');

-- ── Org B / 2026 : séquence PAR ORG → repart à 1 ─────────────────────────────────────────────
insert into public.dossiers (id, org_id, product_name, format, activity, country, created_at)
values ('00000000-0000-0000-0000-0000000000d3', '00000000-0000-0000-0000-0000000000a2',
        'P3', 'ctd', 'new_ma', 'CI', '2026-02-01T00:00:00Z');
select is((select op_number from public.dossiers where id = '00000000-0000-0000-0000-0000000000d3'),
          1, 'B/2026 #1 : n° = 1 (séquence indépendante par org)');

-- ── Org A / 2027 : séquence PAR ANNÉE → repart à 1 ───────────────────────────────────────────
insert into public.dossiers (id, org_id, product_name, format, activity, country, created_at)
values ('00000000-0000-0000-0000-0000000000d4', '00000000-0000-0000-0000-0000000000a1',
        'P4', 'ctd', 'new_ma', 'CI', '2027-01-15T00:00:00Z');
select is((select op_number from public.dossiers where id = '00000000-0000-0000-0000-0000000000d4'),
          1, 'A/2027 #1 : n° = 1 (séquence par année)');

-- ── Upsert d'UPDATE sur d1 : ne réattribue pas / ne brûle pas de numéro ──────────────────────
insert into public.dossiers (id, org_id, product_name, format, activity, country, created_at)
values ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000a1',
        'P1-édité', 'ctd', 'new_ma', 'CI', '2026-02-01T00:00:00Z')
on conflict (id) do update set product_name = excluded.product_name;
select is((select op_number from public.dossiers where id = '00000000-0000-0000-0000-0000000000d1'),
          1, 'upsert update : n° inchangé (1)');
select is((select last_seq from public.org_op_counters
           where org_id = '00000000-0000-0000-0000-0000000000a1' and year = 2026),
          2, 'upsert update : compteur NON brûlé (reste 2)');

-- ── Unicité (org, année, n°) ─────────────────────────────────────────────────────────────────
select throws_ok(
  $$ insert into public.dossiers (id, org_id, product_name, format, activity, country, created_at, op_year, op_number)
     values ('00000000-0000-0000-0000-0000000000d9', '00000000-0000-0000-0000-0000000000a1',
             'Pdup', 'ctd', 'new_ma', 'CI', '2026-02-01T00:00:00Z', 2026, 1) $$,
  '23505', NULL, 'unicité (org, année, n°) : duplicata rejeté'
);

select * from finish();
rollback;
