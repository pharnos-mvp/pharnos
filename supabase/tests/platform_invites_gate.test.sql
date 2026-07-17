-- platform_invites_gate.test.sql — Verrou d'accès sur invitation (migration 0063).
--
-- Propriétés CRITIQUES :
--   • RLS deny-all : aucun rôle client ne lit les codes (anti-énumération) ni l'attribution (PII),
--     et ne peut forger un code ou une redemption.
--   • Sans code → création refusée. Avec code valide → org créée, quota consommé, attribution
--     enregistrée (user, e-mail, org).
--   • Code inconnu / révoqué / expiré / épuisé → refus, avec un MESSAGE UNIQUE (pas d'oracle).
--   • Throttle anti force-brute : chaque tentative (échec compris) compte — la 11e de l'heure
--     est refusée. C'est la raison du contrat « refus RETOURNÉ » (jsonb) : un RAISE annulerait
--     le compteur avec la transaction.

begin;
select plan(15);

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

-- ── 2) Le verrou (refus RETOURNÉS : {ok:false, error}) ──────────────────────
select is(
  public.create_org_onboarding('Sans Code SARL', 'free', null) ->> 'error',
  'invite_required',
  'sans code : création refusée'
);
select is(
  public.create_org_onboarding('Mauvais Code SARL', 'free', 'INCONNU-99') ->> 'error',
  'invite_invalid',
  'code inconnu : création refusée'
);
select is(
  public.create_org_onboarding('Revoked SARL', 'free', 'REVOKED-1') ->> 'error',
  'invite_invalid',
  'code révoqué : création refusée'
);
select is(
  public.create_org_onboarding('Expired SARL', 'free', 'EXPIRED-1') ->> 'error',
  'invite_invalid',
  'code expiré : création refusée'
);
select is(
  public.create_org_onboarding('Full SARL', 'free', 'FULL-1') ->> 'error',
  'invite_invalid',
  'code épuisé (quota atteint) : création refusée — même message que les autres refus'
);
select is(
  (select count(*)::int from public.memberships
    where user_id = '00000000-0000-0000-0000-0000000000f1'),
  0,
  'aucune organisation créée par les 5 refus'
);

-- ── 3) Chemin nominal : code valide (casse/espaces tolérés) → org + quota + attribution ────
select is(
  public.create_org_onboarding('Labo Gate SARL', 'free', '  dr-test ') ->> 'ok',
  'true',
  'code valide : l''organisation est créée (code normalisé majuscules/trim)'
);

-- ── 4) Throttle anti force-brute : 10 tentatives/h par utilisateur, puis refus ──────────────
-- 6 tentatives consommées ci-dessus (5 refus + 1 succès) : on brûle les 4 restantes, la 11e
-- est refusée avec l'erreur dédiée, MÊME avec un code valide.
select is(
  (select count(*)::int
   from generate_series(1, 4) g,
        lateral public.create_org_onboarding('Brute ' || g, 'free', 'INCONNU-' || g) as t(res)
   where t.res ->> 'error' = 'invite_invalid'),
  4,
  'tentatives 7 à 10 : encore refusées pour code inconnu (sous le seuil du throttle)'
);
select is(
  public.create_org_onboarding('Brute 11', 'free', 'DR-TEST') ->> 'error',
  'throttled',
  'throttle : la 11e tentative de l''heure est refusée, MÊME avec un code valide'
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
