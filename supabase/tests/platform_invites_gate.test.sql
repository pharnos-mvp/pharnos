-- platform_invites_gate.test.sql — Verrou d'accès sur invitation (migration 0063).
--
-- Propriétés CRITIQUES :
--   • RLS deny-all : aucun rôle client ne lit les codes (anti-énumération) ni l'attribution (PII),
--     et ne peut forger un code ou une redemption.
--   • Sans code → création d'org refusée (P0403). Avec code valide → org créée, quota consommé,
--     attribution enregistrée (user, e-mail, org).
--   • Code révoqué / expiré / épuisé → refus.

begin;
select plan(12);

-- ── Seeding (superuser : bypass RLS) ────────────────────────────────────────
insert into auth.users (instance_id, id, aud, role, email) values
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000f1', 'authenticated', 'authenticated', 'prospect@gate.test');
insert into public.platform_invites (code, label, max_uses) values
  ('DR-TEST', 'Dr Test', 2),
  ('REVOKED-1', 'Expert révoqué', 50),
  ('EXPIRED-1', 'Expert expiré', 50),
  ('FULL-1', 'Expert plein', 1);
update public.platform_invites set revoked_at = now() where code = 'REVOKED-1';
update public.platform_invites set expires_at = now() - interval '1 day' where code = 'EXPIRED-1';
update public.platform_invites set used_count = 1 where code = 'FULL-1';

-- ── 1) RLS deny-all ─────────────────────────────────────────────────────────
set local role anon;
select set_config('request.jwt.claims', '', true);
select is_empty('select * from public.platform_invites', 'anon ne lit PAS les codes (anti-énumération)');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000f1"}', true);
select is((select count(*)::int from public.platform_invites), 0,
  'un utilisateur connecté ne lit PAS les codes');
select is((select count(*)::int from public.invite_redemptions), 0,
  'un utilisateur connecté ne lit PAS l''attribution (PII)');
select throws_ok(
  $$insert into public.platform_invites (code, label) values ('FORGE-1', 'Forge')$$,
  '42501', null,
  'un utilisateur ne peut PAS forger de code (RLS deny)'
);
select throws_ok(
  $$insert into public.invite_redemptions (invite_id, user_id, org_name)
    values (gen_random_uuid(), auth.uid(), 'Forge')$$,
  '42501', null,
  'un utilisateur ne peut PAS forger d''attribution (RLS deny)'
);

-- ── 2) Le verrou ────────────────────────────────────────────────────────────
select throws_ok(
  $$ select public.create_org_onboarding('Sans Code SARL', 'free', null) $$,
  'P0403', null,
  'sans code : création refusée'
);
select throws_ok(
  $$ select public.create_org_onboarding('Mauvais Code SARL', 'free', 'INCONNU-99') $$,
  'P0403', null,
  'code inconnu : création refusée'
);
select throws_ok(
  $$ select public.create_org_onboarding('Revoked SARL', 'free', 'REVOKED-1') $$,
  'P0403', null,
  'code révoqué : création refusée'
);
select throws_ok(
  $$ select public.create_org_onboarding('Expired SARL', 'free', 'EXPIRED-1') $$,
  'P0403', null,
  'code expiré : création refusée'
);
select throws_ok(
  $$ select public.create_org_onboarding('Full SARL', 'free', 'FULL-1') $$,
  'P0403', null,
  'code épuisé (quota atteint) : création refusée'
);

-- ── 3) Chemin nominal : code valide (casse/espaces tolérés) → org + quota + attribution ────
select lives_ok(
  $$ select public.create_org_onboarding('Labo Gate SARL', 'free', '  dr-test ') $$,
  'code valide : l''organisation est créée (code normalisé majuscules/trim)'
);

reset role;
select is(
  (select (pi.used_count = 1 and r.user_email = 'prospect@gate.test' and r.org_name = 'Labo Gate SARL')
   from public.platform_invites pi
   join public.invite_redemptions r on r.invite_id = pi.id
   where pi.code = 'DR-TEST'),
  true,
  'quota consommé (1/2) et attribution enregistrée (e-mail + org snapshotés)'
);

select * from finish();
rollback;
