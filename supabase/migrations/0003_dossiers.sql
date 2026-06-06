-- 0003_dossiers.sql — Dossiers CTD/eCTD (CTD Workspace, M2)
-- L'arborescence Module 1 (éditée par l'utilisateur) est stockée en JSONB.

create table if not exists public.dossiers (
  id uuid primary key,
  org_id uuid not null references public.orgs (id) on delete cascade,
  -- pas de FK sur product_id : évite les problèmes d'ordre de synchro (le produit peut arriver après)
  product_id uuid,
  product_name text not null,
  format text not null,
  activity text not null,
  country text not null,
  status text not null default 'draft',
  tree jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists dossiers_org_idx on public.dossiers (org_id);

alter table public.dossiers enable row level security;

drop policy if exists dossiers_all on public.dossiers;
create policy dossiers_all on public.dossiers
  for all using (org_id in (select public.current_user_org_ids()))
  with check (org_id in (select public.current_user_org_ids()));
