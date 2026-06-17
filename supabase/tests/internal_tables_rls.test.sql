-- internal_tables_rls.test.sql — Jalon N1-c : preuve RLS « deny-all » des tables INTERNES.
--
-- Quatre tables ont RLS activée SANS policy (advisor 0008 `rls_enabled_no_policy`) — c'est
-- VOULU : elles ne sont jamais lues/écrites par un rôle client, uniquement par le service-role
-- (bypass RLS) ou des fonctions SECURITY DEFINER. Plutôt que d'ajouter des policies « using(false) »
-- cosmétiques, on PROUVE ici la barrière (lecture = 0, écriture refusée) :
--   • platform_admin_emails — allowlist super-admin Pharnos (fuite = reconnaissance d'attaque) ;
--   • platform_admins       — super-admins par user_id ;
--   • invitations           — le token_hash ne doit JAMAIS transiter par une lecture client (0023) ;
--   • share_hits            — compteurs de rate-limit du partage public (écrits par l'Edge `share`).
--
-- Propriétés CRITIQUES couvertes : un utilisateur authentifié ne peut ni LIRE l'allowlist
-- super-admin, ni S'AUTO-PROMOUVOIR super-admin (insert platform_admins / platform_admin_emails).

begin;
select plan(9);

-- ── Seeding (superuser : bypass RLS) ────────────────────────────────────────
insert into auth.users (instance_id, id, aud, role, email) values
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000c1', 'authenticated', 'authenticated', 'membera@n1c.test'),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000c2', 'authenticated', 'authenticated', 'superadmin@n1c.test');
insert into public.orgs (id, name) values ('00000000-0000-0000-0000-0000000000d1', 'Org N1C');
insert into public.memberships (org_id, user_id, role) values
  ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000c1', 'admin');

-- platform_admins : on seed c2 (un vrai super-admin) → la lecture à 0 par c1 prouve la RLS,
-- pas une table vide. (platform_admin_emails est déjà seedé en 0020 = igoressbj@gmail.com.)
insert into public.platform_admins (user_id) values ('00000000-0000-0000-0000-0000000000c2');
insert into public.share_hits (bucket, window_start, hits) values ('n1c-bucket', now(), 3);
insert into public.invitations (org_id, email, role, token_hash, invited_by, expires_at)
  values ('00000000-0000-0000-0000-0000000000d1', 'invitee@n1c.test', 'ra_officer',
          'n1c_seed_token_hash', '00000000-0000-0000-0000-0000000000c1', now() + interval '7 days');

-- ── 1) ANON : aucune lecture des tables internes ────────────────────────────
set local role anon;
select set_config('request.jwt.claims', '', true);
select is_empty('select * from public.platform_admin_emails', 'anon ne lit PAS l''allowlist super-admin');
select is_empty('select * from public.share_hits', 'anon ne lit PAS les compteurs de rate-limit');

-- ── 2) AUTHENTICATED (membre d'org normal) : deny-all sur ces tables ────────
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c1"}', true);
select is((select count(*)::int from public.platform_admin_emails), 0,
  'un membre ne lit PAS l''allowlist super-admin (anti-reconnaissance)');
select is((select count(*)::int from public.platform_admins), 0,
  'un membre ne lit PAS la table platform_admins (la ligne seedée reste cachée)');
select is((select count(*)::int from public.invitations), 0,
  'un membre ne lit PAS les invitations en direct (token_hash protégé — RPC team_list seulement)');
select is((select count(*)::int from public.share_hits), 0,
  'un membre ne lit PAS les compteurs de rate-limit');

-- ── 3) Écritures refusées : auto-promotion super-admin IMPOSSIBLE (critique) ─
select throws_ok(
  $$insert into public.platform_admin_emails (email) values ('membera@n1c.test')$$,
  '42501', null,
  'un membre ne peut PAS s''ajouter à l''allowlist super-admin (RLS deny)'
);
select throws_ok(
  $$insert into public.platform_admins (user_id) values ('00000000-0000-0000-0000-0000000000c1')$$,
  '42501', null,
  'un membre ne peut PAS s''auto-promouvoir super-admin (RLS deny)'
);
select throws_ok(
  $$insert into public.share_hits (bucket, window_start) values ('forge', now())$$,
  '42501', null,
  'un membre ne peut PAS forger de compteur de rate-limit (RLS deny)'
);

select * from finish();
rollback;
