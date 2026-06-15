-- 0025_pricing_model.sql — Jalon O1 : modèle de plans 5 tiers + enforcement.
--
--   - plan_limits += max_seats, dossiers_period (lifetime|month) ; org_quota_override += max_seats ;
--     orgs += billing_period (mensuel|annuel, métadonnée — pas d'encaissement au MVP).
--   - features jsonb += team + regafy. RESEED des 5 plans (valeurs CEO 2026-06-15).
--   - enforce_dossier_quota : period-aware (free = 1 à vie ; pro/team/business = N créés ce mois).
--   - consume_ai_quota : garde feature 'regafy' (free → feature_disabled) avant la garde tokens.
--   - create_invitation : garde feature 'team' (free/pro → team_disabled) + plafond de sièges.

-- ── Colonnes ────────────────────────────────────────────────────────────────────────────────
alter table public.plan_limits add column if not exists max_seats int;
alter table public.plan_limits add column if not exists dossiers_period text not null default 'month'
  check (dossiers_period in ('lifetime', 'month'));
alter table public.org_quota_override add column if not exists max_seats int;
alter table public.orgs add column if not exists billing_period text not null default 'monthly'
  check (billing_period in ('monthly', 'annual'));

-- ── Reseed des 5 plans (valeurs CEO ; éditables ensuite depuis /admin) ───────────────────────
-- features : team (multi-utilisateurs) + regafy (copilote IA) + capacités héritées. NULL = illimité.
insert into public.plan_limits (plan, max_dossiers, dossiers_period, monthly_ai_tokens, max_seats, features) values
  ('free',       1,    'lifetime', 0,        1,    '{"team":false,"regafy":false,"translation":false,"correspondence":true,"audit_global":false,"upgrade_templates":false}'),
  ('pro',        5,    'month',    200000,   1,    '{"team":false,"regafy":true,"translation":true,"correspondence":true,"audit_global":true,"upgrade_templates":true}'),
  ('team',       15,   'month',    1000000,  null, '{"team":true,"regafy":true,"translation":true,"correspondence":true,"audit_global":true,"upgrade_templates":true}'),
  ('business',   50,   'month',    5000000,  null, '{"team":true,"regafy":true,"translation":true,"correspondence":true,"audit_global":true,"upgrade_templates":true}'),
  ('enterprise', null, 'month',    null,     null, '{"team":true,"regafy":true,"translation":true,"correspondence":true,"audit_global":true,"upgrade_templates":true}')
on conflict (plan) do update set
  max_dossiers = excluded.max_dossiers,
  dossiers_period = excluded.dossiers_period,
  monthly_ai_tokens = excluded.monthly_ai_tokens,
  max_seats = excluded.max_seats,
  features = excluded.features,
  updated_at = now();

-- ── enforce_dossier_quota : period-aware ────────────────────────────────────────────────────
create or replace function public.enforce_dossier_quota()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_cap int;
  v_period text;
  v_count int;
begin
  select coalesce(o.max_dossiers, pl.max_dossiers), pl.dossiers_period
    into v_cap, v_period
  from public.orgs org
  join public.plan_limits pl on pl.plan = org.plan
  left join public.org_quota_override o on o.org_id = org.id
  where org.id = new.org_id;

  if v_cap is null then
    return new; -- illimité
  end if;

  if v_period = 'lifetime' then
    select count(*) into v_count from public.dossiers
    where org_id = new.org_id and deleted_at is null;
  else
    select count(*) into v_count from public.dossiers
    where org_id = new.org_id and deleted_at is null
      and created_at >= date_trunc('month', now());
  end if;

  if v_count >= v_cap then
    raise exception 'quota_dossiers: plafond de % dossiers (%) atteint', v_cap, v_period
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

-- ── consume_ai_quota : garde feature 'regafy' AVANT la garde tokens ──────────────────────────
create or replace function public.consume_ai_quota(p_kind text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_org uuid := public.caller_org_id();
  v_plan public.plan_tier;
  v_disabled timestamptz;
  v_features jsonb;
  v_cap bigint;
  v_used bigint;
begin
  if v_org is null then
    return jsonb_build_object('allowed', false, 'reason', 'no_org');
  end if;
  select plan, disabled_at into v_plan, v_disabled from public.orgs where id = v_org;
  if v_disabled is not null then
    return jsonb_build_object('allowed', false, 'reason', 'org_disabled');
  end if;

  -- Feature Regafy (copilote IA). Effective = override de l'org sinon plan. Free → pas d'IA (Monitor seul).
  select coalesce(o.features, pl.features) into v_features
  from public.plan_limits pl
  left join public.org_quota_override o on o.org_id = v_org
  where pl.plan = v_plan;
  if coalesce((v_features ->> 'regafy')::boolean, false) is not true then
    return jsonb_build_object('allowed', false, 'reason', 'feature_disabled');
  end if;

  select coalesce(o.monthly_ai_tokens, pl.monthly_ai_tokens) into v_cap
  from public.plan_limits pl
  left join public.org_quota_override o on o.org_id = v_org
  where pl.plan = v_plan;
  if v_cap is null then
    return jsonb_build_object('allowed', true, 'remaining', null, 'cap', null);
  end if;

  select coalesce(sum(input_tokens + output_tokens), 0) into v_used
  from public.ai_usage
  where org_id = v_org and period_month = date_trunc('month', now())::date;
  if v_used >= v_cap then
    return jsonb_build_object('allowed', false, 'reason', 'quota_exceeded', 'remaining', 0, 'cap', v_cap, 'used', v_used);
  end if;
  return jsonb_build_object('allowed', true, 'remaining', v_cap - v_used, 'cap', v_cap, 'used', v_used);
end;
$$;

-- ── create_invitation : garde feature 'team' + plafond de sièges ─────────────────────────────
create or replace function public.create_invitation(
  p_org uuid, p_email citext, p_role public.org_role, p_token_hash text, p_expires_at timestamptz)
returns uuid language plpgsql volatile security definer set search_path = public as $$
declare
  v_id uuid;
  v_email text;
  v_features jsonb;
  v_seats int;
  v_used int;
begin
  if not public.is_org_admin(p_org) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select coalesce(o.features, pl.features), coalesce(o.max_seats, pl.max_seats)
    into v_features, v_seats
  from public.orgs org
  join public.plan_limits pl on pl.plan = org.plan
  left join public.org_quota_override o on o.org_id = org.id
  where org.id = p_org;

  if coalesce((v_features ->> 'team')::boolean, false) is not true then
    raise exception 'team_disabled' using errcode = '42501';
  end if;

  -- Plafond de sièges = membres + invitations en attente (NULL = illimité).
  if v_seats is not null then
    select (select count(*) from public.memberships where org_id = p_org)
         + (select count(*) from public.invitations where org_id = p_org and accepted_at is null and expires_at > now())
      into v_used;
    if v_used >= v_seats then
      raise exception 'seats_full' using errcode = 'check_violation';
    end if;
  end if;

  select email into v_email from auth.users where id = auth.uid();
  insert into public.invitations (org_id, email, role, token_hash, invited_by, invited_by_email, expires_at)
  values (p_org, p_email, p_role, p_token_hash, auth.uid(), v_email, p_expires_at)
  returning id into v_id;
  insert into public.audit_log (id, org_id, actor_id, actor_email, entity, entity_id, action, label)
  values (gen_random_uuid(), p_org, auth.uid()::text, coalesce(v_email, ''), 'invitation', v_id::text,
          'invite', 'invitation ' || p_email::text || ' (' || p_role::text || ')');
  return v_id;
end;
$$;
