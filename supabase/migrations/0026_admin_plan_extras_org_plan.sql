-- 0026_admin_plan_extras_org_plan.sql — Jalon O1 (suite) :
--   - admin_set_plan_limits : édite AUSSI max_seats + dossiers_period (console /admin complète).
--   - my_org_plan() : expose au front le plan effectif de SON org (plan, features, caps, usage) →
--     gating UI (masquer Regafy si feature off), affichage des plafonds. Self-scoped (caller_org_id).

drop function if exists public.admin_set_plan_limits(public.plan_tier, int, bigint, jsonb, uuid, text, text);

create or replace function public.admin_set_plan_limits(
  p_plan public.plan_tier, p_max_dossiers int, p_dossiers_period text, p_monthly_ai_tokens bigint,
  p_max_seats int, p_features jsonb, p_actor_org uuid, p_actor_id text, p_actor_email text)
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
        features = coalesce(p_features, features),
        updated_at = now()
  where plan = p_plan;
  insert into public.audit_log (id, org_id, actor_id, actor_email, entity, entity_id, action, label)
  values (gen_random_uuid(), p_actor_org, p_actor_id, p_actor_email, 'plan', p_plan::text,
          'admin_set_plan_limits',
          p_plan::text || ' dossiers=' || coalesce(p_max_dossiers::text, '∞') || '/' || coalesce(nullif(p_dossiers_period, ''), '?') ||
          ' tokens=' || coalesce(p_monthly_ai_tokens::text, '∞') || ' sièges=' || coalesce(p_max_seats::text, '∞'));
end;
$$;
revoke all on function public.admin_set_plan_limits(public.plan_tier, int, text, bigint, int, jsonb, uuid, text, text) from public, anon, authenticated;
grant execute on function public.admin_set_plan_limits(public.plan_tier, int, text, bigint, int, jsonb, uuid, text, text) to service_role;

-- Plan effectif de l'org du caller (pour le front).
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
      'features', coalesce(ov.features, pl.features),
      'tokens_used', (select coalesce(sum(input_tokens + output_tokens), 0) from public.ai_usage
                      where org_id = v_org and period_month = date_trunc('month', now())::date),
      'dossiers_used', (select count(*) from public.dossiers
                        where org_id = v_org and deleted_at is null
                          and (v_period = 'lifetime' or created_at >= date_trunc('month', now())))
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
