-- 0023_team_invitations.sql — Jalon M4 : invitations d'équipe + rôles effectifs.
--
--   1) invitations (token hashé SHA-256, expiry, rôle) — service-role/Edge écrit, accept par RPC.
--   2) Rôles EFFECTIFS : current_user_editable_org_ids() = orgs où l'utilisateur est admin OU
--      ra_officer (Éditeur). Les écritures sur products/documents/dossiers/generated_docs passent
--      en editable-only → le 'reviewer' (Lecteur) devient RÉELLEMENT lecture seule. La lecture
--      reste ouverte à tous les membres. (Tous les users actuels sont admin → zéro régression.)
--   3) RPC self-gated : accept_invitation, team_list, team_set_role, team_remove_member,
--      team_revoke_invitation, create_invitation. Gestion des membres réservée à l'admin d'org.

-- ── 1) Table des invitations ────────────────────────────────────────────────────────────────
create table if not exists public.invitations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id) on delete cascade,
  email citext not null,
  role public.org_role not null default 'ra_officer',
  token_hash text not null unique,
  invited_by uuid references auth.users (id) on delete set null,
  invited_by_email text,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists invitations_org_idx on public.invitations (org_id);
alter table public.invitations enable row level security;
-- Aucune policy client : lecture/écriture via RPC SECURITY DEFINER / service-role uniquement
-- (le token hashé ne doit jamais transiter par une lecture client).

-- ── 2) Rôles effectifs (écriture = admin + éditeur) ─────────────────────────────────────────
create or replace function public.current_user_editable_org_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select m.org_id
  from public.memberships m
  join public.orgs o on o.id = m.org_id
  where m.user_id = auth.uid()
    and o.disabled_at is null
    and m.role in ('admin', 'ra_officer')
$$;
-- Utilisée DANS les policies RLS → doit rester exécutable par authenticated (comme current_user_org_ids).

-- products : lecture inchangée (tous membres), écritures restreintes aux éditeurs.
drop policy if exists products_insert on public.products;
create policy products_insert on public.products
  for insert with check (org_id in (select public.current_user_editable_org_ids()));
drop policy if exists products_update on public.products;
create policy products_update on public.products
  for update using (org_id in (select public.current_user_editable_org_ids()))
  with check (org_id in (select public.current_user_editable_org_ids()));
drop policy if exists products_delete on public.products;
create policy products_delete on public.products
  for delete using (org_id in (select public.current_user_editable_org_ids()));

-- documents / dossiers / generated_docs : remplace le policy `_all` par select (tous) + écritures (éditeurs).
do $$
declare tbl text;
begin
  foreach tbl in array array['documents', 'dossiers', 'generated_docs'] loop
    execute format('drop policy if exists %I_all on public.%I', tbl, tbl);
    execute format('drop policy if exists %I_select on public.%I', tbl, tbl);
    execute format('create policy %I_select on public.%I for select using (org_id in (select public.current_user_org_ids()))', tbl, tbl);
    execute format('drop policy if exists %I_insert on public.%I', tbl, tbl);
    execute format('create policy %I_insert on public.%I for insert with check (org_id in (select public.current_user_editable_org_ids()))', tbl, tbl);
    execute format('drop policy if exists %I_update on public.%I', tbl, tbl);
    execute format('create policy %I_update on public.%I for update using (org_id in (select public.current_user_editable_org_ids())) with check (org_id in (select public.current_user_editable_org_ids()))', tbl, tbl);
    execute format('drop policy if exists %I_delete on public.%I', tbl, tbl);
    execute format('create policy %I_delete on public.%I for delete using (org_id in (select public.current_user_editable_org_ids()))', tbl, tbl);
  end loop;
end
$$;

-- ── Helpers d'audit + rôle ──────────────────────────────────────────────────────────────────
create or replace function public.is_org_admin(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.memberships
    where org_id = p_org and user_id = auth.uid() and role = 'admin'
  )
$$;

-- ── 3) RPC équipe (self-gated) ──────────────────────────────────────────────────────────────
create or replace function public.create_invitation(
  p_org uuid, p_email citext, p_role public.org_role, p_token_hash text, p_expires_at timestamptz)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_email text;
begin
  if not public.is_org_admin(p_org) then
    raise exception 'forbidden' using errcode = '42501';
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

create or replace function public.accept_invitation(p_token text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_hash text := encode(extensions.digest(p_token, 'sha256'), 'hex');
  v_inv public.invitations;
  v_email text;
begin
  select email into v_email from auth.users where id = auth.uid();
  if v_email is null then
    return jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  end if;
  select * into v_inv from public.invitations where token_hash = v_hash;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  if v_inv.accepted_at is not null then
    return jsonb_build_object('ok', false, 'reason', 'already_used');
  end if;
  if v_inv.expires_at < now() then
    return jsonb_build_object('ok', false, 'reason', 'expired');
  end if;
  if lower(v_email) <> lower(v_inv.email::text) then
    return jsonb_build_object('ok', false, 'reason', 'email_mismatch', 'invited_email', v_inv.email);
  end if;

  insert into public.memberships (org_id, user_id, role)
  values (v_inv.org_id, auth.uid(), v_inv.role)
  on conflict (org_id, user_id) do update set role = excluded.role;
  update public.invitations set accepted_at = now() where id = v_inv.id;

  insert into public.audit_log (id, org_id, actor_id, actor_email, entity, entity_id, action, label)
  values (gen_random_uuid(), v_inv.org_id, auth.uid()::text, v_email, 'membership', auth.uid()::text,
          'join', v_email || ' a rejoint (' || v_inv.role::text || ')');

  return jsonb_build_object('ok', true, 'org_id', v_inv.org_id, 'role', v_inv.role);
end;
$$;

create or replace function public.team_list(p_org uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.memberships where org_id = p_org and user_id = auth.uid()) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'members', coalesce((
      select jsonb_agg(jsonb_build_object('user_id', u.id, 'email', u.email, 'role', m.role,
                                          'is_you', u.id = auth.uid(), 'joined_at', m.created_at)
                        order by (m.role <> 'admin'), u.email)
      from public.memberships m join auth.users u on u.id = m.user_id where m.org_id = p_org
    ), '[]'::jsonb),
    'pending', coalesce((
      select jsonb_agg(jsonb_build_object('id', i.id, 'email', i.email, 'role', i.role,
                                          'expires_at', i.expires_at, 'created_at', i.created_at)
                        order by i.created_at desc)
      from public.invitations i
      where i.org_id = p_org and i.accepted_at is null and i.expires_at > now()
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.team_set_role(p_org uuid, p_user uuid, p_role public.org_role)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_actor_email text;
begin
  if not public.is_org_admin(p_org) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  -- Ne jamais retirer le dernier admin (perte de contrôle de l'org).
  if p_role <> 'admin'
     and exists (select 1 from public.memberships where org_id = p_org and user_id = p_user and role = 'admin')
     and (select count(*) from public.memberships where org_id = p_org and role = 'admin') <= 1 then
    return jsonb_build_object('ok', false, 'reason', 'last_admin');
  end if;
  update public.memberships set role = p_role where org_id = p_org and user_id = p_user;
  select email into v_actor_email from auth.users where id = auth.uid();
  insert into public.audit_log (id, org_id, actor_id, actor_email, entity, entity_id, action, label)
  values (gen_random_uuid(), p_org, auth.uid()::text, coalesce(v_actor_email, ''), 'membership', p_user::text,
          'set_role', 'rôle → ' || p_role::text);
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.team_remove_member(p_org uuid, p_user uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_actor_email text;
begin
  if not public.is_org_admin(p_org) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if exists (select 1 from public.memberships where org_id = p_org and user_id = p_user and role = 'admin')
     and (select count(*) from public.memberships where org_id = p_org and role = 'admin') <= 1 then
    return jsonb_build_object('ok', false, 'reason', 'last_admin');
  end if;
  delete from public.memberships where org_id = p_org and user_id = p_user;
  select email into v_actor_email from auth.users where id = auth.uid();
  insert into public.audit_log (id, org_id, actor_id, actor_email, entity, entity_id, action, label)
  values (gen_random_uuid(), p_org, auth.uid()::text, coalesce(v_actor_email, ''), 'membership', p_user::text,
          'remove', 'membre retiré');
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.team_revoke_invitation(p_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_org uuid;
begin
  select org_id into v_org from public.invitations where id = p_id;
  if v_org is null then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  if not public.is_org_admin(v_org) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  delete from public.invitations where id = p_id and accepted_at is null;
  return jsonb_build_object('ok', true);
end;
$$;

-- Grants : appelables par authenticated (self-gated dans le corps). create_invitation appelée par
-- l'Edge `team` avec le JWT appelant. Les helpers de policy gardent l'exécution par défaut.
revoke all on function public.is_org_admin(uuid) from public, anon;
grant execute on function public.is_org_admin(uuid) to authenticated;
revoke all on function public.create_invitation(uuid, citext, public.org_role, text, timestamptz) from public, anon;
grant execute on function public.create_invitation(uuid, citext, public.org_role, text, timestamptz) to authenticated;
revoke all on function public.accept_invitation(text) from public, anon;
grant execute on function public.accept_invitation(text) to authenticated;
revoke all on function public.team_list(uuid) from public, anon;
grant execute on function public.team_list(uuid) to authenticated;
revoke all on function public.team_set_role(uuid, uuid, public.org_role) from public, anon;
grant execute on function public.team_set_role(uuid, uuid, public.org_role) to authenticated;
revoke all on function public.team_remove_member(uuid, uuid) from public, anon;
grant execute on function public.team_remove_member(uuid, uuid) to authenticated;
revoke all on function public.team_revoke_invitation(uuid) from public, anon;
grant execute on function public.team_revoke_invitation(uuid) to authenticated;
