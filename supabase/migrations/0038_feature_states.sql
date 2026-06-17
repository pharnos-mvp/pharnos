-- 0038_feature_states.sql — Modèle de gestion des features à 3 états (god mode).
--
-- Passe `plan_limits.features` (et `org_quota_override.features`) du BOOLÉEN à un ÉTAT à 3 niveaux :
--   'hidden'  (Masquée)  — invisible côté front ;
--   'teaser'  (Vitrine)  — visible, clic → upsell « Incluse dès le plan X » (= tunnel de conversion) ;
--   'enabled' (Activée)  — opérationnelle.
-- Reseed : `true → 'enabled'`, `false → 'teaser'` (les anciennes features OFF deviennent des VITRINES :
-- on les montre pour convertir, au lieu de les cacher). Transform IDEMPOTENT : seules les valeurs
-- BOOLÉENNES sont converties, les chaînes déjà-états sont laissées telles quelles.
--
-- Gardes serveur converties pour lire l'ÉTAT, avec RÉTRO-COMPAT booléenne (`'enabled' OR 'true'`) le temps
-- que tout le parc bascule (un override non-converti portant encore `true` reste honoré) :
--   - `consume_ai_quota`  : `features->>'regafy'` doit valoir `enabled` — sinon `feature_disabled`.
--   - `create_invitation` : `features->>'team'`  doit valoir `enabled` — sinon `team_disabled`.
--
-- INVARIANT DE FACTURATION INCHANGÉ (leçon B1) : garde de feature AVANT la rafale AVANT le cap de tokens.
-- Chaque `create or replace` est diffé contre son VRAI prédécesseur : `0034` pour `consume_ai_quota`
-- (PAS `0025`), `0025` pour `create_invitation`. Aucun autre garde de feature n'existe (grep vérifié).
-- L'Edge (`_shared/quota.ts`) mappe déjà `feature_disabled → 403` : zéro changement Edge.

-- ── 1. Conversion des données (booléen → état), idempotente ──────────────────────────────────
update public.plan_limits pl
set features = (
      select jsonb_object_agg(e.key,
               case
                 when e.value = 'true'::jsonb  then '"enabled"'::jsonb
                 when e.value = 'false'::jsonb then '"teaser"'::jsonb
                 else e.value
               end)
      from jsonb_each(pl.features) e
    ),
    updated_at = now()
where pl.features is not null
  and exists (select 1 from jsonb_each(pl.features) b where jsonb_typeof(b.value) = 'boolean');

update public.org_quota_override o
set features = (
      select jsonb_object_agg(e.key,
               case
                 when e.value = 'true'::jsonb  then '"enabled"'::jsonb
                 when e.value = 'false'::jsonb then '"teaser"'::jsonb
                 else e.value
               end)
      from jsonb_each(o.features) e
    )
where o.features is not null
  and exists (select 1 from jsonb_each(o.features) b where jsonb_typeof(b.value) = 'boolean');

-- ── 2. consume_ai_quota : garde d'OFFRE Regafy lue à l'ÉTAT (diff vs 0034 : SEULE la ligne du garde) ──
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

  -- Garde d'OFFRE Regafy (copilote IA) : état 'enabled' requis (Vitrine/Masquée → refus `feature_disabled`,
  -- Monitor reste dispo). Rétro-compat booléenne 'true'. Prime sur les tokens (un override de tokens ne
  -- débloque JAMAIS une offre sans Regafy). AVANT la rafale.
  if coalesce(v_features ->> 'regafy', '') not in ('enabled', 'true') then
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

revoke all on function public.consume_ai_quota(text) from public, anon;
grant execute on function public.consume_ai_quota(text) to authenticated;

-- ── 3. create_invitation : garde d'OFFRE Équipe lue à l'ÉTAT (diff vs 0025 : SEULE la ligne du garde) ──
create or replace function public.create_invitation(
  p_org uuid, p_email citext, p_role public.org_role, p_token_hash text, p_expires_at timestamptz)
returns uuid language plpgsql volatile security definer set search_path = public as $$
declare
  v_id uuid;
  v_email text;
  v_features jsonb;
  v_seats int;
  v_used int;
begin
  if not public.is_org_admin(p_org) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select coalesce(o.features, pl.features), coalesce(o.max_seats, pl.max_seats)
    into v_features, v_seats
  from public.orgs org
  join public.plan_limits pl on pl.plan = org.plan
  left join public.org_quota_override o on o.org_id = org.id
  where org.id = p_org;

  -- Garde d'OFFRE Équipe : état 'enabled' requis (rétro-compat booléenne 'true'). Vitrine/Masquée → refus.
  if coalesce(v_features ->> 'team', '') not in ('enabled', 'true') then
    raise exception 'team_disabled' using errcode = '42501';
  end if;

  -- Plafond de sièges = membres + invitations en attente (NULL = illimité).
  if v_seats is not null then
    select (select count(*) from public.memberships where org_id = p_org)
         + (select count(*) from public.invitations where org_id = p_org and accepted_at is null and expires_at > now())
      into v_used;
    if v_used >= v_seats then
      raise exception 'seats_full' using errcode = 'check_violation';
    end if;
  end if;

  select email into v_email from auth.users where id = auth.uid();
  insert into public.invitations (org_id, email, role, token_hash, invited_by, invited_by_email, expires_at)
  values (p_org, p_email, p_role, p_token_hash, auth.uid(), v_email, p_expires_at)
  returning id into v_id;
  insert into public.audit_log (id, org_id, actor_id, actor_email, entity, entity_id, action, label)
  values (gen_random_uuid(), p_org, auth.uid()::text, coalesce(v_email, ''), 'invitation', v_id::text,
          'invite', 'invitation ' || p_email::text || ' (' || p_role::text || ')');
  return v_id;
end;
$$;

-- ── 4. admin_set_plan_limits : garde-fou de saisie god mode (diff vs 0037 : AJOUT du seul garde en tête) ──
-- Sans validation, un état de feature inconnu (typo dans un appel à l'Edge admin) serait stocké tel quel ;
-- `featureState` le lirait alors comme « Masquée » → désactivation SILENCIEUSE de la feature pour TOUT le
-- plan. On refuse les valeurs hors {hidden,teaser,enabled} (+ rétro-compat booléenne true/false). Signature,
-- corps, audit et grants INCHANGÉS par ailleurs (l'UI n'émet que des états valides → zéro régression).
create or replace function public.admin_set_plan_limits(
  p_plan public.plan_tier, p_max_dossiers int, p_dossiers_period text, p_monthly_ai_tokens bigint,
  p_max_seats int, p_max_storage_bytes bigint, p_features jsonb, p_actor_org uuid,
  p_actor_id text, p_actor_email text)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  -- Garde-fou : refuser tout état de feature inconnu (fail-safe — ne jamais désactiver en silence).
  if p_features is not null and exists (
    select 1 from jsonb_each_text(p_features) e
    where e.value not in ('hidden', 'teaser', 'enabled', 'true', 'false')
  ) then
    raise exception 'bad_feature_state' using errcode = '22023';
  end if;

  update public.plan_limits
    set max_dossiers = p_max_dossiers,
        dossiers_period = coalesce(nullif(p_dossiers_period, ''), dossiers_period),
        monthly_ai_tokens = p_monthly_ai_tokens,
        max_seats = p_max_seats,
        max_storage_bytes = p_max_storage_bytes,
        features = coalesce(p_features, features),
        updated_at = now()
  where plan = p_plan;
  insert into public.audit_log (id, org_id, actor_id, actor_email, entity, entity_id, action, label)
  values (gen_random_uuid(), p_actor_org, p_actor_id, p_actor_email, 'plan', p_plan::text,
          'admin_set_plan_limits',
          p_plan::text || ' dossiers=' || coalesce(p_max_dossiers::text, '∞') || '/' || coalesce(nullif(p_dossiers_period, ''), '?') ||
          ' tokens=' || coalesce(p_monthly_ai_tokens::text, '∞') || ' sièges=' || coalesce(p_max_seats::text, '∞') ||
          ' stockage=' || coalesce(p_max_storage_bytes::text, '∞'));
end;
$$;
revoke all on function public.admin_set_plan_limits(public.plan_tier, int, text, bigint, int, bigint, jsonb, uuid, text, text) from public, anon, authenticated;
grant execute on function public.admin_set_plan_limits(public.plan_tier, int, text, bigint, int, bigint, jsonb, uuid, text, text) to service_role;
