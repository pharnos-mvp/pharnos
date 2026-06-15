-- 0019_platform_admin_quotas.sql — Jalon M1 : socle plateforme & verrou quotas.
--
-- Apporte (100 % additif, réversible par drop) :
--   1) platform_admins + is_platform_admin()  — superadmin Pharnos (cross-org via Edge service-role).
--   2) plan_tier (free/pro/business/enterprise) sur orgs + disabled_at (coupe-circuit, câblé en M2).
--   3) plan_limits (caps ÉDITABLES par plan) + org_quota_override (dérogation par org).
--   4) ai_usage (compteur mensuel de tokens IA, par org/kind) + RLS.
--   5) consume_ai_quota() (gate check-before, fail-closed) + record_ai_usage() (atomique, after).
--   6) Trigger plafond de dossiers (enforce quel que soit le chemin client).
--
-- Verrou du SEUL coût variable (tokens Gemini) AVANT d'ouvrir au-delà des pilotes connus.
-- NB anti-régression : les orgs existantes basculent en 'free' ; 'free' est seedé avec TOUTES les
-- features actives → aucune perte de fonctionnalité. Ce qui borne réellement = les quotas chiffrés.

-- ── 1) Superadmin plateforme ────────────────────────────────────────────────────────────────
create table if not exists public.platform_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.platform_admins enable row level security;
-- Aucune policy : invisible aux utilisateurs normaux. Lu uniquement via is_platform_admin()
-- (SECURITY DEFINER) ou par l'Edge `admin` en service-role (bypass RLS).

-- NB : le ou les compte(s) super-admin Pharnos sont accordés séparément (migration 0020, après
-- confirmation explicite du CEO) — god-mode cross-tenant ⇒ jamais de seed « deviné » par e-mail.

create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.platform_admins where user_id = auth.uid())
$$;
revoke all on function public.is_platform_admin() from public, anon;
grant execute on function public.is_platform_admin() to authenticated;

-- ── 2) Plans & coupe-circuit sur les orgs ───────────────────────────────────────────────────
do $$
begin
  if not exists (select 1 from pg_type where typname = 'plan_tier') then
    create type public.plan_tier as enum ('free', 'pro', 'business', 'enterprise');
  end if;
end
$$;

alter table public.orgs add column if not exists plan public.plan_tier not null default 'free';
alter table public.orgs add column if not exists disabled_at timestamptz;

-- ── 3) Quotas par plan (éditables) + dérogation par org ─────────────────────────────────────
-- max_dossiers / monthly_ai_tokens : NULL = illimité. features : capacités activables (jsonb).
create table if not exists public.plan_limits (
  plan public.plan_tier primary key,
  max_dossiers int,
  monthly_ai_tokens bigint,
  features jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- Seed initial (do nothing → les éditions admin ultérieures persistent). 'free' = toutes features ON
-- (aucune régression pour les pilotes actuels) ; la différenciation MVP se fait sur les quotas chiffrés.
insert into public.plan_limits (plan, max_dossiers, monthly_ai_tokens, features) values
  ('free',        5,   1000000,  '{"translation":true,"correspondence":true,"audit_global":true,"upgrade_templates":true}'),
  ('pro',         50,  10000000, '{"translation":true,"correspondence":true,"audit_global":true,"upgrade_templates":true}'),
  ('business',    200, 50000000, '{"translation":true,"correspondence":true,"audit_global":true,"upgrade_templates":true}'),
  ('enterprise',  null, null,    '{"translation":true,"correspondence":true,"audit_global":true,"upgrade_templates":true}')
on conflict (plan) do nothing;

create table if not exists public.org_quota_override (
  org_id uuid primary key references public.orgs (id) on delete cascade,
  max_dossiers int,
  monthly_ai_tokens bigint,
  features jsonb,
  updated_at timestamptz not null default now()
);

alter table public.plan_limits enable row level security;
alter table public.org_quota_override enable row level security;

-- plan_limits : config globale → lecture par tout authentifié (afficher son plafond). Écriture = admin/service-role.
drop policy if exists plan_limits_select_authenticated on public.plan_limits;
create policy plan_limits_select_authenticated on public.plan_limits
  for select to authenticated using (true);

-- org_quota_override : un membre voit la dérogation de son org. Écriture = admin/service-role uniquement.
drop policy if exists org_quota_override_select_member on public.org_quota_override;
create policy org_quota_override_select_member on public.org_quota_override
  for select using (org_id in (select public.current_user_org_ids()));

-- ── 4) Compteur d'usage IA (tokens) par org / mois / nature ─────────────────────────────────
create table if not exists public.ai_usage (
  org_id uuid not null references public.orgs (id) on delete cascade,
  period_month date not null,
  kind text not null,                       -- 'regafy' | 'translate' | 'upgrade'
  calls int not null default 0,
  input_tokens bigint not null default 0,
  output_tokens bigint not null default 0,
  updated_at timestamptz not null default now(),
  primary key (org_id, period_month, kind)
);
create index if not exists ai_usage_org_period_idx on public.ai_usage (org_id, period_month);

alter table public.ai_usage enable row level security;
-- Un membre lit l'usage de son org (vue « consommation »). Écriture = RPC SECURITY DEFINER / service-role.
drop policy if exists ai_usage_select_member on public.ai_usage;
create policy ai_usage_select_member on public.ai_usage
  for select using (org_id in (select public.current_user_org_ids()));

-- ── Helpers de résolution (org du caller, cap mensuel de tokens) ─────────────────────────────
-- Org du caller : MVP = 1 org/user (cf. 0015). Robuste si plusieurs : la plus ancienne.
create or replace function public.caller_org_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select org_id from public.memberships
  where user_id = auth.uid()
  order by created_at asc
  limit 1
$$;

-- ── 5) Gate de quota (check-before) + enregistrement (after) ─────────────────────────────────
-- consume_ai_quota : à appeler AVANT l'appel Vertex. Ne consomme rien (tokens inconnus avant l'appel) ;
-- refuse si l'org est désactivée OU si le cumul de tokens du mois a déjà atteint le plafond.
-- Dépassement borné à un appel près (acceptable : budget mensuel souple) — fail-closed sinon.
create or replace function public.consume_ai_quota(p_kind text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_org uuid := public.caller_org_id();
  v_plan public.plan_tier;
  v_disabled timestamptz;
  v_cap bigint;
  v_used bigint;
begin
  if v_org is null then
    return jsonb_build_object('allowed', false, 'reason', 'no_org');
  end if;

  select plan, disabled_at into v_plan, v_disabled from public.orgs where id = v_org;
  if v_disabled is not null then
    return jsonb_build_object('allowed', false, 'reason', 'org_disabled');
  end if;

  -- Cap = override de l'org si défini, sinon le plafond du plan. NULL = illimité.
  select coalesce(o.monthly_ai_tokens, pl.monthly_ai_tokens)
    into v_cap
  from public.plan_limits pl
  left join public.org_quota_override o on o.org_id = v_org
  where pl.plan = v_plan;

  if v_cap is null then
    return jsonb_build_object('allowed', true, 'remaining', null, 'cap', null);
  end if;

  select coalesce(sum(input_tokens + output_tokens), 0)
    into v_used
  from public.ai_usage
  where org_id = v_org and period_month = date_trunc('month', now())::date;

  if v_used >= v_cap then
    return jsonb_build_object('allowed', false, 'reason', 'quota_exceeded',
                              'remaining', 0, 'cap', v_cap, 'used', v_used);
  end if;

  return jsonb_build_object('allowed', true, 'remaining', v_cap - v_used, 'cap', v_cap, 'used', v_used);
end;
$$;
revoke all on function public.consume_ai_quota(text) from public, anon;
grant execute on function public.consume_ai_quota(text) to authenticated;

-- record_ai_usage : à appeler APRÈS l'appel Vertex, avec les tokens réels (usageMetadata). Atomique.
create or replace function public.record_ai_usage(p_kind text, p_in bigint, p_out bigint)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_org uuid := public.caller_org_id();
begin
  if v_org is null then
    return;
  end if;
  insert into public.ai_usage (org_id, period_month, kind, calls, input_tokens, output_tokens, updated_at)
  values (v_org, date_trunc('month', now())::date, coalesce(nullif(p_kind, ''), 'unknown'),
          1, greatest(coalesce(p_in, 0), 0), greatest(coalesce(p_out, 0), 0), now())
  on conflict (org_id, period_month, kind) do update
    set calls = public.ai_usage.calls + 1,
        input_tokens = public.ai_usage.input_tokens + greatest(coalesce(p_in, 0), 0),
        output_tokens = public.ai_usage.output_tokens + greatest(coalesce(p_out, 0), 0),
        updated_at = now();
end;
$$;
revoke all on function public.record_ai_usage(text, bigint, bigint) from public, anon;
grant execute on function public.record_ai_usage(text, bigint, bigint) to authenticated;

-- ── 6) Plafond de dossiers (trigger BEFORE INSERT — tous chemins client) ─────────────────────
create or replace function public.enforce_dossier_quota()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cap int;
  v_count int;
begin
  select coalesce(o.max_dossiers, pl.max_dossiers)
    into v_cap
  from public.orgs org
  join public.plan_limits pl on pl.plan = org.plan
  left join public.org_quota_override o on o.org_id = org.id
  where org.id = new.org_id;

  if v_cap is null then
    return new; -- illimité
  end if;

  select count(*) into v_count
  from public.dossiers
  where org_id = new.org_id and deleted_at is null;

  if v_count >= v_cap then
    raise exception 'quota_dossiers: plafond de % dossiers atteint pour cette organisation', v_cap
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_dossier_quota_trg on public.dossiers;
create trigger enforce_dossier_quota_trg
  before insert on public.dossiers
  for each row execute function public.enforce_dossier_quota();

-- Verrou (advisor 0028/0029) : ces deux fonctions ne doivent JAMAIS être appelables en RPC.
-- caller_org_id() est purement interne ; enforce_dossier_quota() est une fonction de trigger.
-- Les appels internes des fonctions SECURITY DEFINER (qui s'exécutent en tant que owner) restent OK.
revoke all on function public.caller_org_id() from public, anon, authenticated;
revoke all on function public.enforce_dossier_quota() from public, anon, authenticated;
