-- 0053_admin_audit.sql — LOT 8b : journal d'audit COMPLET pour la console admin (god mode).
--
-- L'overview (0021) tronque à 25 entrées ; ici, lecture PAGINÉE de tout audit_log :
--   • pagination keyset (at desc, id desc) — stable sous insertion, pas d'OFFSET qui dérive ;
--   • filtre organisation optionnel ; jointure du nom d'org (affichage god mode) ;
--   • limite bornée serveur (1..100) quoi que demande le client.
-- Même double barrière que 0021 : SECURITY DEFINER + EXECUTE réservé service_role
-- (l'Edge `admin` vérifie is_platform_admin() AVANT tout appel).

-- Tri global par date : l'index existant (org_id, at desc) ne couvre pas le parcours
-- toutes-orgs — index dédié (at desc, id desc) = l'ordre exact du keyset.
create index if not exists audit_log_at_id_idx on public.audit_log (at desc, id desc);

create or replace function public.admin_audit(
  p_limit int default 50,
  p_before_at timestamptz default null,
  p_before_id uuid default null,
  p_org uuid default null
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(row_to_json(a)), '[]'::jsonb)
  from (
    select al.id, al.org_id, o.name as org_name, al.actor_email, al.entity, al.action, al.label, al.at
    from public.audit_log al
    left join public.orgs o on o.id = al.org_id
    where (p_org is null or al.org_id = p_org)
      and (
        p_before_at is null
        or al.at < p_before_at
        or (al.at = p_before_at and p_before_id is not null and al.id < p_before_id)
      )
    order by al.at desc, al.id desc
    limit greatest(1, least(coalesce(p_limit, 50), 100))
  ) a
$$;

revoke all on function public.admin_audit(int, timestamptz, uuid, uuid) from public, anon, authenticated;
grant execute on function public.admin_audit(int, timestamptz, uuid, uuid) to service_role;
