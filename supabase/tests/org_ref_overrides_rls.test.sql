-- org_ref_overrides_rls.test.sql — Adaptations locales du référentiel (migration 0077, P4.3).
--
-- Prouve les quatre promesses de « la donnée locale se respecte » :
--   1) écriture réservée à l'ADMIN de l'org (un éditeur ne redéfinit pas le destinataire officiel) ;
--   2) frontière produit gravée en BASE : les contacts s'adaptent, les MONTANTS jamais ;
--   3) la trace de responsabilité est posée par le SERVEUR (un client ne signe pas pour un autre) ;
--   4) isolation tenant + fail-safe CS1 (un membre scopé ne lit pas la config de l'org).
--
-- Contrairement à `org_ref_adoptions` (écrite par RPC), cette table est ÉCRITE PAR LE CLIENT
-- (offline-first : l'outbox pousse en upsert) → un `with check` qui échoue lève bien 42501, et une
-- violation de whitelist lève 23514. Les deux sont testés.

begin;
select plan(19);

insert into auth.users (instance_id, id, aud, role, email)
values
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000e1', 'authenticated', 'authenticated', 'ovadmin@pharnos.test'),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000e2', 'authenticated', 'authenticated', 'ovreader@pharnos.test'),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000e3', 'authenticated', 'authenticated', 'ovother@pharnos.test');

insert into public.orgs (id, name)
values
  ('00000000-0000-0000-0000-00000000ea01', 'Org OverA'),
  ('00000000-0000-0000-0000-00000000eb02', 'Org OverB');

insert into public.memberships (org_id, user_id, role)
values
  ('00000000-0000-0000-0000-00000000ea01', '00000000-0000-0000-0000-0000000000e1', 'admin'),
  ('00000000-0000-0000-0000-00000000ea01', '00000000-0000-0000-0000-0000000000e2', 'reviewer'),
  ('00000000-0000-0000-0000-00000000eb02', '00000000-0000-0000-0000-0000000000e3', 'admin');

-- ----------------------------------------------------------------------------
-- Éditeur/Lecteur (`reviewer`) : n'adapte PAS
-- ----------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000e2"}', true);

select throws_ok(
  $$ insert into public.org_ref_overrides (org_id, country, field_path, value)
     values ('00000000-0000-0000-0000-00000000ea01', 'SN', 'agency.directeur', '"Dr Faux"'::jsonb) $$,
  '42501',
  null,
  'un NON-admin ne peut pas adapter (même décision que l''adoption : configuration opposable)'
);

-- ----------------------------------------------------------------------------
-- Admin de l'org A : adapte les contacts, JAMAIS les montants
-- ----------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000e1"}', true);

select lives_ok(
  $$ insert into public.org_ref_overrides (org_id, country, field_path, value)
     values ('00000000-0000-0000-0000-00000000ea01', 'SN', 'agency.directeur', '"Dr Aminata Diop"'::jsonb) $$,
  'l''admin adapte le destinataire de SON org'
);
select lives_ok(
  $$ insert into public.org_ref_overrides (org_id, country, field_path, value)
     values ('00000000-0000-0000-0000-00000000ea01', 'SN', 'notes.internal', '"Passer par le bureau d''ordre"'::jsonb) $$,
  'une note interne par pays est adaptable'
);

-- LA frontière produit (décision CEO) : un montant officiel n'est pas adaptable, et ce n'est pas
-- l'UI qui le dit — c'est la contrainte. Un POST direct sur PostgREST se heurte au même mur.
select throws_ok(
  $$ insert into public.org_ref_overrides (org_id, country, field_path, value)
     values ('00000000-0000-0000-0000-00000000ea01', 'SN', 'fees.new_ma', '1'::jsonb) $$,
  '23514',
  null,
  'un MONTANT officiel n''est PAS adaptable (whitelist en base, pas seulement dans l''UI)'
);
select throws_ok(
  $$ insert into public.org_ref_overrides (org_id, country, field_path, value)
     values ('00000000-0000-0000-0000-00000000ea01', 'SN', 'agency.name', '"ARP bis"'::jsonb) $$,
  '23514',
  null,
  'l''identité officielle de l''agence (sigle) n''est pas adaptable'
);
select throws_ok(
  $$ insert into public.org_ref_overrides (org_id, country, field_path, value)
     values ('00000000-0000-0000-0000-00000000ea01', 'sn', 'agency.email', '"a@b.c"'::jsonb) $$,
  '23514',
  null,
  'le code pays est normalisé (2 majuscules) — pas de doublon « SN »/« sn »'
);

-- Cross-org : un admin ne configure pas une autre organisation.
select throws_ok(
  $$ insert into public.org_ref_overrides (org_id, country, field_path, value)
     values ('00000000-0000-0000-0000-00000000eb02', 'SN', 'agency.email', '"pirate@b.c"'::jsonb) $$,
  '42501',
  null,
  'un admin ne peut pas adapter POUR une autre org (with check RLS)'
);

-- ----------------------------------------------------------------------------
-- Trace de responsabilité : posée par le SERVEUR
-- ----------------------------------------------------------------------------
select is(
  (select updated_by_email from public.org_ref_overrides
   where org_id = '00000000-0000-0000-0000-00000000ea01' and field_path = 'agency.directeur'),
  'ovadmin@pharnos.test',
  'le trigger estampille QUI a adapté (jamais la valeur envoyée par le client)'
);

-- Un client hors ligne pourrait envoyer n'importe quel auteur : le serveur l'écrase.
select lives_ok(
  $$ update public.org_ref_overrides
        set value = '"Dr Aminata Diop (par intérim)"'::jsonb,
            updated_by_email = 'usurpateur@ailleurs.test'
      where org_id = '00000000-0000-0000-0000-00000000ea01' and field_path = 'agency.directeur' $$,
  'l''admin met à jour son adaptation'
);
-- Deux assertions APPARIÉES : sans le contrôle de `value`, un UPDATE bloqué par la policy serait
-- un no-op SILENCIEUX (Postgres ne lève rien) et le test « anti-usurpation » passerait pour la
-- mauvaise raison — `updated_by_email` valant déjà la bonne valeur depuis l'INSERT.
select is(
  (select value from public.org_ref_overrides
   where org_id = '00000000-0000-0000-0000-00000000ea01' and field_path = 'agency.directeur'),
  '"Dr Aminata Diop (par intérim)"'::jsonb,
  'l''UPDATE a RÉELLEMENT eu lieu (sinon l''assertion suivante serait tautologique)'
);
select is(
  (select updated_by_email from public.org_ref_overrides
   where org_id = '00000000-0000-0000-0000-00000000ea01' and field_path = 'agency.directeur'),
  'ovadmin@pharnos.test',
  'un e-mail d''auteur envoyé par le client est ÉCRASÉ par le serveur (anti-usurpation)'
);

-- ----------------------------------------------------------------------------
-- Lecture : côté POSITIF (sans lui, une régression RLS ferait retomber TOUT le monde sur le
-- contenu officiel en SILENCE — l'adaptation disparaîtrait sans erreur).
-- ----------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000e2"}', true);
select is(
  (select count(*)::int from public.org_ref_overrides
   where org_id = '00000000-0000-0000-0000-00000000ea01'),
  2,
  'un membre non scopé LIT les adaptations de son org (le résolveur en a besoin)'
);

-- Un LECTEUR ne RÉÉCRIT pas la configuration : sans policy d'update pour lui, l'UPDATE est un
-- no-op SILENCIEUX → la seule preuve possible est le contenu INCHANGÉ (piège pgTAP maison).
-- Sans ces deux assertions, élargir un jour `..._update using` à `current_user_org_ids()` ne
-- casserait AUCUN test, et un simple lecteur pourrait rediriger les courriers de l'organisation.
select lives_ok(
  $$ update public.org_ref_overrides set value = '"Dr Usurpateur"'::jsonb
      where org_id = '00000000-0000-0000-0000-00000000ea01'
        and field_path = 'agency.directeur' $$,
  'UPDATE par un lecteur : silencieux (aucune policy)'
);
select is(
  (select value from public.org_ref_overrides
   where org_id = '00000000-0000-0000-0000-00000000ea01' and field_path = 'agency.directeur'),
  '"Dr Aminata Diop (par intérim)"'::jsonb,
  'la valeur est INTACTE : un lecteur ne redéfinit pas le destinataire officiel'
);
select lives_ok(
  $$ delete from public.org_ref_overrides
      where org_id = '00000000-0000-0000-0000-00000000ea01' $$,
  'DELETE par un lecteur : silencieux (aucune policy)'
);
select is(
  (select count(*)::int from public.org_ref_overrides
   where org_id = '00000000-0000-0000-0000-00000000ea01'),
  2,
  'les deux adaptations ont SURVÉCU au DELETE d''un lecteur'
);

-- CS1 : un membre SCOPÉ (agence invitée sur des dossiers précis) ne lit pas la config de l'org.
reset role;
insert into public.membership_scopes (org_id, user_id, dossier_ids)
values ('00000000-0000-0000-0000-00000000ea01', '00000000-0000-0000-0000-0000000000e2',
        array['00000000-0000-0000-0000-0000000000e9']::uuid[]);
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000e2"}', true);
select is(
  (select count(*)::int from public.org_ref_overrides),
  0,
  'un membre SCOPÉ ne lit AUCUNE adaptation (RESTRICTIVE CS1 fail-safe)'
);

-- ----------------------------------------------------------------------------
-- Isolation tenant
-- ----------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000e3"}', true);
select is(
  (select count(*)::int from public.org_ref_overrides),
  0,
  'l''admin d''Org OverB ne voit AUCUNE adaptation d''Org OverA'
);

-- Retrait = retour à la valeur officielle (l'admin peut défaire son adaptation).
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000e1"}', true);
select lives_ok(
  $$ delete from public.org_ref_overrides
      where org_id = '00000000-0000-0000-0000-00000000ea01' and field_path = 'notes.internal' $$,
  'l''admin retire une adaptation (retour à la valeur officielle)'
);
-- `lives_ok` passerait même sur 0 ligne affectée : la preuve du retrait, c'est l'ABSENCE.
select is(
  (select count(*)::int from public.org_ref_overrides
   where org_id = '00000000-0000-0000-0000-00000000ea01' and field_path = 'notes.internal'),
  0,
  'la ligne est bien PARTIE (retour effectif à la valeur officielle)'
);

select * from finish();
rollback;
