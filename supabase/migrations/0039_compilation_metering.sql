-- 0039_compilation_metering.sql — P1/M1 : recentrer le quota sur la COMPILATION (le livrable).
--
-- ADDITIVE UNIQUEMENT (zéro changement de comportement) : on pose le socle de métrage par COMPILATION
-- (le futur « dépôt » eCTD) sans encore retirer le verrou de création ni brancher le compile.
-- Le retrait du trigger `enforce_dossier_quota` + le branchement client de `record_compilation`
-- se feront en M2 (migration 0040), quand la garde au compile sera LIVE → aucun trou d'enforcement.
--
-- Contenu :
--   1. Table `compilations` (ledger des dépôts) — métrique de valeur + future porte d'entrée eCTD.
--      Privacy-preserving : org_id + horodatage + kind, JAMAIS de contenu → marche même pour une org local-only.
--   2. `record_compilation(dossier_id, kind)` : garde ATOMIQUE (check cap + insert) — fail-closed.
--   3. `plan_limits.max_compilations` + `compilations_period` (+ override) ; seed CEO (free 1/mois … ent ∞).
--   4. Feature `cloud_sync` (3 états, modèle 0038) seedée — administrable en god mode (AdminPlans).
--   5. `orgs.sync_enabled` (choix synchro par org ; l'enforcement des syncs = M3).
--   6. `my_org_plan()` étendu (compilations_used/max_compilations/period + sync_enabled) — diff vs 0037.

-- ── 1. Ledger des compilations (dépôts) ──────────────────────────────────────────────────────
create table if not exists public.compilations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  dossier_id uuid,                       -- réf. souple (pas de FK : un dossier local-only n'est pas sur le serveur)
  kind text not null default 'm1_pdf',   -- 'm1_pdf' aujourd'hui ; 'ectd_v4' demain
  created_at timestamptz not null default now()
);
create index if not exists compilations_org_created_idx on public.compilations (org_id, created_at);

alter table public.compilations enable row level security;
-- Lecture : membres de l'org. Écriture : via RPC SECURITY DEFINER uniquement (aucune policy write = deny-all).
drop policy if exists compilations_select on public.compilations;
create policy compilations_select on public.compilations
  for select using (org_id in (select public.current_user_org_ids()));

-- ── 2. plan_limits / override : cap de compilations ──────────────────────────────────────────
alter table public.plan_limits add column if not exists max_compilations int;
alter table public.plan_limits add column if not exists compilations_period text not null default 'month'
  check (compilations_period in ('lifetime', 'month'));
alter table public.org_quota_override add column if not exists max_compilations int;

-- Seed (valeurs CEO : le livrable = la compilation). free 1/mois · pro 5 · team 15 · business 50 · enterprise ∞.
update public.plan_limits set max_compilations = v.cap, compilations_period = 'month'
from (values ('free', 1), ('pro', 5), ('team', 15), ('business', 50)) as v(plan, cap)
where public.plan_limits.plan = v.plan::public.plan_tier;
-- enterprise : max_compilations laissé NULL = illimité.

-- ── 3. Feature `cloud_sync` (3 états) — défaut 'enabled' (préserve le comportement actuel ; CEO ajuste en god mode) ──
update public.plan_limits
set features = features || '{"cloud_sync":"enabled"}'::jsonb, updated_at = now()
where not (features ? 'cloud_sync');

-- ── 4. Choix de synchro par org (enforcement des syncs = M3) ─────────────────────────────────
alter table public.orgs add column if not exists sync_enabled boolean not null default true;

-- ── 5. record_compilation : garde ATOMIQUE (check cap + insert), fail-closed ──────────────────
create or replace function public.record_compilation(p_dossier_id uuid, p_kind text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_org uuid := public.caller_org_id();
  v_disabled timestamptz;
  v_plan public.plan_tier;
  v_cap int;
  v_period text;
  v_used int;
begin
  if v_org is null then
    return jsonb_build_object('allowed', false, 'reason', 'no_org');
  end if;
  select plan, disabled_at into v_plan, v_disabled from public.orgs where id = v_org;
  if v_disabled is not null then
    return jsonb_build_object('allowed', false, 'reason', 'org_disabled');
  end if;

  select coalesce(o.max_compilations, pl.max_compilations), pl.compilations_period
    into v_cap, v_period
  from public.plan_limits pl
  left join public.org_quota_override o on o.org_id = v_org
  where pl.plan = v_plan;

  -- cap NULL = illimité. Sinon, garde AVANT insertion (fail-closed).
  if v_cap is not null then
    if v_period = 'lifetime' then
      select count(*) into v_used from public.compilations where org_id = v_org;
    else
      select count(*) into v_used from public.compilations
      where org_id = v_org and created_at >= date_trunc('month', now());
    end if;
    if v_used >= v_cap then
      return jsonb_build_object('allowed', false, 'reason', 'quota_exceeded', 'remaining', 0,
                               'cap', v_cap, 'used', v_used);
    end if;
  end if;

  insert into public.compilations (org_id, dossier_id, kind)
  values (v_org, p_dossier_id, coalesce(nullif(p_kind, ''), 'm1_pdf'));

  if v_cap is null then
    return jsonb_build_object('allowed', true, 'remaining', null, 'cap', null);
  end if;
  return jsonb_build_object('allowed', true, 'remaining', greatest(v_cap - (v_used + 1), 0),
                           'cap', v_cap, 'used', v_used + 1);
end;
$$;
revoke all on function public.record_compilation(uuid, text) from public, anon;
grant execute on function public.record_compilation(uuid, text) to authenticated;

-- ── 6. my_org_plan() : expose compilations + sync_enabled (diff vs 0037 : AJOUT de 4 champs) ──
create or replace function public.my_org_plan()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_org uuid := public.caller_org_id();
  v_period text;
  v_cperiod text;
begin
  if v_org is null then
    return null;
  end if;
  select pl.dossiers_period, pl.compilations_period into v_period, v_cperiod
  from public.orgs o join public.plan_limits pl on pl.plan = o.plan where o.id = v_org;
  return (
    select jsonb_build_object(
      'plan', o.plan,
      'billing_period', o.billing_period,
      'disabled', o.disabled_at is not null,
      'sync_enabled', o.sync_enabled,
      'max_dossiers', coalesce(ov.max_dossiers, pl.max_dossiers),
      'dossiers_period', pl.dossiers_period,
      'max_compilations', coalesce(ov.max_compilations, pl.max_compilations),
      'compilations_period', pl.compilations_period,
      'monthly_ai_tokens', coalesce(ov.monthly_ai_tokens, pl.monthly_ai_tokens),
      'max_seats', coalesce(ov.max_seats, pl.max_seats),
      'max_storage_bytes', coalesce(ov.max_storage_bytes, pl.max_storage_bytes),
      'features', coalesce(ov.features, pl.features),
      'tokens_used', (select coalesce(sum(input_tokens + output_tokens), 0) from public.ai_usage
                      where org_id = v_org and period_month = date_trunc('month', now())::date),
      'dossiers_used', (select count(*) from public.dossiers
                        where org_id = v_org and deleted_at is null
                          and (v_period = 'lifetime' or created_at >= date_trunc('month', now()))),
      'compilations_used', (select count(*) from public.compilations
                            where org_id = v_org
                              and (v_cperiod = 'lifetime' or created_at >= date_trunc('month', now()))),
      'storage_used', (select coalesce(sum((so.metadata->>'size')::bigint), 0) from storage.objects so
                       where so.bucket_id = 'documents' and so.name like (v_org::text || '/%'))
    )
    from public.orgs o
    join public.plan_limits pl on pl.plan = o.plan
    left join public.org_quota_override ov on ov.org_id = o.id
    where o.id = v_org
  );
end;
$$;
revoke all on function public.my_org_plan() from public, anon;
grant execute on function public.my_org_plan() to authenticated;
