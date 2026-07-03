-- 0049_explicit_org_rpcs.sql — CS1 : attribution d'org EXPLICITE sur les RPC self-scopés
-- (fix du bug de facturation latent découvert à l'audit multi-org du 2026-07-02).
--
-- Avant : caller_org_id() = la plus ANCIENNE org du user (created_at asc — heuristique MVP
-- « 1 org/user » de 0015). Dès le 1er utilisateur multi-org (le cas nominal CS1 : une agence
-- sert plusieurs labos), la consommation IA / compilations / stockage et les entitlements
-- étaient imputés à la MAUVAISE org.
--
-- Après : chaque RPC self-scopé accepte `p_org uuid default null` :
--   • p_org fourni  → vérifié MEMBRE côté SQL (fail-closed : non-membre = null = refus),
--   • p_org null    → fallback héritage (plus ancienne org) : les bundles déjà déployés
--     (SW/PWA) et les Edge Functions non encore mises à jour continuent de fonctionner.
-- DROP + CREATE (le défaut ajouté change la signature) dans la MÊME transaction → pas de trou
-- de service ; les privilèges sont recréés explicitement (pattern 0016 : fonctions gérées à la
-- création).

-- ── Résolution d'org : overload avec org explicite, vérifiée membre ───────────────────────────
create or replace function public.caller_org_id(p_org uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p_org is null then public.caller_org_id()
    when exists (
      select 1 from public.memberships m
      where m.org_id = p_org and m.user_id = auth.uid()
    ) then p_org
    else null
  end
$$;
revoke all on function public.caller_org_id(uuid) from public, anon, authenticated;

-- ── consume_ai_quota (0019/0032/0034/0038) ────────────────────────────────────────────────────
drop function if exists public.consume_ai_quota(text);
create or replace function public.consume_ai_quota(p_kind text, p_org uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid := public.caller_org_id(p_org);
  v_uid uuid := auth.uid();
  v_plan public.plan_tier;
  v_disabled timestamptz;
  v_features jsonb;
  v_cap bigint;
  v_used bigint;
  v_rl_per_min constant int := 120;
  v_hits int;
begin
  if v_org is null then
    return jsonb_build_object('allowed', false, 'reason', 'no_org');
  end if;

  select plan, disabled_at into v_plan, v_disabled from public.orgs where id = v_org;
  if v_disabled is not null then
    return jsonb_build_object('allowed', false, 'reason', 'org_disabled');
  end if;

  select coalesce(o.features, pl.features),
         coalesce(o.monthly_ai_tokens, pl.monthly_ai_tokens)
    into v_features, v_cap
  from public.plan_limits pl
  left join public.org_quota_override o on o.org_id = v_org
  where pl.plan = v_plan;

  -- Garde d'OFFRE Regafy : état 'enabled' requis (rétro-compat 'true'). AVANT la rafale et le cap.
  if coalesce(v_features ->> 'regafy', '') not in ('enabled', 'true') then
    return jsonb_build_object('allowed', false, 'reason', 'feature_disabled');
  end if;

  v_hits := public.share_hit('ai:' || coalesce(v_uid::text, v_org::text), 60);
  if v_hits > v_rl_per_min then
    return jsonb_build_object('allowed', false, 'reason', 'rate_limited',
                              'retry_after', 60, 'limit', v_rl_per_min);
  end if;

  if v_cap is null then
    return jsonb_build_object('allowed', true, 'remaining', null, 'cap', null);
  end if;

  select coalesce(sum(input_tokens + output_tokens), 0)
    into v_used
  from public.ai_usage
  where org_id = v_org and period_month = date_trunc('month', now())::date;

  if v_used >= v_cap then
    return jsonb_build_object('allowed', false, 'reason', 'quota_exceeded',
                              'remaining', 0, 'cap', v_cap, 'used', v_used);
  end if;

  return jsonb_build_object('allowed', true, 'remaining', v_cap - v_used, 'cap', v_cap, 'used', v_used);
end;
$$;
revoke all on function public.consume_ai_quota(text, uuid) from public, anon;
grant execute on function public.consume_ai_quota(text, uuid) to authenticated, service_role;

-- ── record_ai_usage (0019) ────────────────────────────────────────────────────────────────────
drop function if exists public.record_ai_usage(text, bigint, bigint);
create or replace function public.record_ai_usage(p_kind text, p_in bigint, p_out bigint, p_org uuid default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid := public.caller_org_id(p_org);
begin
  if v_org is null then return; end if;
  insert into public.ai_usage (org_id, period_month, kind, calls, input_tokens, output_tokens, updated_at)
  values (v_org, date_trunc('month', now())::date, coalesce(nullif(p_kind, ''), 'unknown'),
          1, greatest(coalesce(p_in, 0), 0), greatest(coalesce(p_out, 0), 0), now())
  on conflict (org_id, period_month, kind) do update
    set calls = public.ai_usage.calls + 1,
        input_tokens = public.ai_usage.input_tokens + greatest(coalesce(p_in, 0), 0),
        output_tokens = public.ai_usage.output_tokens + greatest(coalesce(p_out, 0), 0),
        updated_at = now();
end;
$$;
revoke all on function public.record_ai_usage(text, bigint, bigint, uuid) from public, anon;
grant execute on function public.record_ai_usage(text, bigint, bigint, uuid) to authenticated, service_role;

-- ── my_org_plan (0026/0034/0038/0039/0041) ────────────────────────────────────────────────────
drop function if exists public.my_org_plan();
create or replace function public.my_org_plan(p_org uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_org uuid := public.caller_org_id(p_org);
  v_period text;
  v_cperiod text;
begin
  if v_org is null then
    return null;
  end if;
  select pl.dossiers_period, pl.compilations_period into v_period, v_cperiod
  from public.orgs o join public.plan_limits pl on pl.plan = o.plan where o.id = v_org;
  return (
    select jsonb_build_object(
      'plan', o.plan,
      'billing_period', o.billing_period,
      'disabled', o.disabled_at is not null,
      'sync_enabled', o.sync_enabled,
      'max_dossiers', coalesce(ov.max_dossiers, pl.max_dossiers),
      'dossiers_period', pl.dossiers_period,
      'max_compilations', coalesce(ov.max_compilations, pl.max_compilations),
      'compilations_period', pl.compilations_period,
      'monthly_ai_tokens', coalesce(ov.monthly_ai_tokens, pl.monthly_ai_tokens),
      'max_seats', coalesce(ov.max_seats, pl.max_seats),
      'max_storage_bytes', coalesce(ov.max_storage_bytes, pl.max_storage_bytes),
      'features', coalesce(ov.features, pl.features),
      'tokens_used', (select coalesce(sum(input_tokens + output_tokens), 0) from public.ai_usage
                      where org_id = v_org and period_month = date_trunc('month', now())::date),
      'dossiers_used', (select count(*) from public.dossiers
                        where org_id = v_org and deleted_at is null
                          and (v_period = 'lifetime' or created_at >= date_trunc('month', now()))),
      'compilations_used', (select count(*) from public.compilations
                            where org_id = v_org
                              and (v_cperiod = 'lifetime' or created_at >= date_trunc('month', now()))),
      'storage_used', (select coalesce(sum((so.metadata->>'size')::bigint), 0) from storage.objects so
                       where so.bucket_id = 'documents' and so.name like (v_org::text || '/%'))
    )
    from public.orgs o
    join public.plan_limits pl on pl.plan = o.plan
    left join public.org_quota_override ov on ov.org_id = o.id
    where o.id = v_org
  );
end;
$$;
revoke all on function public.my_org_plan(uuid) from public, anon;
grant execute on function public.my_org_plan(uuid) to authenticated, service_role;

-- ── choose_plan (0029) ────────────────────────────────────────────────────────────────────────
drop function if exists public.choose_plan(public.plan_tier);
create or replace function public.choose_plan(p_plan public.plan_tier, p_org uuid default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid := public.caller_org_id(p_org);
  v_email text;
begin
  if v_org is null then
    raise exception 'Aucune organisation' using errcode = 'P0002';
  end if;
  if not public.is_org_admin(v_org) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  update public.orgs set plan = p_plan where id = v_org;

  select email into v_email from auth.users where id = auth.uid();
  insert into public.audit_log (id, org_id, actor_id, actor_email, entity, entity_id, action, label)
  values (gen_random_uuid(), v_org, auth.uid()::text, coalesce(v_email, ''), 'plan', p_plan::text,
          'choose_plan', 'plan → ' || p_plan::text);
end;
$$;
revoke all on function public.choose_plan(public.plan_tier, uuid) from public, anon;
grant execute on function public.choose_plan(public.plan_tier, uuid) to authenticated, service_role;

-- ── org_storage_usage (0037) ──────────────────────────────────────────────────────────────────
drop function if exists public.org_storage_usage();
create or replace function public.org_storage_usage(p_org uuid default null)
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum((o.metadata->>'size')::bigint), 0)
  from storage.objects o
  where o.bucket_id = 'documents'
    and o.name like (public.caller_org_id(p_org)::text || '/%')
$$;
revoke all on function public.org_storage_usage(uuid) from public, anon;
grant execute on function public.org_storage_usage(uuid) to authenticated, service_role;

-- ── record_compilation (0039) ─────────────────────────────────────────────────────────────────
drop function if exists public.record_compilation(uuid, text);
create or replace function public.record_compilation(p_dossier_id uuid, p_kind text, p_org uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid := public.caller_org_id(p_org);
  v_disabled timestamptz;
  v_plan public.plan_tier;
  v_cap int;
  v_period text;
  v_used int;
begin
  if v_org is null then
    return jsonb_build_object('allowed', false, 'reason', 'no_org');
  end if;
  select plan, disabled_at into v_plan, v_disabled from public.orgs where id = v_org;
  if v_disabled is not null then
    return jsonb_build_object('allowed', false, 'reason', 'org_disabled');
  end if;

  select coalesce(o.max_compilations, pl.max_compilations), pl.compilations_period
    into v_cap, v_period
  from public.plan_limits pl
  left join public.org_quota_override o on o.org_id = v_org
  where pl.plan = v_plan;

  if v_cap is not null then
    if v_period = 'lifetime' then
      select count(*) into v_used from public.compilations where org_id = v_org;
    else
      select count(*) into v_used from public.compilations
      where org_id = v_org and created_at >= date_trunc('month', now());
    end if;
    if v_used >= v_cap then
      return jsonb_build_object('allowed', false, 'reason', 'quota_exceeded', 'remaining', 0,
                               'cap', v_cap, 'used', v_used);
    end if;
  end if;

  insert into public.compilations (org_id, dossier_id, kind)
  values (v_org, p_dossier_id, coalesce(nullif(p_kind, ''), 'm1_pdf'));

  if v_cap is null then
    return jsonb_build_object('allowed', true, 'remaining', null, 'cap', null);
  end if;
  return jsonb_build_object('allowed', true, 'remaining', greatest(v_cap - (v_used + 1), 0),
                           'cap', v_cap, 'used', v_used + 1);
end;
$$;
revoke all on function public.record_compilation(uuid, text, uuid) from public, anon;
grant execute on function public.record_compilation(uuid, text, uuid) to authenticated, service_role;

-- ── set_org_sync (0041) ───────────────────────────────────────────────────────────────────────
drop function if exists public.set_org_sync(boolean);
create or replace function public.set_org_sync(p_enabled boolean, p_org uuid default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid := public.caller_org_id(p_org);
  v_email text;
begin
  if v_org is null then
    raise exception 'no_org' using errcode = '42501';
  end if;
  if not public.is_org_admin(v_org) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update public.orgs set sync_enabled = p_enabled where id = v_org;
  select email into v_email from auth.users where id = auth.uid();
  insert into public.audit_log (id, org_id, actor_id, actor_email, entity, entity_id, action, label)
  values (gen_random_uuid(), v_org, auth.uid()::text, coalesce(v_email, ''), 'org', v_org::text, 'set_sync',
          case when p_enabled then 'synchro cloud activée' else 'synchro cloud désactivée (mode local)' end);
end;
$$;
revoke all on function public.set_org_sync(boolean, uuid) from public, anon;
grant execute on function public.set_org_sync(boolean, uuid) to authenticated, service_role;
