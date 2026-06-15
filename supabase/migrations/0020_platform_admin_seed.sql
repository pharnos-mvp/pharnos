-- 0020_platform_admin_seed.sql — Jalon M : désignation du/des super-admin(s) Pharnos.
--
-- Le super-admin est accordé par ALLOWLIST D'E-MAILS (et non par user_id) : le compte CEO
-- peut ne pas encore exister dans auth.users au moment du seed. is_platform_admin() devient vrai
-- AUTOMATIQUEMENT dès la première connexion de cet e-mail — pas de chicken-and-egg, pas de seed
-- « deviné » par user_id. (Les grants explicites par user_id restent possibles via platform_admins.)
--
-- god-mode cross-tenant : aucune policy RLS (deny-all) ; lu uniquement par is_platform_admin()
-- (SECURITY DEFINER) et par l'Edge `admin` en service-role.

create extension if not exists citext;

create table if not exists public.platform_admin_emails (
  email citext primary key,
  created_at timestamptz not null default now()
);
alter table public.platform_admin_emails enable row level security;

-- Compte super-admin Pharnos (choix CEO, 2026-06-15).
insert into public.platform_admin_emails (email) values ('igoressbj@gmail.com')
on conflict (email) do nothing;

-- is_platform_admin : user_id explicite (platform_admins) OU e-mail dans l'allowlist.
create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.platform_admins where user_id = auth.uid())
      or exists (
        select 1
        from public.platform_admin_emails pae
        join auth.users u on u.email = pae.email
        where u.id = auth.uid()
      )
$$;
revoke all on function public.is_platform_admin() from public, anon;
grant execute on function public.is_platform_admin() to authenticated;
