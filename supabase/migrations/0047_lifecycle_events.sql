-- 0047_lifecycle_events.sql — « La spine » : journal append-only du cycle de vie du dossier
-- (jalons aval Dépôt → Soumission → Notifications → AMM + sous-workflows échantillons/paiement/relances).
--
-- ADR-0004. Modèle (offline-first, ALCOA++) :
--   • SOURCE DE VÉRITÉ = ce journal append-only. L'étape courante + les sous-états sont DÉRIVÉS côté
--     client par `deriveLifecycle(events, correspondence, config)` — AUCUN statut mutable stocké
--     (cohérent ADR-0003 : l'état du dossier n'est jamais écrit par le serveur → zéro conflit avec la
--     sync offline-first ; un upsert client ne peut pas écraser une décision et réciproquement).
--   • ON SUPERPOSE, on ne remplace pas : la correspondance (0017) reste la source des étapes 1–3
--     (Montage/Revue/Décision) ; ce journal porte les étapes 4–7 (Dépôt/Soumission/Notifications/AMM).
--   • Append-only IMMUABLE (pattern audit_log 0008 + correspondence_messages 0017) : SELECT pour tout
--     membre de l'org, INSERT pour les gestionnaires de soumission (`current_user_submission_org_ids`,
--     cf. 0028), AUCUNE policy UPDATE/DELETE → historique infalsifiable. Une correction = un nouvel
--     événement (décision révisable : suspendu → frais reçus → soumis = nouveaux événements).
--   • Pas de FK sur `dossier_id` (pattern 0003/0005/0017) : évite les blocages d'ordre de synchro
--     offline-first (le dossier peut se synchroniser après son 1er événement).
--   • IDs générés CÔTÉ CLIENT (offline, déterministes) ; sync pull incrémentale paginée par
--     `created_at` ; Realtime = simple accélérateur UX (la sync pull reste la source de vérité).

create table if not exists public.lifecycle_events (
  id uuid primary key,
  org_id uuid not null references public.orgs (id) on delete cascade,
  -- Pas de FK (ordre de synchro) ; le dossier appartient à la même org (isolation RLS par org_id).
  dossier_id uuid not null,
  -- Vocabulaire CONTRÔLÉ des jalons aval (étapes 4–7) + sous-workflows — CODÉS EN DUR (ADR-0004,
  -- anti-dérive cf. risque #3 du plan). Étendre le cycle = une nouvelle migration, jamais de la config.
  type text not null check (type in (
    -- ── Jalons du parcours (étapes 4–7) ─────────────────────────────────────────────────────────
    'deposited',              -- Dépôt du dossier à l'agence nationale (étape 4)
    'submitted',              -- Soumission à l'autorité (étape 5) — payload { mode, receipt? }
    'authority_query',        -- Notification / complément demandé par l'agence (étape 6)
    'authority_response',     -- Réponse au complément transmise à l'agence (étape 6)
    'amm_granted',            -- AMM accordée (étape 7) — payload { amm_number, valid_until }
    'amm_refused',            -- AMM refusée (étape 7) — payload { reason? }
    -- ── Sous-workflow Échantillons (M3) ─────────────────────────────────────────────────────────
    'samples_requested',          -- Demande d'échantillons
    'samples_import_authorized',  -- Autorisation d'importation obtenue (doc_refs = autorisation)
    'samples_shipped',            -- Échantillons expédiés (doc_refs = AWB)
    'samples_delivered',          -- Échantillons remis à l'agence
    -- ── Sous-workflow Paiement (M4) — ZÉRO FINTECH : preuve + confirmation ───────────────────────
    'fees_invoiced',          -- Facture / barème émis
    'payment_submitted',      -- Preuve de paiement déposée (doc_refs = SWIFT)
    'payment_confirmed',      -- Paiement confirmé (2 niveaux)
    -- ── Relances automatiques (M6) ──────────────────────────────────────────────────────────────
    'reminder_sent'           -- Relance auto émise (actor_id = 'system') — payload { stage, threshold_days }
  )),
  -- Acteur (pattern audit_log 0008) : texte, PAS de FK — l'acteur peut être 'system' (relances M6)
  -- ou un agent local EXTERNE agissant via lien tokenisé (M5), sans compte Pharnos.
  actor_id text not null,
  actor_email text not null default '',
  -- Quand l'événement réglementaire a RÉELLEMENT eu lieu (saisissable, ≠ created_at d'enregistrement) :
  -- le journal/la timeline trient là-dessus.
  occurred_at timestamptz not null default now(),
  -- Détails typés par `type` (mode de soumission, n° AMM, échéance, seuil de relance…). jsonb borné
  -- côté app (pas de schéma SQL rigide : le cycle évolue, le vocabulaire `type` reste la garde).
  payload jsonb not null default '{}'::jsonb,
  -- Pièces justificatives [{ path, name, size, mime }] dans le bucket privé `documents` (récépissé,
  -- AWB, autorisation d'import, preuve SWIFT…). Chemins Storage contrôlés par l'app.
  doc_refs jsonb not null default '[]'::jsonb,
  -- Horodatage d'ENREGISTREMENT (≠ occurred_at) : watermark de la sync pull incrémentale.
  created_at timestamptz not null default now()
);

-- Sync pull paginée par (org, created_at) — couvre aussi la FK org_id (advisor unindexed_foreign_keys).
create index if not exists lifecycle_events_org_created_idx
  on public.lifecycle_events (org_id, created_at);
-- Timeline d'un dossier : tri chronologique réel par occurred_at.
create index if not exists lifecycle_events_dossier_idx
  on public.lifecycle_events (dossier_id, occurred_at);

alter table public.lifecycle_events enable row level security;

-- Lecture : tout membre de l'org (chaque partie suit le parcours du dossier en temps réel).
drop policy if exists lifecycle_events_select on public.lifecycle_events;
create policy lifecycle_events_select on public.lifecycle_events
  for select using (org_id in (select public.current_user_org_ids()));

-- Écriture : gestionnaires de soumission uniquement (Admin + agence_locale/representation/expert_ra),
-- comme la correspondance (0028) — faire avancer un jalon = un acte de gestion de soumission.
drop policy if exists lifecycle_events_insert on public.lifecycle_events;
create policy lifecycle_events_insert on public.lifecycle_events
  for insert with check (org_id in (select public.current_user_submission_org_ids()));

-- Append-only : AUCUNE policy UPDATE/DELETE → événements immuables (ALCOA++, infalsifiables par l'API).

-- Temps réel (accélérateur UX — la sync pull reste la source de vérité) : INSERTs poussés aux clients
-- de l'org via Realtime (RLS respectée par les canaux postgres_changes), comme correspondence_messages.
do $$
begin
  alter publication supabase_realtime add table public.lifecycle_events;
exception
  when duplicate_object then null; -- déjà publiée (replay)
  when undefined_object then null; -- publication absente (stack locale minimale)
end $$;
