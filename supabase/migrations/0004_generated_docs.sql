-- 0004_generated_docs.sql — Documents générés depuis templates (Cover/PGHT/formulaires, M3)
-- Le contenu éditable (ProseMirror/TipTap) est stocké en JSONB.

create table if not exists public.generated_docs (
  id uuid primary key,
  org_id uuid not null references public.orgs (id) on delete cascade,
  -- pas de FK sur dossier_id : évite les problèmes d'ordre de synchro (le dossier peut arriver après)
  dossier_id uuid not null,
  node_number text not null,
  template_key text not null,
  title text not null,
  content jsonb not null default '{}'::jsonb,
  status text not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists generated_docs_org_idx on public.generated_docs (org_id);
create index if not exists generated_docs_dossier_idx on public.generated_docs (dossier_id);

alter table public.generated_docs enable row level security;

drop policy if exists generated_docs_all on public.generated_docs;
create policy generated_docs_all on public.generated_docs
  for all using (org_id in (select public.current_user_org_ids()))
  with check (org_id in (select public.current_user_org_ids()));
