-- 0029_onboarding_plan.sql — Recette CEO #2 (point 2) : onboarding « plan choisi à l'inscription »
-- + mise à niveau self-serve.
--
--   create_org_onboarding(p_name, p_plan) : crée l'org + membership admin ET fixe orgs.plan = plan
--     choisi (OCTROI IMMÉDIAT, mode pilote sans paiement). Réutilise la garde anti-abus de create_org
--     (3 orgs / 24 h / utilisateur). Audit-loggé.
--   choose_plan(p_plan) : l'admin de SON org change de plan (mode pilote) — câblé au CTA « Mettre à
--     niveau » du compte (S1). Audit-loggé.
--
-- Les infos pro (entreprise / poste / pays) NE PASSENT PAS par ici : elles vivent dans pro_settings,
-- offline-first (Dexie + outbox). Le wizard les écrit côté client via setOrgProfile + syncProSettings
-- juste après la création → le cache Dexie (lu par « Informations professionnelles ») est peuplé
-- immédiatement, ce qui corrige le bug « entreprise vide ».

-- ── Création d'org avec plan (onboarding) ─────────────────────────────────────────────────────
create or replace function public.create_org_onboarding(p_name text, p_plan public.plan_tier)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_org_id uuid;
  v_email text;
begin
  if coalesce(trim(p_name), '') = '' then
    raise exception 'Nom d''organisation requis';
  end if;

  -- Garde anti-abus identique à create_org (0015) : borne la création en boucle.
  if (
    select count(*)
    from public.memberships m
    join public.orgs o on o.id = m.org_id
    where m.user_id = auth.uid()
      and m.role = 'admin'
      and o.created_at > now() - interval '24 hours'
  ) >= 3 then
    raise exception 'Limite de création d''organisations atteinte (3 par 24 h) — réessayez plus tard.';
  end if;

  insert into public.orgs (name, plan) values (trim(p_name), p_plan) returning id into new_org_id;
  insert into public.memberships (org_id, user_id, role) values (new_org_id, auth.uid(), 'admin');

  select email into v_email from auth.users where id = auth.uid();
  insert into public.audit_log (id, org_id, actor_id, actor_email, entity, entity_id, action, label)
  values (gen_random_uuid(), new_org_id, auth.uid()::text, coalesce(v_email, ''), 'org',
          new_org_id::text, 'create_org_onboarding',
          'org « ' || trim(p_name) || ' » · plan ' || p_plan::text);
  return new_org_id;
end;
$$;
revoke all on function public.create_org_onboarding(text, public.plan_tier) from public, anon;
grant execute on function public.create_org_onboarding(text, public.plan_tier) to authenticated;

-- ── Mise à niveau self-serve (mode pilote, sans encaissement) ─────────────────────────────────
create or replace function public.choose_plan(p_plan public.plan_tier)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_org uuid := public.caller_org_id();
  v_email text;
begin
  if v_org is null then
    raise exception 'Aucune organisation' using errcode = 'P0002';
  end if;
  if not public.is_org_admin(v_org) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  update public.orgs set plan = p_plan where id = v_org;

  select email into v_email from auth.users where id = auth.uid();
  insert into public.audit_log (id, org_id, actor_id, actor_email, entity, entity_id, action, label)
  values (gen_random_uuid(), v_org, auth.uid()::text, coalesce(v_email, ''), 'plan', p_plan::text,
          'choose_plan', 'plan → ' || p_plan::text);
end;
$$;
revoke all on function public.choose_plan(public.plan_tier) from public, anon;
grant execute on function public.choose_plan(public.plan_tier) to authenticated;
