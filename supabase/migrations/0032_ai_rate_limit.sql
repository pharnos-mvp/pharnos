-- 0032_ai_rate_limit.sql — Jalon N1-d : rate-limit des RAFALES d'appels IA, par utilisateur.
--
-- Le cap MENSUEL de tokens (0019) borne le COÛT total par org ; il ne protège PAS contre une
-- RAFALE (boucle de script, DoS Vertex, coût rapide). On ajoute un rate-limit par **utilisateur**
-- (fenêtre glissante 60 s) DANS le gate `consume_ai_quota` — réutilise le compteur générique
-- `share_hit(bucket, window)` (0017). Zéro changement Edge : les 3 fonctions IA appellent déjà
-- `consume_ai_quota` et mappent un `reason` inconnu en **HTTP 429** (défaut `STATUS_BY_REASON`).
--
-- Conséquence : la fonction devient VOLATILE (elle écrit désormais un hit de fenêtre via share_hit).
-- Seuil 120/min/user : très au-dessus des rafales légitimes (audit global = pièces par 3 sur ~30-60 s),
-- bloque les boucles abusives (milliers/min). Tunable (`v_rl_per_min`).

create or replace function public.consume_ai_quota(p_kind text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_org uuid := public.caller_org_id();
  v_uid uuid := auth.uid();
  v_plan public.plan_tier;
  v_disabled timestamptz;
  v_cap bigint;
  v_used bigint;
  v_rl_per_min constant int := 120;   -- rafale max d'appels IA par utilisateur et par minute (tunable)
  v_hits int;
begin
  if v_org is null then
    return jsonb_build_object('allowed', false, 'reason', 'no_org');
  end if;

  select plan, disabled_at into v_plan, v_disabled from public.orgs where id = v_org;
  if v_disabled is not null then
    return jsonb_build_object('allowed', false, 'reason', 'org_disabled');
  end if;

  -- Rate-limit RAFALE par utilisateur (fenêtre 60 s) — anti-abus, AVANT le cap mensuel de tokens.
  v_hits := public.share_hit('ai:' || coalesce(v_uid::text, v_org::text), 60);
  if v_hits > v_rl_per_min then
    return jsonb_build_object('allowed', false, 'reason', 'rate_limited',
                              'retry_after', 60, 'limit', v_rl_per_min);
  end if;

  -- Cap mensuel de tokens (override de l'org sinon plafond du plan ; NULL = illimité).
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

-- Grants inchangés (re-affirmés) : jamais anon, exécutable par authenticated (résout l'org/user
-- via auth.uid()). share_hit reste interne (appelé en tant que définisseur).
revoke all on function public.consume_ai_quota(text) from public, anon;
grant execute on function public.consume_ai_quota(text) to authenticated;
