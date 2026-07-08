-- 0058_monitoring_reminders.sql — Journal d'IDEMPOTENCE des relances FABRICANT (domaine B, Slice 2b).
--
-- La relance fabricant (cron `lifecycle-reminders`, pass monitoring) e-maile le contact du fabricant
-- quand une pièce admin entre dans sa fenêtre de renouvellement (préavis `monitoring_lead_days`, 0055).
-- Sans mémoire, le cron NOCTURNE réenverrait chaque nuit tant que la pièce n'est pas renouvelée =
-- harcèlement. Cette table matérialise « on a déjà relancé pour CETTE pièce à CETTE échéance » :
--   • UNE relance par couple (document_id, expiry_date) — contrainte UNIQUE = garde d'idempotence DURE.
--   • Renouvellement = nouvelle expiry_date → nouveau couple → une relance à la prochaine fenêtre.
-- Sert aussi de trace ALCOA (qui a été relancé, quand, pour quoi).
--
-- Pas de FK sur document_id : une pièce supprimée ne doit pas effacer la preuve d'envoi (le log
-- survit au document). Écriture RÉSERVÉE au service-role (le cron) — aucune policy d'écriture, comme
-- `lifecycle_events` côté relances auto. Lecture par les membres de l'org (affichage in-app ultérieur).

create table if not exists public.monitoring_reminders (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id) on delete cascade,
  -- Pas de FK (le log survit à la suppression du document) — id du `documents` concerné.
  document_id uuid not null,
  -- Échéance pour laquelle on a relancé (une pièce renouvelée = nouvelle date = nouvelle relance).
  expiry_date date not null,
  -- Contexte figé à l'envoi (trace ALCOA + affichage).
  doc_type text not null default '',
  contact_email text not null,
  sent_at timestamptz not null default now(),
  -- Idempotence DURE : au plus une relance par (pièce, échéance), même si le cron rejoue/rate.
  unique (document_id, expiry_date)
);

create index if not exists monitoring_reminders_org_idx
  on public.monitoring_reminders (org_id, sent_at desc);

alter table public.monitoring_reminders enable row level security;

-- Lecture : membres de l'org (affichage « relances envoyées » à venir). ÉCRITURE : aucune policy →
-- réservée au service-role (le cron), comme la journalisation des relances Roadmap.
drop policy if exists monitoring_reminders_select on public.monitoring_reminders;
create policy monitoring_reminders_select on public.monitoring_reminders
  for select using (org_id in (select public.current_user_org_ids()));
