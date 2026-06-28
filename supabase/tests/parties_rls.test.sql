-- parties_rls.test.sql — Isolation multi-tenant de la table `parties` (migration 0045).
-- Pilier confidentialité pharma : une org ne voit/écrit JAMAIS les organisations d'une autre.
-- Prouve aussi le CHECK des rôles (vocabulaire contrôlé) et la lisibilité du lien produit→org.
--
-- Pattern Supabase : utilisateur connecté simulé via rôle `authenticated` + claim JWT `sub`.
-- Seeding en superuser (la RLS ne s'y applique pas).

begin;
select plan(8);

insert into auth.users (instance_id, id, aud, role, email)
values
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000a1', 'authenticated', 'authenticated', 'pa@pharnos.test'),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000b2', 'authenticated', 'authenticated', 'pb@pharnos.test');

insert into public.orgs (id, name)
values
  ('00000000-0000-0000-0000-00000000aa01', 'Org PA'),
  ('00000000-0000-0000-0000-00000000bb02', 'Org PB');

insert into public.memberships (org_id, user_id, role)
values
  ('00000000-0000-0000-0000-00000000aa01', '00000000-0000-0000-0000-0000000000a1', 'admin'),
  ('00000000-0000-0000-0000-00000000bb02', '00000000-0000-0000-0000-0000000000b2', 'admin');

-- Une organisation (party) par tenant + un produit d'Org PA lié à sa party (titulaire).
insert into public.parties (id, org_id, nom, roles)
values
  ('0000aa00-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000aa01', 'Holder PA', array['titulaire']),
  ('0000bb00-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000bb02', 'Maker PB', array['fabricant']);

insert into public.products (id, org_id, nom_commercial, dci, titulaire_id)
values
  ('0000aa00-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000aa01', 'Produit PA', 'DCI PA', '0000aa00-0000-0000-0000-000000000001');

-- ----------------------------------------------------------------------------
-- Utilisateur PA (membre d'Org PA)
-- ----------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1"}', true);

select is(
  (select count(*)::int from public.parties),
  1,
  'PA ne voit que les organisations de son tenant'
);
select is(
  (select count(*)::int from public.parties where org_id = '00000000-0000-0000-0000-00000000bb02'),
  0,
  'PA ne voit aucune organisation d''Org PB'
);
select throws_ok(
  $$ insert into public.parties (org_id, nom, roles)
     values ('00000000-0000-0000-0000-00000000bb02', 'Intrus', array['titulaire']) $$,
  '42501',
  null,
  'RLS bloque l''insertion d''une organisation dans un autre tenant'
);
select throws_ok(
  $$ insert into public.parties (org_id, nom, roles)
     values ('00000000-0000-0000-0000-00000000aa01', 'Rôle invalide', array['sponsor']) $$,
  '23514',
  null,
  'CHECK rôles : seul le vocabulaire contrôlé est accepté'
);
select lives_ok(
  $$ insert into public.parties (org_id, nom, roles)
     values ('00000000-0000-0000-0000-00000000aa01', 'Holder PA 2', array['titulaire','fabricant']) $$,
  'PA insère une organisation (rôles cumulés) dans son tenant'
);
select is(
  (select count(*)::int from public.products where titulaire_id = '0000aa00-0000-0000-0000-000000000001'),
  1,
  'Le lien produit→organisation (titulaire_id) est lisible dans le tenant'
);

-- ----------------------------------------------------------------------------
-- Utilisateur PB (membre d'Org PB)
-- ----------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b2"}', true);

select is(
  (select count(*)::int from public.parties),
  1,
  'PB ne voit que les organisations de son tenant'
);
select is(
  (select count(*)::int from public.parties where org_id = '00000000-0000-0000-0000-00000000aa01'),
  0,
  'PB ne voit aucune organisation d''Org PA'
);

reset role;
select * from finish();
rollback;
