-- 0018_share_security_l1.sql — Sécurité L1 du partage (Correspondance v2, décision CEO) :
-- expiration des liens, révocation automatique après décision, journal d'accès visible labo.
--
-- Modèle inchangé (ADR-0003) : le reviewer n'écrit/lit QUE via l'Edge `share` (service-role) ;
-- le journal est en lecture seule pour les membres de l'org (traçabilité), écrit par l'Edge.

-- Expiration optionnelle du lien (null = sans expiration) + révocation auto post-décision.
alter table public.correspondences
  add column if not exists expires_at timestamptz,
  add column if not exists auto_revoke_on_decision boolean not null default false;

-- Journal d'accès du lien public : qui a ouvert/décidé/répondu, quand, depuis où (IP hashée —
-- corrélable mais non réversible, posture zéro-PII des logs ; user-agent tronqué).
create table if not exists public.share_access_log (
  id uuid primary key default gen_random_uuid(),
  correspondence_id uuid not null references public.correspondences (id) on delete cascade,
  org_id uuid not null references public.orgs (id) on delete cascade,
  action text not null check (action in ('open', 'decide', 'reply')),
  ip_hash text not null,
  user_agent text,
  at timestamptz not null default now()
);

create index if not exists share_access_log_corr_idx
  on public.share_access_log (correspondence_id, at desc);
create index if not exists share_access_log_org_idx on public.share_access_log (org_id, at);

alter table public.share_access_log enable row level security;

-- Lecture : membres de l'org (le labo voit qui a consulté son dossier). AUCUNE policy
-- d'écriture : seul le service-role (Edge `share`) insère — le journal est infalsifiable
-- par l'API authentifiée.
drop policy if exists share_access_log_select on public.share_access_log;
create policy share_access_log_select on public.share_access_log
  for select using (org_id in (select public.current_user_org_ids()));
