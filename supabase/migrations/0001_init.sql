-- 0001_init.sql — Socle multi-tenant + RLS (M0)
-- Organisations (tenants : laboratoires, agences), profils utilisateurs, appartenances.
-- L'isolation par organisation via RLS est le pilier de la confidentialité des données pharma.

create extension if not exists "pgcrypto";

-- Rôles applicatifs au sein d'une organisation
do $$
begin
  if not exists (select 1 from pg_type where typname = 'org_role') then
    create type public.org_role as enum ('admin', 'ra_officer', 'reviewer');
  end if;
end
$$;

-- Organisations (tenants)
create table if not exists public.orgs (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 200),
  created_at timestamptz not null default now()
);

-- Profil applicatif (1-1 avec auth.users)
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  created_at timestamptz not null default now()
);

-- Appartenance utilisateur <-> organisation (multi-tenant)
create table if not exists public.memberships (
  org_id uuid not null references public.orgs (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.org_role not null default 'ra_officer',
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);

create index if not exists memberships_user_idx on public.memberships (user_id);

-- Helper SECURITY DEFINER : organisations de l'utilisateur courant.
-- En SECURITY DEFINER il contourne la RLS de `memberships`, ce qui évite la
-- récursion infinie dans les policies tout en centralisant le contrôle tenant.
create or replace function public.current_user_org_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select org_id from public.memberships where user_id = auth.uid()
$$;

-- Active la Row Level Security
alter table public.orgs enable row level security;
alter table public.profiles enable row level security;
alter table public.memberships enable row level security;

-- Profiles : chacun gère uniquement son propre profil
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
  for select using (id = auth.uid());

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own on public.profiles
  for insert with check (id = auth.uid());

-- Orgs : un membre voit son organisation
drop policy if exists orgs_select_member on public.orgs;
create policy orgs_select_member on public.orgs
  for select using (id in (select public.current_user_org_ids()));

-- Memberships : un utilisateur voit les appartenances de ses organisations
drop policy if exists memberships_select_member on public.memberships;
create policy memberships_select_member on public.memberships
  for select using (org_id in (select public.current_user_org_ids()));

-- Création automatique du profil à l'inscription (auth.users -> profiles)
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, new.raw_user_meta_data ->> 'full_name')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
