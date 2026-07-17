-- 0063 — Accès par privilège : codes d'invitation plateforme + attribution par expert.
--
-- Politique d'acquisition (CEO 2026-07-17) : plus de libre-service — créer une organisation
-- exige un CODE D'INVITATION nominatif (un code réutilisable par expert-ambassadeur, à quota,
-- révocable), et chaque création est ATTRIBUÉE au code utilisé (base de la rémunération des
-- experts « au nombre d'inscrits »).
--
--   • platform_invites   — les codes (gérés par les super-admins via l'Edge `admin`).
--   • invite_redemptions — l'attribution, IMMUABLE côté client : écrite uniquement par le RPC
--     SECURITY DEFINER au moment de la création d'org ; snapshots (e-mail, nom d'org) pour que
--     le rapport survive aux suppressions.
--   • create_org_onboarding(p_name, p_plan, p_invite_code) — nouvelle signature avec le verrou
--     (validation FOR UPDATE : révocation, expiration, quota) ; les platform admins sont
--     exemptés (code facultatif pour eux — ops/tests).
--   • Anciennes portes FERMÉES : create_org_onboarding/2 (stub explicite pour les vieux
--     bundles) et create_org legacy (stub aussi — plus aucun appelant web/Edge).
--
-- RLS deny-all sur les deux tables (posture tables internes, cf. internal_tables_rls.test.sql) :
-- aucun rôle client ne lit les codes (anti-énumération) ni l'attribution (PII).

create table public.platform_invites (
  id uuid primary key default gen_random_uuid(),
  -- Code lisible partageable (« DR-KOUAME ») : MAJUSCULES/chiffres/tirets, 3-32 caractères.
  code text not null unique check (code ~ '^[A-Z0-9][A-Z0-9-]{2,31}$'),
  -- Nom public de l'expert, affiché sur la page /i/CODE (« Dr Kouamé vous invite »).
  label text not null check (char_length(label) between 1 and 120),
  max_uses int not null default 50 check (max_uses between 1 and 10000),
  used_count int not null default 0 check (used_count >= 0),
  revoked_at timestamptz,
  expires_at timestamptz,
  note text check (note is null or char_length(note) <= 400),
  created_by uuid,
  created_at timestamptz not null default now(),
  check (used_count <= max_uses)
);
alter table public.platform_invites enable row level security;

create table public.invite_redemptions (
  id uuid primary key default gen_random_uuid(),
  invite_id uuid not null references public.platform_invites(id),
  user_id uuid not null,
  user_email text,
  -- L'org peut disparaître (purge) : l'attribution reste (set null + snapshot du nom).
  org_id uuid unique references public.orgs(id) on delete set null,
  org_name text not null,
  created_at timestamptz not null default now()
);
-- Rapport « apport par expert » : parcours par code, du plus récent au plus ancien.
create index invite_redemptions_invite_idx
  on public.invite_redemptions (invite_id, created_at desc);
alter table public.invite_redemptions enable row level security;

-- ── Le verrou : create_org_onboarding avec code d'invitation ──────────────────────────────────
-- Retourne un jsonb {ok, org_id | error, message} au lieu de lever une exception sur les refus :
-- un RAISE annulerait TOUTE la transaction, y compris l'incrément du compteur anti force-brute —
-- le throttle ne compterait alors que les succès. Un refus RETOURNÉ committe le compteur.
create or replace function public.create_org_onboarding(
  p_name text,
  p_plan public.plan_tier,
  p_invite_code text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  new_org_id uuid;
  v_email text;
  v_code text;
  v_invite public.platform_invites%rowtype;
  v_is_admin boolean := public.is_platform_admin();
begin
  if coalesce(trim(p_name), '') = '' then
    return jsonb_build_object('ok', false, 'error', 'name_required',
      'message', 'Nom d''organisation requis.');
  end if;

  -- Anti force-brute : les codes sont semi-publics et lisibles (« DR-KOUAME ») — sans throttle,
  -- un compte Google suffirait à les deviner. Compteur par UTILISATEUR et par heure via
  -- share_hit (0017), incrémenté à CHAQUE tentative (échec compris) ; admins exemptés (ops).
  -- Défense en profondeur : la console admin génère les codes avec un suffixe aléatoire.
  if not v_is_admin and public.share_hit('orggate:' || auth.uid()::text, 3600) > 10 then
    return jsonb_build_object('ok', false, 'error', 'throttled',
      'message', 'Trop de tentatives — réessayez dans une heure.');
  end if;

  -- Garde anti-abus (0015/0029) : 3 orgs / 24 h / utilisateur.
  if (
    select count(*)
    from public.memberships m
    join public.orgs o on o.id = m.org_id
    where m.user_id = auth.uid()
      and m.role = 'admin'
      and o.created_at > now() - interval '24 hours'
  ) >= 3 then
    return jsonb_build_object('ok', false, 'error', 'rate_limited',
      'message', 'Limite de création d''organisations atteinte (3 par 24 h) — réessayez plus tard.');
  end if;

  -- Verrou d'invitation. FOR UPDATE : deux inscriptions simultanées sur le même code ne
  -- dépassent jamais le quota (l'incrément est sérialisé sur la ligne du code).
  v_code := upper(trim(coalesce(p_invite_code, '')));
  if v_code = '' then
    if not v_is_admin then
      return jsonb_build_object('ok', false, 'error', 'invite_required',
        'message', 'Un code d''invitation est requis pour créer une organisation.');
    end if;
  else
    select * into v_invite
    from public.platform_invites
    where code = v_code
    for update;
    if not found
       or v_invite.revoked_at is not null
       or (v_invite.expires_at is not null and v_invite.expires_at < now())
       or v_invite.used_count >= v_invite.max_uses then
      -- Message UNIQUE quel que soit le motif : pas d'oracle d'énumération.
      return jsonb_build_object('ok', false, 'error', 'invite_invalid',
        'message', 'Code d''invitation invalide, expiré ou épuisé.');
    end if;
  end if;

  insert into public.orgs (name, plan) values (trim(p_name), p_plan) returning id into new_org_id;
  insert into public.memberships (org_id, user_id, role) values (new_org_id, auth.uid(), 'admin');

  select email into v_email from auth.users where id = auth.uid();

  -- Attribution : consomme une utilisation et trace l'inscription (y compris pour un admin
  -- qui fournit un code — seul l'admin SANS code échappe à l'attribution).
  if v_invite.id is not null then
    update public.platform_invites set used_count = used_count + 1 where id = v_invite.id;
    insert into public.invite_redemptions (invite_id, user_id, user_email, org_id, org_name)
    values (v_invite.id, auth.uid(), coalesce(v_email, ''), new_org_id, trim(p_name));
  end if;

  insert into public.audit_log (id, org_id, actor_id, actor_email, entity, entity_id, action, label)
  values (gen_random_uuid(), new_org_id, auth.uid()::text, coalesce(v_email, ''), 'org',
          new_org_id::text, 'create_org_onboarding',
          'org « ' || trim(p_name) || ' » · plan ' || p_plan::text
            || ' · code ' || coalesce(nullif(v_code, ''), '—'));
  return jsonb_build_object('ok', true, 'org_id', new_org_id);
end;
$$;
revoke all on function public.create_org_onboarding(text, public.plan_tier, text) from public, anon;
grant execute on function public.create_org_onboarding(text, public.plan_tier, text) to authenticated;

-- ── Fermeture des anciennes portes ────────────────────────────────────────────────────────────
-- Vieux bundles (signature 2 args, sans code) : message actionnable plutôt que « function not found ».
create or replace function public.create_org_onboarding(p_name text, p_plan public.plan_tier)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  raise exception 'Un code d''invitation est requis — rechargez l''application pour continuer.'
    using errcode = 'P0403';
end;
$$;
revoke all on function public.create_org_onboarding(text, public.plan_tier) from public, anon;
grant execute on function public.create_org_onboarding(text, public.plan_tier) to authenticated;

-- create_org legacy (0015) : plus aucun appelant web/Edge — porte fermée définitivement.
create or replace function public.create_org(org_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  raise exception 'La création d''organisation se fait sur invitation.' using errcode = 'P0403';
end;
$$;
revoke all on function public.create_org(text) from public, anon;
grant execute on function public.create_org(text) to authenticated;
