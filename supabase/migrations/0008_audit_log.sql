-- 0008_audit_log.sql — Journal d'audit (ALCOA++ / intégrité des données)
-- Append-only : SELECT + INSERT pour les membres de l'org ; aucune policy UPDATE/DELETE
-- (RLS refuse donc toute modification/suppression → entrées immuables).

create table if not exists public.audit_log (
  id uuid primary key,
  org_id uuid not null references public.orgs (id) on delete cascade,
  actor_id text not null,
  actor_email text not null,
  entity text not null,
  entity_id text not null,
  action text not null,
  label text not null default '',
  at timestamptz not null default now()
);
create index if not exists audit_log_org_at_idx on public.audit_log (org_id, at desc);

alter table public.audit_log enable row level security;

drop policy if exists audit_log_select on public.audit_log;
create policy audit_log_select on public.audit_log
  for select using (org_id in (select public.current_user_org_ids()));

drop policy if exists audit_log_insert on public.audit_log;
create policy audit_log_insert on public.audit_log
  for insert with check (org_id in (select public.current_user_org_ids()));
