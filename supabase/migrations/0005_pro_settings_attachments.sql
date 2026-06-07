-- 0005_pro_settings_attachments.sql — Profil pro (en-tête/pied/signature) + pièces jointes par nœud (M3.1)

-- Profil pro : en-tête/pied (org) + signature (utilisateur). Images stockées en data URL (text).
create table if not exists public.pro_settings (
  id text primary key, -- 'org:{orgId}' (branding) ou 'user:{userId}' (signature)
  org_id uuid not null references public.orgs (id) on delete cascade,
  kind text not null,
  header_image text,
  footer_image text,
  signature_image text,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists pro_settings_org_idx on public.pro_settings (org_id);

alter table public.pro_settings enable row level security;

drop policy if exists pro_settings_all on public.pro_settings;
create policy pro_settings_all on public.pro_settings
  for all using (org_id in (select public.current_user_org_ids()))
  with check (org_id in (select public.current_user_org_ids()));

-- Pièces jointes téléversées directement sur un nœud de dossier (blob dans Storage bucket 'documents').
create table if not exists public.dossier_attachments (
  id uuid primary key,
  org_id uuid not null references public.orgs (id) on delete cascade,
  -- pas de FK sur dossier_id : évite les problèmes d'ordre de synchro
  dossier_id uuid not null,
  node_number text not null,
  file_path text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists dossier_attachments_org_idx on public.dossier_attachments (org_id);
create index if not exists dossier_attachments_dossier_idx on public.dossier_attachments (dossier_id);

alter table public.dossier_attachments enable row level security;

drop policy if exists dossier_attachments_all on public.dossier_attachments;
create policy dossier_attachments_all on public.dossier_attachments
  for all using (org_id in (select public.current_user_org_ids()))
  with check (org_id in (select public.current_user_org_ids()));
