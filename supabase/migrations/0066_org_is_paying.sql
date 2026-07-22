-- 0066_org_is_paying.sql — Filigrane « Made with Pharnos » : distinguer un client PAYANT d'un
-- compte gratuit / essai / pilote. Aucun état d'abonnement n'existait (`billing_period` = cadence
-- mensuelle/annuelle, PAS « paie / paie pas »). `is_paying` défaut FALSE → tant que le paiement
-- n'est pas branché, TOUS les comptes portent le filigrane ; on exempte un vrai payant en le
-- passant à true (console admin / SQL service_role). Les couvertures des dossiers compilés lisent
-- ce drapeau via `my_org_plan` (gate offline-first : filigrane = NON payant).

alter table public.orgs add column if not exists is_paying boolean not null default false;

-- my_org_plan : recréée à l'identique de 0049 + expose `is_paying` au front.
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
      'is_paying', o.is_paying,
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
