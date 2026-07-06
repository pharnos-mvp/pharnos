-- reminder_settings.test.sql — Config des relances par org (0055).
--
-- Prouve les invariants de sécurité/correction introduits par la page « Relances » :
--   1. set_reminder_settings = admin-only + org vérifiée membre (fail-closed) ;
--   2. lecture (get) autorisée à tout membre, refusée (null) au non-membre ;
--   3. écriture DIRECTE de la table refusée (RLS fermée → RPC security-definer only) ;
--   4. bornage serveur : jours [1..365], préavis plancher légal 90 j ;
--   5. RÉGRESSION M1 : une valeur jsonb NON numérique ne lève pas d'exception (défaut appliqué) ;
--   6. l'écriture est tracée à l'audit (action='set_reminders').

begin;
select plan(15);

-- ── Seeding ──────────────────────────────────────────────────────────────────
insert into auth.users (instance_id, id, aud, role, email)
values
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000a1', 'authenticated', 'authenticated', 'admin@rs.test'),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000a2', 'authenticated', 'authenticated', 'member@rs.test'),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000a3', 'authenticated', 'authenticated', 'stranger@rs.test');

insert into public.orgs (id, name, plan)
values ('00000000-0000-0000-0000-0000000000b1', 'Org RS', 'free');

-- a1 = admin, a2 = membre NON-admin (expert_ra) ; a3 = non-membre.
insert into public.memberships (org_id, user_id, role)
values
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000a1', 'admin'),
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000a2', 'expert_ra');

set local role authenticated;

-- ── 1) Non-membre (a3) : écriture refusée, lecture null ───────────────────────
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a3"}', true);
select throws_ok(
  $$ select public.set_reminder_settings(true, 14, 60, true, true, '{}'::jsonb, '00000000-0000-0000-0000-0000000000b1') $$,
  '42501', null,
  'set_reminder_settings(non-membre) : refus 42501 (no_org, fail-closed)'
);
select ok(
  public.get_reminder_settings('00000000-0000-0000-0000-0000000000b1') is null,
  'get_reminder_settings(non-membre) : null'
);

-- ── 2) Membre NON-admin (a2) : écriture refusée, lecture = défauts ─────────────
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a2"}', true);
select throws_ok(
  $$ select public.set_reminder_settings(true, 14, 60, true, true, '{}'::jsonb, '00000000-0000-0000-0000-0000000000b1') $$,
  '42501', null,
  'set_reminder_settings(membre non-admin) : forbidden 42501'
);
select ok(
  public.get_reminder_settings('00000000-0000-0000-0000-0000000000b1') is not null,
  'get_reminder_settings(membre) : lisible (RLS select membres)'
);
select is(
  (public.get_reminder_settings('00000000-0000-0000-0000-0000000000b1') ->> 'roadmap_agency_days'),
  '60',
  'get(défauts) : seuil agence par défaut = 60 j'
);
-- Écriture DIRECTE de la table : refusée par la RLS (aucune policy d'écriture).
select throws_ok(
  $$ insert into public.reminder_settings (org_id) values ('00000000-0000-0000-0000-0000000000b1') $$,
  '42501', null,
  'INSERT direct table : refusé par la RLS (écriture = RPC only)'
);

-- ── 3) Admin (a1) : écriture bornée + régression M1 ────────────────────────────
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1"}', true);
-- agent 999 → 365, agence 0 → 1 ; lead: gmp "abc" (non numérique) → défaut, copp 30 → plancher 90,
-- amm 250 conservé. Le point M1 : la valeur "abc" NE DOIT PAS lever d'exception.
select lives_ok(
  $$ select public.set_reminder_settings(false, 999, 0, false, true,
       '{"gmp":"abc","copp":30,"amm":250}'::jsonb, '00000000-0000-0000-0000-0000000000b1') $$,
  'M1 : valeur jsonb non numérique ("abc") ne lève pas — cast gardé'
);
select is(
  (public.get_reminder_settings('00000000-0000-0000-0000-0000000000b1') ->> 'roadmap_agent_days'),
  '365', 'agent 999 → borné à 365'
);
select is(
  (public.get_reminder_settings('00000000-0000-0000-0000-0000000000b1') ->> 'roadmap_agency_days'),
  '1', 'agence 0 → borné à 1'
);
select is(
  (public.get_reminder_settings('00000000-0000-0000-0000-0000000000b1') -> 'monitoring_lead_days' ->> 'gmp'),
  '180', 'gmp "abc" (non numérique) → défaut 180 (M1)'
);
select is(
  (public.get_reminder_settings('00000000-0000-0000-0000-0000000000b1') -> 'monitoring_lead_days' ->> 'copp'),
  '90', 'copp 30 → remonté au plancher légal 90 j'
);
select is(
  (public.get_reminder_settings('00000000-0000-0000-0000-0000000000b1') -> 'monitoring_lead_days' ->> 'amm'),
  '250', 'amm 250 (dans les bornes) → conservé'
);
select is(
  (public.get_reminder_settings('00000000-0000-0000-0000-0000000000b1') ->> 'roadmap_auto_enabled'),
  'false', 'roadmap auto désactivé → enregistré'
);
select is(
  (public.get_reminder_settings('00000000-0000-0000-0000-0000000000b1') ->> 'roadmap_email_enabled'),
  'false', 'canal e-mail désactivé → enregistré'
);
select is(
  (select count(*)::int from public.audit_log
     where org_id = '00000000-0000-0000-0000-0000000000b1' and action = 'set_reminders'),
  1, 'écriture tracée à l''audit (action=set_reminders)'
);

select * from finish();
rollback;
