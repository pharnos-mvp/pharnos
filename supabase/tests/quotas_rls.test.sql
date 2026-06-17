-- quotas_rls.test.sql — Jalon M1 : quotas IA + plans + superadmin plateforme (migration 0019).
--
-- Prouve que :
--   1. anon ne lit RIEN (ai_usage, override, platform_admins) et ne peut PAS appeler le gate ;
--   2. un membre ne voit que l'usage IA de SON org (isolation multi-tenant) ;
--   3. consume_ai_quota : autorise sous le plafond, refuse au plafond, refuse si org désactivée ;
--   4. record_ai_usage incrémente de façon atomique ;
--   5. le trigger de plafond de dossiers bloque au-delà du quota ;
--   6. caller_org_id() et enforce_dossier_quota() ne sont PAS appelables en RPC (advisor 0028/0029) ;
--   7. is_platform_admin() est faux pour un utilisateur normal ; plan_limits est lisible (config).

begin;
select plan(18);

-- ----------------------------------------------------------------------------
-- Seeding (superuser : contourne la RLS)
-- ----------------------------------------------------------------------------
insert into auth.users (instance_id, id, aud, role, email)
values
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000aa', 'authenticated', 'authenticated', 'qa@pharnos.test'),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000bb', 'authenticated', 'authenticated', 'qb@pharnos.test');

insert into public.orgs (id, name)
values
  ('00000000-0000-0000-0000-0000000000a1', 'Org A'),
  ('00000000-0000-0000-0000-0000000000b2', 'Org B');

-- Org A sur 'pro' (Regafy activé, 200 000 tokens) : le nouveau 'free' = 0 token / Regafy off (O),
-- on teste donc le gate de TOKENS sur un plan où l'IA est activée.
update public.orgs set plan = 'pro' where id = '00000000-0000-0000-0000-0000000000a1';

insert into public.memberships (org_id, user_id, role)
values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000aa', 'admin'),
  ('00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000000bb', 'admin');

-- Usage IA existant : Org A a déjà consommé un peu ce mois-ci ; Org B rien.
insert into public.ai_usage (org_id, period_month, kind, calls, input_tokens, output_tokens)
values ('00000000-0000-0000-0000-0000000000a1', date_trunc('month', now())::date, 'regafy', 1, 1000, 500);

-- ----------------------------------------------------------------------------
-- 1) ANON : aucun accès en lecture, ni au gate
-- ----------------------------------------------------------------------------
set local role anon;
select set_config('request.jwt.claims', '', true);

select is_empty('select * from public.ai_usage', 'anon ne lit aucun ai_usage');
select is_empty('select * from public.org_quota_override', 'anon ne lit aucun org_quota_override');
select is_empty('select * from public.platform_admins', 'anon ne lit aucun platform_admin');
select throws_ok(
  'select public.consume_ai_quota(''regafy'')',
  '42501',
  null,
  'anon ne peut PAS appeler consume_ai_quota (execute révoqué)'
);

-- ----------------------------------------------------------------------------
-- 2) Membre Org A (authenticated) : isolation + gate
-- ----------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000aa"}', true);

select is(
  (select count(*)::int from public.ai_usage),
  1,
  'le membre A ne voit QUE l''usage de son org (1 ligne, pas celle de B)'
);
select is(
  (public.consume_ai_quota('regafy') ->> 'allowed')::boolean,
  true,
  'gate : autorisé sous le plafond'
);
select is(
  (public.consume_ai_quota('regafy') ->> 'cap')::bigint,
  200000::bigint,
  'gate : plafond = plan pro (200 000 tokens)'
);
select is(public.is_platform_admin(), false, 'utilisateur normal : is_platform_admin = false');
select is(
  (select count(*)::int from public.plan_limits),
  5,
  'plan_limits (config globale) lisible par un authentifié : 5 plans'
);

-- caller_org_id / enforce_dossier_quota : NON appelables en RPC (lockdown advisor).
select throws_ok(
  'select public.caller_org_id()',
  '42501',
  null,
  'caller_org_id() non appelable par authenticated (interne uniquement)'
);
select throws_ok(
  'select public.enforce_dossier_quota()',
  '42501',
  null,
  'enforce_dossier_quota() non appelable par authenticated (fn de trigger)'
);

-- record_ai_usage : incrément atomique (callable par authenticated, résout l'org via auth.uid()).
select public.record_ai_usage('translate', 200, 100);
select is(
  (select input_tokens + output_tokens from public.ai_usage
   where org_id = '00000000-0000-0000-0000-0000000000a1' and kind = 'translate'),
  300::bigint,
  'record_ai_usage : 300 tokens enregistrés pour translate'
);

-- ----------------------------------------------------------------------------
-- 2bis) Garde d'OFFRE Regafy (migration 0034) : Org B est sur 'free' (Regafy OFF) → feature_disabled,
--       y compris avec un override de TOKENS (anti-fuite Gemini payant, cf. revue gate-N).
-- ----------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000bb"}', true);
select is(
  public.consume_ai_quota('regafy') ->> 'reason',
  'feature_disabled',
  'gate : plan free (Regafy hors offre) → refus feature_disabled'
);

-- Exploit fermé : un override de tokens SANS toucher `features` ne débloque PAS l'IA (feature prime).
reset role;
insert into public.org_quota_override (org_id, monthly_ai_tokens)
values ('00000000-0000-0000-0000-0000000000b2', 500000);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000bb"}', true);
select is(
  public.consume_ai_quota('regafy') ->> 'reason',
  'feature_disabled',
  'gate : override de tokens sur plan free → toujours feature_disabled (anti-fuite)'
);

-- ----------------------------------------------------------------------------
-- 3) Plafond atteint → refus (fail-closed)
-- ----------------------------------------------------------------------------
reset role;
update public.ai_usage set input_tokens = 1000000, output_tokens = 0
  where org_id = '00000000-0000-0000-0000-0000000000a1' and kind = 'regafy';

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000aa"}', true);
select is(
  (public.consume_ai_quota('regafy') ->> 'allowed')::boolean,
  false,
  'gate : refusé quand le cumul du mois atteint le plafond'
);
select is(
  public.consume_ai_quota('regafy') ->> 'reason',
  'quota_exceeded',
  'gate : raison quota_exceeded'
);

-- ----------------------------------------------------------------------------
-- 4) Org désactivée → refus (org_disabled), même sous le plafond
-- ----------------------------------------------------------------------------
reset role;
update public.orgs set disabled_at = now() where id = '00000000-0000-0000-0000-0000000000b2';

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000bb"}', true);
select is(
  public.consume_ai_quota('regafy') ->> 'reason',
  'org_disabled',
  'gate : org désactivée → refus org_disabled'
);

-- ----------------------------------------------------------------------------
-- 5) Trigger plafond de dossiers (override = 0 → bloque, errcode check_violation 23514)
-- ----------------------------------------------------------------------------
reset role;
insert into public.org_quota_override (org_id, max_dossiers)
values ('00000000-0000-0000-0000-0000000000a1', 0);
select throws_ok(
  $$insert into public.dossiers (id, org_id, product_name, format, activity, country)
    values (gen_random_uuid(), '00000000-0000-0000-0000-0000000000a1', 'X', 'CTD', 'Nouvelle AMM', 'BJ')$$,
  '23514',
  null,
  'trigger : insertion de dossier bloquée au-delà du plafond'
);

select * from finish();
rollback;
