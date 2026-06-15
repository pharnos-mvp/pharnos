-- 0021_admin_console.sql — Jalon M2 : API de la console admin Pharnos.
--
--   1) Coupe-circuit : current_user_org_ids() exclut les orgs désactivées (disabled_at) → couper une
--      org coupe TOUT l'accès data/membership de ses utilisateurs, via le SEUL helper qu'utilisent
--      toutes les policies (org_id in (select current_user_org_ids())). Effet RLS réel, pas un masquage UI.
--   2) Agrégats plateforme (overview/orgs/users) + actions (plan/quota/disabled/plan_limits) en
--      SECURITY DEFINER, RÉSERVÉS au service_role — l'Edge `admin` vérifie is_platform_admin() AVANT.
--
-- Aucun de ces objets n'est exposé aux rôles anon/authenticated : double barrière (gate Edge +
-- execute service_role only). Toutes les actions écrivent dans audit_log.

-- ── 1) Coupe-circuit RLS (disabled_at) ──────────────────────────────────────────────────────
create or replace function public.current_user_org_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select m.org_id
  from public.memberships m
  join public.orgs o on o.id = m.org_id
  where m.user_id = auth.uid() and o.disabled_at is null
$$;

-- ── 2a) Agrégats (lecture) — service_role only ──────────────────────────────────────────────
create or replace function public.admin_overview()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'generated_at', now(),
    'totals', jsonb_build_object(
      'orgs', (select count(*) from public.orgs),
      'orgs_active', (select count(*) from public.orgs where disabled_at is null),
      'users', (select count(*) from auth.users),
      'dossiers', (select count(*) from public.dossiers where deleted_at is null),
      'products', (select count(*) from public.products where deleted_at is null),
      'ai_tokens_month', (select coalesce(sum(input_tokens + output_tokens), 0) from public.ai_usage where period_month = date_trunc('month', now())::date),
      'ai_calls_month', (select coalesce(sum(calls), 0) from public.ai_usage where period_month = date_trunc('month', now())::date)
    ),
    'growth', jsonb_build_object(
      'orgs_30d', (select count(*) from public.orgs where created_at > now() - interval '30 days'),
      'orgs_prev_30d', (select count(*) from public.orgs where created_at > now() - interval '60 days' and created_at <= now() - interval '30 days'),
      'users_30d', (select count(*) from auth.users where created_at > now() - interval '30 days'),
      'users_prev_30d', (select count(*) from auth.users where created_at > now() - interval '60 days' and created_at <= now() - interval '30 days'),
      'dossiers_30d', (select count(*) from public.dossiers where created_at > now() - interval '30 days' and deleted_at is null),
      'dossiers_prev_30d', (select count(*) from public.dossiers where created_at > now() - interval '60 days' and created_at <= now() - interval '30 days' and deleted_at is null)
    ),
    'health', jsonb_build_object(
      'db_bytes', pg_database_size(current_database()),
      'db_cap_bytes', 524288000,
      'storage_bytes', (select coalesce(sum((metadata->>'size')::bigint), 0) from storage.objects),
      'storage_cap_bytes', 1073741824,
      'storage_objects', (select count(*) from storage.objects)
    ),
    'ai_by_kind', coalesce(
      (select jsonb_object_agg(kind, toks) from (
        select kind, sum(input_tokens + output_tokens) as toks
        from public.ai_usage where period_month = date_trunc('month', now())::date group by kind
      ) s), '{}'::jsonb),
    'recent_audit', coalesce(
      (select jsonb_agg(row_to_json(a)) from (
        select org_id, actor_email, entity, action, label, at
        from public.audit_log order by at desc limit 25
      ) a), '[]'::jsonb)
  )
$$;

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
      'override', (select row_to_json(q) from public.org_quota_override q where q.org_id = o.id),
      'limits', (select row_to_json(pl) from public.plan_limits pl where pl.plan = o.plan)
    ) as t
    from public.orgs o
  ) s
$$;

create or replace function public.admin_users()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(t order by t->>'created_at' desc), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'id', u.id,
      'email', u.email,
      'created_at', u.created_at,
      'last_sign_in_at', u.last_sign_in_at,
      'is_platform_admin',
        exists(select 1 from public.platform_admins pa where pa.user_id = u.id)
        or exists(select 1 from public.platform_admin_emails pae where pae.email = u.email),
      'memberships', coalesce((
        select jsonb_agg(jsonb_build_object('org', o.name, 'org_id', o.id, 'role', m.role))
        from public.memberships m join public.orgs o on o.id = m.org_id where m.user_id = u.id
      ), '[]'::jsonb)
    ) as t
    from auth.users u
  ) s
$$;

-- ── 2b) Actions (écriture + audit) — service_role only ──────────────────────────────────────
create or replace function public.admin_set_org_plan(
  p_org uuid, p_plan public.plan_tier, p_actor_id text, p_actor_email text)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  update public.orgs set plan = p_plan where id = p_org;
  insert into public.audit_log (id, org_id, actor_id, actor_email, entity, entity_id, action, label)
  values (gen_random_uuid(), p_org, p_actor_id, p_actor_email, 'org', p_org::text,
          'admin_set_plan', 'plan → ' || p_plan::text);
end;
$$;

create or replace function public.admin_set_org_quota(
  p_org uuid, p_max_dossiers int, p_monthly_ai_tokens bigint, p_actor_id text, p_actor_email text)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  insert into public.org_quota_override (org_id, max_dossiers, monthly_ai_tokens, updated_at)
  values (p_org, p_max_dossiers, p_monthly_ai_tokens, now())
  on conflict (org_id) do update
    set max_dossiers = excluded.max_dossiers,
        monthly_ai_tokens = excluded.monthly_ai_tokens,
        updated_at = now();
  insert into public.audit_log (id, org_id, actor_id, actor_email, entity, entity_id, action, label)
  values (gen_random_uuid(), p_org, p_actor_id, p_actor_email, 'org', p_org::text, 'admin_set_quota',
          'override dossiers=' || coalesce(p_max_dossiers::text, '∞') ||
          ' tokens=' || coalesce(p_monthly_ai_tokens::text, '∞'));
end;
$$;

create or replace function public.admin_set_org_disabled(
  p_org uuid, p_disabled boolean, p_actor_id text, p_actor_email text)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  update public.orgs set disabled_at = case when p_disabled then now() else null end where id = p_org;
  insert into public.audit_log (id, org_id, actor_id, actor_email, entity, entity_id, action, label)
  values (gen_random_uuid(), p_org, p_actor_id, p_actor_email, 'org', p_org::text, 'admin_set_disabled',
          case when p_disabled then 'organisation désactivée' else 'organisation réactivée' end);
end;
$$;

create or replace function public.admin_set_plan_limits(
  p_plan public.plan_tier, p_max_dossiers int, p_monthly_ai_tokens bigint, p_features jsonb,
  p_actor_org uuid, p_actor_id text, p_actor_email text)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  update public.plan_limits
    set max_dossiers = p_max_dossiers,
        monthly_ai_tokens = p_monthly_ai_tokens,
        features = coalesce(p_features, features),
        updated_at = now()
  where plan = p_plan;
  insert into public.audit_log (id, org_id, actor_id, actor_email, entity, entity_id, action, label)
  values (gen_random_uuid(), p_actor_org, p_actor_id, p_actor_email, 'plan', p_plan::text,
          'admin_set_plan_limits',
          p_plan::text || ' dossiers=' || coalesce(p_max_dossiers::text, '∞') ||
          ' tokens=' || coalesce(p_monthly_ai_tokens::text, '∞'));
end;
$$;

-- ── Verrou des privilèges : service_role uniquement (l'Edge gate is_platform_admin avant) ─────
do $$
declare fn text;
begin
  foreach fn in array array[
    'public.admin_overview()',
    'public.admin_orgs()',
    'public.admin_users()',
    'public.admin_set_org_plan(uuid, public.plan_tier, text, text)',
    'public.admin_set_org_quota(uuid, int, bigint, text, text)',
    'public.admin_set_org_disabled(uuid, boolean, text, text)',
    'public.admin_set_plan_limits(public.plan_tier, int, bigint, jsonb, uuid, text, text)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end
$$;
