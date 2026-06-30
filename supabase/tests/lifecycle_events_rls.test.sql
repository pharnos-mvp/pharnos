-- lifecycle_events_rls.test.sql — Sécurité du journal du cycle de vie (migration 0047, jalon M0).
--
-- « La spine » est un journal APPEND-ONLY, source de vérité de l'état dérivé du dossier (ADR-0004).
-- Ces tests prouvent que :
--   1. anon ne lit RIEN et n'écrit RIEN (RLS = barrière même avec les grants larges de 0016) ;
--   2. un membre ne voit que les événements de SON org (isolation multi-tenant, pilier pharma) ;
--   3. l'écriture est RÉSERVÉE aux gestionnaires de soumission (current_user_submission_org_ids) :
--      l'Éditeur (ra_officer) LIT mais n'INSÈRE pas ; l'Admin insère ;
--   4. append-only : UPDATE/DELETE sans effet (aucune policy → 0 ligne) → historique infalsifiable.

begin;
select plan(13);

-- ── Seeding (superuser : contourne la RLS) ───────────────────────────────────
insert into auth.users (instance_id, id, aud, role, email)
values
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000aa', 'authenticated', 'authenticated', 'admin-a@pharnos.test'),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000a2', 'authenticated', 'authenticated', 'editeur-a@pharnos.test'),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000bb', 'authenticated', 'authenticated', 'admin-b@pharnos.test');

insert into public.orgs (id, name)
values
  ('00000000-0000-0000-0000-0000000000a1', 'Org A'),
  ('00000000-0000-0000-0000-0000000000b2', 'Org B');

-- Org A : un Admin (gestionnaire de soumission) + un Éditeur (ra_officer, lecture seule du journal).
insert into public.memberships (org_id, user_id, role)
values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000aa', 'admin'),
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a2', 'ra_officer'),
  ('00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000000bb', 'admin');

-- Un événement par org (dossier_id = texte libre, pas de FK — pattern 0017).
insert into public.lifecycle_events (id, org_id, dossier_id, type, actor_id)
values
  ('11110000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000a1',
   'd0000000-0000-0000-0000-00000000000a', 'deposited', 'u-aa'),
  ('11110000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-0000000000b2',
   'd0000000-0000-0000-0000-00000000000b', 'submitted', 'u-bb');

-- ── 1) ANON : zéro lecture, zéro écriture ────────────────────────────────────
set local role anon;
select set_config('request.jwt.claims', '{}', true);

select is(
  (select count(*)::int from public.lifecycle_events),
  0,
  'anon : aucun événement visible (pas de policy anon)'
);
select throws_ok(
  $$ insert into public.lifecycle_events (id, org_id, dossier_id, type, actor_id)
     values ('11110000-0000-0000-0000-0000000000f0', '00000000-0000-0000-0000-0000000000a1',
             'd0000000-0000-0000-0000-00000000000a', 'deposited', 'pirate') $$,
  '42501',
  null,
  'anon : INSERT d''un événement rejeté par la RLS'
);

-- ── 2) ADMIN ORG A : isolation + écriture autorisée + append-only ────────────
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000aa"}', true);

select is(
  (select count(*)::int from public.lifecycle_events),
  1,
  'org A : voit uniquement SON événement'
);
select is(
  (select count(*)::int from public.lifecycle_events
    where org_id = '00000000-0000-0000-0000-0000000000b2'),
  0,
  'org A : ne voit aucun événement de l''org B'
);

-- Gestionnaire de soumission (admin) : insertion autorisée.
insert into public.lifecycle_events (id, org_id, dossier_id, type, actor_id)
values ('11110000-0000-0000-0000-0000000000a5', '00000000-0000-0000-0000-0000000000a1',
        'd0000000-0000-0000-0000-00000000000a', 'submitted', 'u-aa');
select is(
  (select count(*)::int from public.lifecycle_events),
  2,
  'org A (admin) : événement inséré (gestionnaire de soumission)'
);

-- Insérer dans l'org B : rejeté (with check).
select throws_ok(
  $$ insert into public.lifecycle_events (id, org_id, dossier_id, type, actor_id)
     values ('11110000-0000-0000-0000-0000000000ff', '00000000-0000-0000-0000-0000000000b2',
             'd0000000-0000-0000-0000-00000000000b', 'deposited', 'u-aa') $$,
  '42501',
  null,
  'org A : INSERT d''un événement dans l''org B rejeté'
);

-- Vocabulaire contrôlé : un `type` hors CHECK est rejeté (le verrou de contrat avec l'union TS).
select throws_ok(
  $$ insert into public.lifecycle_events (id, org_id, dossier_id, type, actor_id)
     values ('11110000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000a1',
             'd0000000-0000-0000-0000-00000000000a', 'type_invalide', 'u-aa') $$,
  '23514',
  null,
  'org A : INSERT avec un type hors vocabulaire rejeté (CHECK)'
);

-- Append-only : pas de policy UPDATE/DELETE → 0 ligne affectée, l'événement reste intègre.
update public.lifecycle_events set type = 'amm_refused'
  where id = '11110000-0000-0000-0000-00000000000a';
select is(
  (select type from public.lifecycle_events where id = '11110000-0000-0000-0000-00000000000a'),
  'deposited',
  'org A : UPDATE d''un événement sans effet (append-only)'
);
delete from public.lifecycle_events where id = '11110000-0000-0000-0000-00000000000a';
select is(
  (select count(*)::int from public.lifecycle_events
    where id = '11110000-0000-0000-0000-00000000000a'),
  1,
  'org A : DELETE d''un événement sans effet (append-only)'
);

-- ── 3) ÉDITEUR ORG A (ra_officer) : LECTURE oui, ÉCRITURE non ─────────────────
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a2"}', true);

select is(
  (select count(*)::int from public.lifecycle_events),
  2,
  'org A (éditeur) : LIT le journal (lecture ouverte à tout membre)'
);
select throws_ok(
  $$ insert into public.lifecycle_events (id, org_id, dossier_id, type, actor_id)
     values ('11110000-0000-0000-0000-0000000000a6', '00000000-0000-0000-0000-0000000000a1',
             'd0000000-0000-0000-0000-00000000000a', 'deposited', 'u-a2') $$,
  '42501',
  null,
  'org A (éditeur) : INSERT rejeté — écriture réservée aux gestionnaires de soumission'
);

-- ── 4) ADMIN ORG B : ne voit que SON org ─────────────────────────────────────
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000bb"}', true);

select is(
  (select count(*)::int from public.lifecycle_events),
  1,
  'org B : voit uniquement SON événement'
);
select is(
  (select count(*)::int from public.lifecycle_events
    where org_id = '00000000-0000-0000-0000-0000000000a1'),
  0,
  'org B : ne voit aucun événement de l''org A'
);

select * from finish();
rollback;
