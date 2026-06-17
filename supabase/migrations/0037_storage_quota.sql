-- 0037_storage_quota.sql — Jalon N3-b (D1+) : quota de STOCKAGE par org, administrable en god mode.
--
-- Parité avec le quota de tokens IA (jalon M) : `max_storage_bytes` sur plan_limits + override,
-- usage par org (somme des objets Storage préfixés `<org_id>/`), exposé au front (my_org_plan) et à
-- la console admin (admin_orgs + édition via admin_set_plan_limits / admin_set_org_quota).
-- D1 = MESURER + MONTRER + ADMINISTRER les valeurs ; le BLOCAGE DUR à l'upload reste D2 (bascule Pro).
-- Paliers validés CEO : free 1 / pro 20 / team 50 / business 100 / enterprise ∞ Go.

-- ── 1) Colonnes + seed des paliers ──────────────────────────────────────────────────────────
alter table public.plan_limits add column if not exists max_storage_bytes bigint;
alter table public.org_quota_override add column if not exists max_storage_bytes bigint;

update public.plan_limits set max_storage_bytes = v.bytes
from (values
  ('free'::public.plan_tier, 1073741824::bigint),       -- 1 Go
  ('pro'::public.plan_tier, 21474836480::bigint),       -- 20 Go
  ('team'::public.plan_tier, 53687091200::bigint),      -- 50 Go
  ('business'::public.plan_tier, 107374182400::bigint), -- 100 Go
  ('enterprise'::public.plan_tier, null::bigint)        -- ∞
) as v(plan, bytes)
where public.plan_limits.plan = v.plan;

-- ── 2) Usage stockage de l'org du caller (front) ────────────────────────────────────────────
-- storage.objects n'est pas lisible en RLS côté client → SECURITY DEFINER, self-scoped (caller_org_id).
create or replace function public.org_storage_usage()
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum((o.metadata->>'size')::bigint), 0)
  from storage.objects o
  where o.bucket_id = 'documents'
    and o.name like (public.caller_org_id()::text || '/%')
$$;
revoke all on function public.org_storage_usage() from public, anon;
grant execute on function public.org_storage_usage() to authenticated;

-- ── 3) my_org_plan() : expose le cap + l'usage stockage (recréée avec les champs en plus) ────
create or replace function public.my_org_plan()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_org uuid := public.caller_org_id();
  v_period text;
begin
  if v_org is null then
    return null;
  end if;
  select pl.dossiers_period into v_period
  from public.orgs o join public.plan_limits pl on pl.plan = o.plan where o.id = v_org;
  return (
    select jsonb_build_object(
      'plan', o.plan,
      'billing_period', o.billing_period,
      'disabled', o.disabled_at is not null,
      'max_dossiers', coalesce(ov.max_dossiers, pl.max_dossiers),
      'dossiers_period', pl.dossiers_period,
      'monthly_ai_tokens', coalesce(ov.monthly_ai_tokens, pl.monthly_ai_tokens),
      'max_seats', coalesce(ov.max_seats, pl.max_seats),
      'max_storage_bytes', coalesce(ov.max_storage_bytes, pl.max_storage_bytes),
      'features', coalesce(ov.features, pl.features),
      'tokens_used', (select coalesce(sum(input_tokens + output_tokens), 0) from public.ai_usage
                      where org_id = v_org and period_month = date_trunc('month', now())::date),
      'dossiers_used', (select count(*) from public.dossiers
                        where org_id = v_org and deleted_at is null
                          and (v_period = 'lifetime' or created_at >= date_trunc('month', now()))),
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
revoke all on function public.my_org_plan() from public, anon;
grant execute on function public.my_org_plan() to authenticated;

-- ── 4) admin_orgs() : ajoute l'usage stockage par org (override/limits passent via row_to_json) ─
create or replace function public.admin_orgs()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(t order by t->>'created_at' desc), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'id', o.id,
      'name', o.name,
      'plan', o.plan,
      'disabled_at', o.disabled_at,
      'created_at', o.created_at,
      'users', (select count(*) from public.memberships m where m.org_id = o.id),
      'dossiers', (select count(*) from public.dossiers d where d.org_id = o.id and d.deleted_at is null),
      'products', (select count(*) from public.products p where p.org_id = o.id and p.deleted_at is null),
      'ai_tokens_month', (select coalesce(sum(input_tokens + output_tokens), 0) from public.ai_usage au where au.org_id = o.id and au.period_month = date_trunc('month', now())::date),
      'storage_bytes', (select coalesce(sum((so.metadata->>'size')::bigint), 0) from storage.objects so where so.bucket_id = 'documents' and so.name like (o.id::text || '/%')),
      'override', (select row_to_json(q) from public.org_quota_override q where q.org_id = o.id),
      'limits', (select row_to_json(pl) from public.plan_limits pl where pl.plan = o.plan)
    ) as t
    from public.orgs o
  ) s
$$;

-- ── 5) admin_plan_limits() : ordre des plans complété ('team') ; max_storage_bytes via row_to_json ─
create or replace function public.admin_plan_limits()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    jsonb_agg(row_to_json(pl) order by
      array_position(array['free', 'pro', 'team', 'business', 'enterprise']::public.plan_tier[], pl.plan)),
    '[]'::jsonb)
  from public.plan_limits pl
$$;

-- ── 6) admin_set_org_quota() : ajoute max_storage_bytes (nouvelle signature) ─────────────────
drop function if exists public.admin_set_org_quota(uuid, int, bigint, text, text);
create or replace function public.admin_set_org_quota(
  p_org uuid, p_max_dossiers int, p_monthly_ai_tokens bigint, p_max_storage_bytes bigint,
  p_actor_id text, p_actor_email text)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  insert into public.org_quota_override (org_id, max_dossiers, monthly_ai_tokens, max_storage_bytes, updated_at)
  values (p_org, p_max_dossiers, p_monthly_ai_tokens, p_max_storage_bytes, now())
  on conflict (org_id) do update
    set max_dossiers = excluded.max_dossiers,
        monthly_ai_tokens = excluded.monthly_ai_tokens,
        max_storage_bytes = excluded.max_storage_bytes,
        updated_at = now();
  insert into public.audit_log (id, org_id, actor_id, actor_email, entity, entity_id, action, label)
  values (gen_random_uuid(), p_org, p_actor_id, p_actor_email, 'org', p_org::text, 'admin_set_quota',
          'override dossiers=' || coalesce(p_max_dossiers::text, '∞') ||
          ' tokens=' || coalesce(p_monthly_ai_tokens::text, '∞') ||
          ' stockage=' || coalesce(p_max_storage_bytes::text, '∞'));
end;
$$;
revoke all on function public.admin_set_org_quota(uuid, int, bigint, bigint, text, text) from public, anon, authenticated;
grant execute on function public.admin_set_org_quota(uuid, int, bigint, bigint, text, text) to service_role;

-- ── 7) admin_set_plan_limits() : ajoute max_storage_bytes (nouvelle signature) ───────────────
drop function if exists public.admin_set_plan_limits(public.plan_tier, int, text, bigint, int, jsonb, uuid, text, text);
create or replace function public.admin_set_plan_limits(
  p_plan public.plan_tier, p_max_dossiers int, p_dossiers_period text, p_monthly_ai_tokens bigint,
  p_max_seats int, p_max_storage_bytes bigint, p_features jsonb, p_actor_org uuid,
  p_actor_id text, p_actor_email text)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  update public.plan_limits
    set max_dossiers = p_max_dossiers,
        dossiers_period = coalesce(nullif(p_dossiers_period, ''), dossiers_period),
        monthly_ai_tokens = p_monthly_ai_tokens,
        max_seats = p_max_seats,
        max_storage_bytes = p_max_storage_bytes,
        features = coalesce(p_features, features),
        updated_at = now()
  where plan = p_plan;
  insert into public.audit_log (id, org_id, actor_id, actor_email, entity, entity_id, action, label)
  values (gen_random_uuid(), p_actor_org, p_actor_id, p_actor_email, 'plan', p_plan::text,
          'admin_set_plan_limits',
          p_plan::text || ' dossiers=' || coalesce(p_max_dossiers::text, '∞') || '/' || coalesce(nullif(p_dossiers_period, ''), '?') ||
          ' tokens=' || coalesce(p_monthly_ai_tokens::text, '∞') || ' sièges=' || coalesce(p_max_seats::text, '∞') ||
          ' stockage=' || coalesce(p_max_storage_bytes::text, '∞'));
end;
$$;
revoke all on function public.admin_set_plan_limits(public.plan_tier, int, text, bigint, int, bigint, jsonb, uuid, text, text) from public, anon, authenticated;
grant execute on function public.admin_set_plan_limits(public.plan_tier, int, text, bigint, int, bigint, jsonb, uuid, text, text) to service_role;
