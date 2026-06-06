-- 0002_products_documents.sql — Produits, documents, création d'org, Storage (M1)

-- Création d'une organisation + rattachement de l'utilisateur courant comme admin.
-- SECURITY DEFINER : contourne la RLS (orgs/memberships en deny par défaut) de façon contrôlée.
create or replace function public.create_org(org_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_org_id uuid;
begin
  if coalesce(trim(org_name), '') = '' then
    raise exception 'Nom d''organisation requis';
  end if;
  insert into public.orgs (name) values (trim(org_name)) returning id into new_org_id;
  insert into public.memberships (org_id, user_id, role) values (new_org_id, auth.uid(), 'admin');
  return new_org_id;
end;
$$;

revoke all on function public.create_org(text) from public, anon;
grant execute on function public.create_org(text) to authenticated;

-- Produits (miroir serveur de l'entité locale Dexie ; mapping camelCase <-> snake_case côté sync).
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id) on delete cascade,
  nom_commercial text not null,
  dci text not null,
  dosage text not null default '',
  forme text not null default '',
  presentation text not null default '',
  classe_therapeutique text not null default '',
  code_atc text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists products_org_idx on public.products (org_id);

alter table public.products enable row level security;

drop policy if exists products_select on public.products;
create policy products_select on public.products
  for select using (org_id in (select public.current_user_org_ids()));

drop policy if exists products_insert on public.products;
create policy products_insert on public.products
  for insert with check (org_id in (select public.current_user_org_ids()));

drop policy if exists products_update on public.products;
create policy products_update on public.products
  for update using (org_id in (select public.current_user_org_ids()))
  with check (org_id in (select public.current_user_org_ids()));

drop policy if exists products_delete on public.products;
create policy products_delete on public.products
  for delete using (org_id in (select public.current_user_org_ids()));

-- Documents (métadonnées ; les fichiers vivent dans Storage).
create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id) on delete cascade,
  product_id uuid references public.products (id) on delete cascade,
  category text not null check (category in ('info', 'admin')),
  doc_type text not null,
  file_path text,
  language text,
  expiry_date date,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists documents_org_idx on public.documents (org_id);
create index if not exists documents_product_idx on public.documents (product_id);

alter table public.documents enable row level security;

drop policy if exists documents_all on public.documents;
create policy documents_all on public.documents
  for all using (org_id in (select public.current_user_org_ids()))
  with check (org_id in (select public.current_user_org_ids()));

-- Storage : bucket privé des documents. Convention de chemin : <org_id>/<product_id>/<fichier>
insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do nothing;

drop policy if exists documents_storage_select on storage.objects;
create policy documents_storage_select on storage.objects
  for select using (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] in (select public.current_user_org_ids()::text)
  );

drop policy if exists documents_storage_insert on storage.objects;
create policy documents_storage_insert on storage.objects
  for insert with check (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] in (select public.current_user_org_ids()::text)
  );

drop policy if exists documents_storage_delete on storage.objects;
create policy documents_storage_delete on storage.objects
  for delete using (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] in (select public.current_user_org_ids()::text)
  );
