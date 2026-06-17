-- 0034_restore_regafy_feature_gate.sql — Jalon N (revue gate-N) : RÉTABLIR le verrou d'OFFRE Regafy.
--
-- RÉGRESSION corrigée : `0032_ai_rate_limit.sql` a fait un `create or replace` de `consume_ai_quota`
-- en ré-émettant TOUT le corps, mais a OMIS le garde de feature Regafy présent dans `0025_pricing_model.sql`
-- (« plan sans IA → reason `feature_disabled` »). En prod, le SEUL rempart serveur de l'entitlement IA
-- n'était plus que le cap de TOKENS : une org sans l'offre Regafy (ex. `free`, `features.regafy = false`)
-- à qui l'on accorde un override de tokens (`admin_set_org_quota` pose `monthly_ai_tokens` SANS toucher
-- `features`) atteignait alors Gemini payant. L'invariant de facturation ne doit pas reposer sur la
-- coïncidence « les plans sans IA ont 0 token ».
--
-- CE QUE FAIT CE FICHIER : ré-insère le garde de feature, **AVANT** le rate-limit de rafale (un plan
-- sans IA est refusé immédiatement, sans même consommer de hit `share_hit`), et fusionne la lecture
-- features+cap en UNE jointure. On CONSERVE tel quel : rate-limit rafale (0032), cap mensuel de tokens
-- (0019), `volatile`, grants. L'Edge (`_shared/quota.ts`) mappe déjà `feature_disabled` → HTTP 403 et le
-- front affiche « Regafy hors offre — Monitor reste disponible » : zéro changement applicatif requis.

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
  v_features jsonb;
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

  -- Offre + cap effectifs (override de l'org sinon plan), en une seule jointure.
  select coalesce(o.features, pl.features),
         coalesce(o.monthly_ai_tokens, pl.monthly_ai_tokens)
    into v_features, v_cap
  from public.plan_limits pl
  left join public.org_quota_override o on o.org_id = v_org
  where pl.plan = v_plan;

  -- Garde d'OFFRE Regafy (copilote IA). Free / plans sans IA → refus `feature_disabled` (Monitor seul) ;
  -- prime sur les tokens (un override de tokens ne débloque JAMAIS une offre sans Regafy). AVANT la rafale.
  if coalesce((v_features ->> 'regafy')::boolean, false) is not true then
    return jsonb_build_object('allowed', false, 'reason', 'feature_disabled');
  end if;

  -- Rate-limit RAFALE par utilisateur (fenêtre fixe 60 s, compteur générique share_hit) — anti-abus.
  v_hits := public.share_hit('ai:' || coalesce(v_uid::text, v_org::text), 60);
  if v_hits > v_rl_per_min then
    return jsonb_build_object('allowed', false, 'reason', 'rate_limited',
                              'retry_after', 60, 'limit', v_rl_per_min);
  end if;

  -- Cap mensuel de tokens (NULL = illimité).
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

-- Grants inchangés (re-affirmés) : jamais anon, exécutable par authenticated (résout l'org/user via auth.uid()).
revoke all on function public.consume_ai_quota(text) from public, anon;
grant execute on function public.consume_ai_quota(text) to authenticated;
