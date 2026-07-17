-- 0061 — Leads « Demander une démo » de la landing pharnos.com.
--
-- Écrite UNIQUEMENT par l'Edge Function publique `demo-request` (service-role) après
-- validation, honeypot et rate-limit (`share_hit`). RLS activée SANS policy — même posture
-- que les tables internes (voir internal_tables_rls.test.sql) : ces leads sont de la PII,
-- aucun rôle client ne doit pouvoir les lire ni les forger. Lecture par l'équipe via le
-- dashboard Supabase (service-role).

create table if not exists public.demo_requests (
  id uuid primary key default gen_random_uuid(),
  full_name text not null check (char_length(full_name) between 1 and 160),
  email text not null check (char_length(email) between 3 and 254),
  company text not null check (char_length(company) between 1 and 160),
  job_title text not null check (char_length(job_title) between 1 and 120),
  country text not null check (char_length(country) between 1 and 80),
  ip text check (ip is null or char_length(ip) <= 64),
  user_agent text check (user_agent is null or char_length(user_agent) <= 400),
  created_at timestamptz not null default now()
);

-- Lecture équipe = « les plus récents d'abord » ; l'index sert aussi une future purge par date.
create index if not exists demo_requests_created_idx on public.demo_requests (created_at desc);

alter table public.demo_requests enable row level security;
