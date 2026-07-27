-- 0081 — Leads du Checking Standard public (pharnos.com/checking-standard).
--
-- Écrite UNIQUEMENT par l'Edge Function publique `checking-report` (service-role) après
-- validation, honeypot et rate-limit (`share_hit`). RLS activée SANS policy — même posture que
-- `demo_requests` (0061) : ce sont des leads avec PII de contact, aucun rôle client ne doit
-- pouvoir les lire ni les forger. Lecture par l'équipe via le dashboard Supabase (service-role).
--
-- Ce que la table contient et ne contient PAS :
--   • `answers` = les déclarations de préparation, item par item ('ok' | 'nc' | 'ko' | 'na').
--     AUCUNE donnée produit : ni nom de spécialité, ni DCI, ni numéro de dossier — la page
--     ne les demande jamais. C'est ce qui rend les statistiques agrégées publiables.
--   • `score`, `verdict` et `gates_*` sont RECALCULÉS côté serveur à partir de `answers` :
--     le navigateur n'est pas une source de vérité, même pour un rapport que l'on renvoie
--     à son propre auteur (sinon les statistiques agrégées deviennent forgeables).
--   • `bareme_version` fige la version du barème appliquée — un lead de 2026 reste explicable
--     après plusieurs révisions du référentiel.

create table if not exists public.checking_leads (
  id uuid primary key default gen_random_uuid(),
  channel text not null check (channel in ('email', 'whatsapp')),
  contact text not null check (char_length(contact) between 3 and 254),
  lang text not null check (lang in ('fr', 'en')),
  country text not null check (char_length(country) between 2 and 8),
  operation text not null check (operation in ('enr', 'ren')),
  product_type text not null check (product_type in ('spec', 'gen', 'vac')),
  score int not null check (score between 0 and 100),
  verdict text not null check (verdict in ('gate_fail', 'ready', 'incomplete', 'not_ready')),
  gates_ok int not null check (gates_ok >= 0),
  gates_total int not null check (gates_total >= 0),
  bareme_version text not null check (char_length(bareme_version) between 1 and 40),
  answers jsonb not null default '{}'::jsonb,
  newsletter boolean not null default false,
  -- Preuve de consentement. La case cochée dans le navigateur n'en est pas une : l'Edge refuse
  -- (400) toute requête sans `consent: true`, et la contrainte garantit qu'aucune ligne ne peut
  -- exister sans consentement, y compris par une écriture service-role future.
  consent boolean not null check (consent),
  consent_at timestamptz not null default now(),
  ip text check (ip is null or char_length(ip) <= 64),
  user_agent text check (user_agent is null or char_length(user_agent) <= 400),
  created_at timestamptz not null default now()
);

-- Lecture équipe = « les plus récents d'abord » ; sert aussi une future purge par date.
create index if not exists checking_leads_created_idx on public.checking_leads (created_at desc);
-- Statistiques d'acquisition par marché et par opération (loop « contenu » du plan).
create index if not exists checking_leads_country_idx on public.checking_leads (country, operation, created_at desc);

alter table public.checking_leads enable row level security;
