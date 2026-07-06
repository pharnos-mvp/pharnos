-- 0055_reminder_settings.sql — Configuration des RELANCES par organisation (page « Relances »).
--
-- Deux natures de relance, une seule table de config org-scopée :
--   • Domaine A — Roadmap (dossier · MAH ↔ agence) : relance APRÈS inactivité. Rend
--     personnalisables les seuils codés en dur du cron `lifecycle-reminders` (LOT 10 : 14 j agent /
--     30 j agence). Nouveaux défauts (choix CEO, expert RA) : 14 j agent / 60 j agence — le délai
--     normal d'obtention de l'AMM/notification ≈ 6 mois, un rappel tous les 2 mois (plafonné à 3 par
--     le cœur) donne des relances vers J60/J120/J180 sans harceler l'agence.
--   • Domaine B — Monitoring des pièces (MAH ↔ fabricant) : relance AVANT expiration. `monitoring_lead_days`
--     = préavis (jours avant expiration) par type de pièce, qui pilote les alertes « expire bientôt ».
--     Plancher légal : lancer un renouvellement ≥ 90 j avant l'expiration → borne dure côté RPC.
--
-- Modèle : une ligne par org (défauts NOT NULL → une org sans ligne = les défauts). RLS lecture pour
-- tout membre ; ÉCRITURE par RPC security-definer admin-only (pattern 0041/0049 set_org_sync), tracée
-- à l'audit. Le cron lit la table en service_role (bypass RLS). Org explicite (CS1, pattern 0049).

create table if not exists public.reminder_settings (
  org_id uuid primary key references public.orgs (id) on delete cascade,
  -- ── Domaine A : Roadmap (dossiers) ────────────────────────────────────────────────────────────
  roadmap_auto_enabled boolean not null default true,
  roadmap_agent_days int not null default 14 check (roadmap_agent_days between 1 and 365),
  roadmap_agency_days int not null default 60 check (roadmap_agency_days between 1 and 365),
  -- Canal e-mail de la relance auto (l'affichage in-app est toujours actif, gratuit — cf. cloche).
  roadmap_email_enabled boolean not null default true,
  -- ── Domaine B : Monitoring des pièces admin ───────────────────────────────────────────────────
  monitoring_auto_enabled boolean not null default true,
  -- Préavis par type de pièce (jours avant expiration). Défauts alignés sur `renewalLeadDays` (web) :
  -- pièces admin 180 j (6 mois), COA 547 j (18 mois). Validé/borné (≥ 90 j légal) côté RPC.
  monitoring_lead_days jsonb not null default
    '{"gmp":180,"copp":180,"fsc":180,"ml":180,"amm":180,"coa":547}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by text not null default ''
);

alter table public.reminder_settings enable row level security;

-- Lecture : tout membre de l'org (la page « Relances » et le monitoring lisent la config de leur org).
drop policy if exists reminder_settings_select on public.reminder_settings;
create policy reminder_settings_select on public.reminder_settings
  for select using (org_id in (select public.current_user_org_ids()));

-- Écriture : AUCUNE policy → réservée au RPC security-definer admin-only ci-dessous (et service_role).

-- ── Lecture : config effective (row ou défauts) ───────────────────────────────────────────────────
create or replace function public.get_reminder_settings(p_org uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_org uuid := public.caller_org_id(p_org);
  v_row public.reminder_settings;
begin
  if v_org is null then
    return null;
  end if;
  select * into v_row from public.reminder_settings where org_id = v_org;
  return jsonb_build_object(
    'roadmap_auto_enabled', coalesce(v_row.roadmap_auto_enabled, true),
    'roadmap_agent_days', coalesce(v_row.roadmap_agent_days, 14),
    'roadmap_agency_days', coalesce(v_row.roadmap_agency_days, 60),
    'roadmap_email_enabled', coalesce(v_row.roadmap_email_enabled, true),
    'monitoring_auto_enabled', coalesce(v_row.monitoring_auto_enabled, true),
    'monitoring_lead_days', coalesce(
      v_row.monitoring_lead_days,
      '{"gmp":180,"copp":180,"fsc":180,"ml":180,"amm":180,"coa":547}'::jsonb
    )
  );
end;
$$;
revoke all on function public.get_reminder_settings(uuid) from public, anon;
grant execute on function public.get_reminder_settings(uuid) to authenticated, service_role;

-- ── Écriture : admin-only, bornée, tracée à l'audit ───────────────────────────────────────────────
create or replace function public.set_reminder_settings(
  p_roadmap_auto boolean,
  p_agent_days int,
  p_agency_days int,
  p_roadmap_email boolean,
  p_monitoring_auto boolean,
  p_lead_days jsonb,
  p_org uuid default null
)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_org uuid := public.caller_org_id(p_org);
  v_email text;
  v_agent int := least(greatest(coalesce(p_agent_days, 14), 1), 365);
  v_agency int := least(greatest(coalesce(p_agency_days, 60), 1), 365);
  v_lead jsonb := '{}'::jsonb;
  v_key text;
  v_raw text;
  v_val int;
begin
  if v_org is null then
    raise exception 'no_org' using errcode = '42501';
  end if;
  if not public.is_org_admin(v_org) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  -- Reconstruit le préavis à partir des SEULES clés connues (vocabulaire contrôlé, anti-injection de
  -- clés arbitraires), chaque valeur bornée au plancher légal 90 j et à un plafond raisonnable.
  foreach v_key in array array['gmp','copp','fsc','ml','amm','coa'] loop
    -- Extraction TOLÉRANTE : seule une chaîne d'1 à 7 chiffres est castée. Évite l'exception SQL
    -- non gérée (`invalid input syntax for type integer` / overflow int) si un appelant direct de la
    -- RPC envoie une valeur non numérique ou géante — le front borne, mais le serveur reste la barrière.
    v_raw := nullif(p_lead_days ->> v_key, '');
    if v_raw is not null and v_raw ~ '^\d{1,7}$' then
      v_val := least(greatest(v_raw::int, 90), 3650);
    else
      v_val := case when v_key = 'coa' then 547 else 180 end;
    end if;
    v_lead := v_lead || jsonb_build_object(v_key, v_val);
  end loop;

  insert into public.reminder_settings as rs (
    org_id, roadmap_auto_enabled, roadmap_agent_days, roadmap_agency_days,
    roadmap_email_enabled, monitoring_auto_enabled, monitoring_lead_days, updated_at, updated_by
  )
  values (
    v_org, coalesce(p_roadmap_auto, true), v_agent, v_agency,
    coalesce(p_roadmap_email, true), coalesce(p_monitoring_auto, true), v_lead, now(), coalesce(auth.uid()::text, '')
  )
  on conflict (org_id) do update set
    roadmap_auto_enabled = excluded.roadmap_auto_enabled,
    roadmap_agent_days = excluded.roadmap_agent_days,
    roadmap_agency_days = excluded.roadmap_agency_days,
    roadmap_email_enabled = excluded.roadmap_email_enabled,
    monitoring_auto_enabled = excluded.monitoring_auto_enabled,
    monitoring_lead_days = excluded.monitoring_lead_days,
    updated_at = now(),
    updated_by = excluded.updated_by;

  select email into v_email from auth.users where id = auth.uid();
  insert into public.audit_log (id, org_id, actor_id, actor_email, entity, entity_id, action, label)
  values (gen_random_uuid(), v_org, auth.uid()::text, coalesce(v_email, ''), 'org', v_org::text,
          'set_reminders',
          'relances — agent ' || v_agent || ' j / agence ' || v_agency || ' j, auto '
          || case when coalesce(p_roadmap_auto, true) then 'on' else 'off' end);
end;
$$;
revoke all on function public.set_reminder_settings(boolean, int, int, boolean, boolean, jsonb, uuid)
  from public, anon;
grant execute on function public.set_reminder_settings(boolean, int, int, boolean, boolean, jsonb, uuid)
  to authenticated, service_role;
