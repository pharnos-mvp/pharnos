-- ref_versions_rls.test.sql — Référentiel réglementaire versionné (migration 0071, P4.1).
-- Posture INÉDITE dans le schéma : tables GLOBALES (hors tenant) en lecture pan-authentifiés,
-- versions PUBLIÉES seules, et ZÉRO écriture client (aucune policy insert/update/delete —
-- publication réservée au service role / God dashboard P4.4).
--
-- Piège pgTAP : l'INSERT sans policy lève bien 42501, mais l'UPDATE/DELETE sans policy ne
-- lève RIEN (0 ligne visible en écriture → 0 ligne touchée) — on prouve donc le contenu
-- INCHANGÉ, pas une exception. NB : le seed v2026.1 de 0071 est présent dans la base de test
-- (17 entrées publiées) → toutes les assertions ciblent les lignes du test par id.

begin;
select plan(10);

insert into auth.users (instance_id, id, aud, role, email)
values
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000c9', 'authenticated', 'authenticated', 'ref@pharnos.test');

-- Une version PUBLIÉE + une version BROUILLON, chacune avec une entrée SN/fees.
insert into public.ref_versions (id, label, status, published_at)
values
  ('00000000-0000-0000-0000-0000000000f1', 'vtest-pub', 'published', now()),
  ('00000000-0000-0000-0000-0000000000d1', 'vtest-draft', 'draft', null);

insert into public.ref_entries (id, version_id, country, section, payload, provenance)
values
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000f1', 'SN', 'fees',
   '{"currency":"FCFA","fees":{"new_ma":1000000}}'::jsonb, '{"texte":"Décret test"}'::jsonb),
  ('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000d1', 'SN', 'fees',
   '{"currency":"FCFA","fees":{"new_ma":9999999}}'::jsonb, '{"texte":"Brouillon interne"}'::jsonb);

-- ----------------------------------------------------------------------------
-- Utilisateur authentifié (n'importe quel tenant — contenu global)
-- ----------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c9"}', true);

select is(
  (select count(*)::int from public.ref_versions where id = '00000000-0000-0000-0000-0000000000f1'),
  1,
  'la version PUBLIÉE est lisible par tout authentifié'
);
select is(
  (select count(*)::int from public.ref_versions where status <> 'published'),
  0,
  'les versions non publiées (brouillon/archivée) sont INVISIBLES'
);
select is(
  (select count(*)::int from public.ref_entries where version_id = '00000000-0000-0000-0000-0000000000d1'),
  0,
  'les entrées d''un BROUILLON sont invisibles (exists sur ref_versions)'
);
select is(
  (select payload->'fees'->>'new_ma' from public.ref_entries where id = '00000000-0000-0000-0000-0000000000e1'),
  '1000000',
  'le payload d''une entrée publiée est lisible'
);
select throws_ok(
  $$ insert into public.ref_versions (label, status) values ('vtest-intrus', 'published') $$,
  '42501',
  null,
  'un client ne peut PAS créer de version du référentiel'
);
select throws_ok(
  $$ insert into public.ref_entries (version_id, country, section, payload)
     values ('00000000-0000-0000-0000-0000000000f1', 'SN', 'fees', '{}'::jsonb) $$,
  '42501',
  null,
  'un client ne peut PAS publier de contenu réglementaire'
);
select lives_ok(
  $$ update public.ref_entries set payload = '{"fees":{"new_ma":1}}'::jsonb
     where id = '00000000-0000-0000-0000-0000000000e1' $$,
  'UPDATE sans policy : silencieux (0 ligne touchée), pas une exception'
);
select lives_ok(
  $$ delete from public.ref_entries where id = '00000000-0000-0000-0000-0000000000e1' $$,
  'DELETE sans policy : silencieux (0 ligne touchée)'
);

-- Le contenu N'A PAS bougé — c'est la vraie preuve (cf. piège en tête de fichier).
reset role;
select is(
  (select payload->'fees'->>'new_ma' from public.ref_entries where id = '00000000-0000-0000-0000-0000000000e1'),
  '1000000',
  'un client ne peut NI altérer NI supprimer un barème publié (contenu intact)'
);

-- ----------------------------------------------------------------------------
-- anon : aucune policy → rien, pas même le publié (app authentifiée seulement)
-- ----------------------------------------------------------------------------
set local role anon;
select is_empty(
  'select id from public.ref_versions',
  'anon ne lit AUCUNE version (seed 0071 inclus)'
);

reset role;
select * from finish();
rollback;
