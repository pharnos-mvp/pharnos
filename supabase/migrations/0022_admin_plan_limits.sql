-- 0022_admin_plan_limits.sql — Jalon M3 : lecture des plafonds de plan pour la console admin.
-- Service_role only (l'Edge `admin` gate is_platform_admin avant). L'édition passe par
-- admin_set_plan_limits() (migration 0021).
create or replace function public.admin_plan_limits()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    jsonb_agg(row_to_json(pl) order by
      array_position(array['free', 'pro', 'business', 'enterprise']::public.plan_tier[], pl.plan)),
    '[]'::jsonb)
  from public.plan_limits pl
$$;
revoke all on function public.admin_plan_limits() from public, anon, authenticated;
grant execute on function public.admin_plan_limits() to service_role;
