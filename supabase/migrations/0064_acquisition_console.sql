-- 0064 — Console admin « Acquisition » : suivi des demandes de démo + rapport d'apport par expert.
--
--   • demo_requests.status/notes : pipeline de suivi des leads (Nouveau → Contacté → Démo faite →
--     Converti / Sans suite) géré par les super-admins via l'Edge `admin` (service-role — la table
--     reste RLS deny-all pour les rôles clients).
--   • admin_acquisition_report() : l'apport par expert-ambassadeur — base de la rémunération
--     « au nombre d'inscrits ». Deux niveaux comptés : inscriptions (redemptions) et organisations
--     ACTIVES (≥ 1 dossier créé — anti-gaming : un compte fantôme ne crée pas de dossier).
--     SECURITY DEFINER réservé au service_role (l'Edge `admin` gate is_platform_admin AVANT).

alter table public.demo_requests
  add column status text not null default 'nouveau'
    check (status in ('nouveau', 'contacte', 'demo_faite', 'converti', 'sans_suite')),
  add column notes text check (notes is null or char_length(notes) <= 2000),
  add column updated_at timestamptz not null default now();

create or replace function public.admin_acquisition_report()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'generated_at', now(),
    'invites', coalesce(jsonb_agg(
      jsonb_build_object(
        'id', s.id,
        'code', s.code,
        'label', s.label,
        'max_uses', s.max_uses,
        'used_count', s.used_count,
        'revoked', s.revoked,
        'expires_at', s.expires_at,
        'created_at', s.created_at,
        'signups', s.signups,
        'distinct_users', s.distinct_users,
        'orgs_live', s.orgs_live,
        'orgs_active', s.orgs_active
      ) order by s.signups desc, s.created_at desc
    ), '[]'::jsonb)
  )
  from (
    select pi.id, pi.code, pi.label, pi.max_uses, pi.used_count,
           (pi.revoked_at is not null) as revoked,
           pi.expires_at, pi.created_at,
           count(r.id)::int as signups,
           count(distinct r.user_id)::int as distinct_users,
           count(r.org_id)::int as orgs_live,
           count(r.org_id) filter (
             where exists (select 1 from public.dossiers d where d.org_id = r.org_id)
           )::int as orgs_active
    from public.platform_invites pi
    left join public.invite_redemptions r on r.invite_id = pi.id
    group by pi.id
  ) s
$$;
revoke all on function public.admin_acquisition_report() from public, anon, authenticated;
grant execute on function public.admin_acquisition_report() to service_role;
