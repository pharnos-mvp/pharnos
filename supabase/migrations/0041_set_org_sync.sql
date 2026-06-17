-- 0041_set_org_sync.sql — P1/M3b : interrupteur de synchro cloud PAR ORG (choix opt-in, admin-only).
--
-- La colonne orgs.sync_enabled existe (0039). Ici le RPC qui permet à un admin d'org de basculer
-- « cloud activé / mode local ». L'enforcement (gate des modules de sync) est côté client (lit
-- my_org_plan.sync_enabled, mis en cache). Tracé à l'audit.

create or replace function public.set_org_sync(p_enabled boolean)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_org uuid := public.caller_org_id();
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
revoke all on function public.set_org_sync(boolean) from public, anon;
grant execute on function public.set_org_sync(boolean) to authenticated;
