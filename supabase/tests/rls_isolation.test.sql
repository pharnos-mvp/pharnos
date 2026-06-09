-- rls_isolation.test.sql — Tests d'isolation multi-tenant (RLS), pilier confidentialité pharma.
-- Exécuté par pgTAP via `supabase test db` (Postgres local). Vérifie qu'une organisation ne
-- voit jamais les données d'une autre, et qu'une signature n'est lisible que par son propriétaire.
--
-- Pattern Supabase : on simule l'utilisateur connecté via le rôle `authenticated` + le claim
-- JWT `sub` (lu par auth.uid()). Le seeding se fait en superuser (la RLS ne s'y applique pas).

begin;
select plan(14);

-- ----------------------------------------------------------------------------
-- Seeding (superuser : contourne la RLS)
-- ----------------------------------------------------------------------------
-- Utilisateurs (le trigger on_auth_user_created crée les profiles automatiquement).
insert into auth.users (instance_id, id, aud, role, email)
values
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-00000000000a', 'authenticated', 'authenticated', 'a@pharnos.test'),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-00000000000b', 'authenticated', 'authenticated', 'b@pharnos.test'),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-00000000000c', 'authenticated', 'authenticated', 'c@pharnos.test');

-- Deux organisations (tenants).
insert into public.orgs (id, name)
values
  ('00000000-0000-0000-0000-0000000000a1', 'Org A'),
  ('00000000-0000-0000-0000-0000000000b2', 'Org B');

-- Appartenances : A et C dans Org A ; B dans Org B.
insert into public.memberships (org_id, user_id, role)
values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000000a', 'admin'),
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000000c', 'ra_officer'),
  ('00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-00000000000b', 'admin');

-- Un produit + un document par organisation.
insert into public.products (id, org_id, nom_commercial, dci)
values
  ('0000a000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 'Produit A', 'DCI A'),
  ('0000b000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000b2', 'Produit B', 'DCI B');

insert into public.documents (id, org_id, product_id, category, doc_type)
values
  ('0000a000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000a1', '0000a000-0000-0000-0000-000000000001', 'admin', 'gmp'),
  ('0000b000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000b2', '0000b000-0000-0000-0000-000000000001', 'admin', 'gmp');

-- Branding partagé (Org A) + signature personnelle de l'utilisateur C (Org A).
insert into public.pro_settings (id, org_id, kind)
values
  ('org:00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a1', 'orgBranding'),
  ('user:00000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-0000000000a1', 'userSignature');

-- Dossier + document généré + pièce jointe + entrée d'audit, un de chaque par organisation.
insert into public.dossiers (id, org_id, product_name, format, activity, country)
values
  ('0000a000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-0000000000a1', 'Dossier A', 'CTD', 'Nouvelle AMM', 'BEN'),
  ('0000b000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-0000000000b2', 'Dossier B', 'CTD', 'Nouvelle AMM', 'CIV');

insert into public.generated_docs (id, org_id, dossier_id, node_number, template_key, title)
values
  ('0000a000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-0000000000a1', '0000a000-0000-0000-0000-000000000003', '1.0', 'cover', 'Cover A'),
  ('0000b000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-0000000000b2', '0000b000-0000-0000-0000-000000000003', '1.0', 'cover', 'Cover B');

insert into public.dossier_attachments (id, org_id, dossier_id, node_number)
values
  ('0000a000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-0000000000a1', '0000a000-0000-0000-0000-000000000003', '1.2'),
  ('0000b000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-0000000000b2', '0000b000-0000-0000-0000-000000000003', '1.2');

insert into public.audit_log (id, org_id, actor_id, actor_email, entity, entity_id, action)
values
  ('0000a000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000000a', 'a@pharnos.test', 'product', '0000a000-0000-0000-0000-000000000001', 'create'),
  ('0000b000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-00000000000b', 'b@pharnos.test', 'product', '0000b000-0000-0000-0000-000000000001', 'create');

-- ----------------------------------------------------------------------------
-- Utilisateur A (membre d'Org A)
-- ----------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a"}', true);

select is(
  (select count(*)::int from public.products),
  1,
  'A ne voit que les produits de son organisation'
);
select is(
  (select count(*)::int from public.products where org_id = '00000000-0000-0000-0000-0000000000b2'),
  0,
  'A ne voit aucun produit d''Org B'
);
select is(
  (select count(*)::int from public.documents),
  1,
  'A ne voit que les documents de son organisation'
);
select is(
  (select count(*)::int from public.pro_settings where id = 'org:00000000-0000-0000-0000-0000000000a1'),
  1,
  'A voit le branding partagé de son organisation'
);
select is(
  (select count(*)::int from public.pro_settings where kind = 'userSignature'),
  0,
  'A ne voit pas la signature d''un autre utilisateur (owner-only)'
);
select throws_ok(
  $$ insert into public.products (id, org_id, nom_commercial, dci)
     values (gen_random_uuid(), '00000000-0000-0000-0000-0000000000b2', 'Intrus', 'X') $$,
  '42501',
  null,
  'RLS bloque l''insertion d''un produit dans une autre organisation'
);
select is(
  (select count(*)::int from public.dossiers),
  1,
  'A ne voit que les dossiers de son organisation'
);
select is(
  (select count(*)::int from public.generated_docs),
  1,
  'A ne voit que les documents générés de son organisation'
);
select is(
  (select count(*)::int from public.dossier_attachments),
  1,
  'A ne voit que les pièces jointes de son organisation'
);
select is(
  (select count(*)::int from public.audit_log),
  1,
  'A ne voit que le journal d''audit de son organisation'
);
select throws_ok(
  $$ insert into public.audit_log (id, org_id, actor_id, actor_email, entity, entity_id, action)
     values (gen_random_uuid(), '00000000-0000-0000-0000-0000000000a1',
             '00000000-0000-0000-0000-00000000000b', 'b@pharnos.test', 'product', 'x', 'create') $$,
  '42501',
  null,
  'audit_log : insertion au nom d''un autre acteur bloquée (anti-spoof)'
);

-- ----------------------------------------------------------------------------
-- Utilisateur C (membre d'Org A) : propriétaire de la signature
-- ----------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c"}', true);

select is(
  (select count(*)::int from public.pro_settings where id = 'user:00000000-0000-0000-0000-00000000000c'),
  1,
  'C voit sa propre signature'
);

-- ----------------------------------------------------------------------------
-- Utilisateur B (membre d'Org B)
-- ----------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b"}', true);

select is(
  (select count(*)::int from public.products),
  1,
  'B ne voit que les produits de son organisation'
);
select is(
  (select count(*)::int from public.products where org_id = '00000000-0000-0000-0000-0000000000a1'),
  0,
  'B ne voit aucun produit d''Org A'
);

reset role;
select * from finish();
rollback;
