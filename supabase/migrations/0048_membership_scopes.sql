-- 0048_membership_scopes.sql — CS1 : collaboration compte-à-compte SCOPÉE au dossier (phase 1, couche SUIVI).
--
-- Décision CEO 2026-07-02 (PLAN-LIFECYCLE §5-bis) : « pas une agence invitée ne verra tout mon
-- catalogue ». L'unité de scope = le DOSSIER (produit × pays × opération) = l'unité du mandat RA.
--
-- Modèle de sécurité — FAIL-SAFE PAR CONSTRUCTION :
--   • Le périmètre s'ajoute en policies RESTRICTIVE (AND) par-dessus les policies permissives
--     existantes : on RESTREINT, on ne perce jamais. Aucune policy existante n'est modifiée.
--   • Membre SANS ligne dans `membership_scopes` = comportement actuel STRICTEMENT intact
--     (toute l'org) — zéro régression pour tous les utilisateurs existants.
--   • Membre AVEC une ligne = restreint à `dossier_ids` sur la couche SUIVI (dossiers en lecture,
--     lifecycle_events, correspondances + messages + décision in-app, PDF compilé/pièces Storage)
--     et EXCLU de la couche ÉDITION (catalogue, documents de travail, CTD builder, générateur,
--     réglages org) et des données de facturation/usage. `dossier_ids = '{}'` = ne voit RIEN
--     (fail-safe : la suppression d'un dossier granté ne ré-ouvre jamais l'org).
--   • Écritures de `membership_scopes` UNIQUEMENT via team_set_scope() (admin, journalisé
--     audit_log — GxP) ; un admin n'est jamais scopable (anti-lockout).
--   • Restrictive `to authenticated` : anon et service_role (Edge `share` tokenisée) intacts.
--
-- Réalité offline (documentée, identique au retrait d'un membre) : réduire/révoquer un périmètre
-- coupe l'accès serveur (sync, Realtime, Storage) mais n'efface pas ce qui était déjà synchronisé
-- sur la machine du membre.

-- ── 1) Table des périmètres ────────────────────────────────────────────────────────────────────
-- 1 ligne par membre scopé (absence de ligne = toute l'org). `dossier_ids` en tableau : le
-- remplacement du périmètre est ATOMIQUE (un upsert), et un dossier supprimé devient un id
-- inerte (jamais un élargissement). FK composite → memberships : le retrait du membre purge
-- son périmètre.
create table if not exists public.membership_scopes (
  org_id uuid not null references public.orgs (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  dossier_ids uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  primary key (org_id, user_id),
  foreign key (org_id, user_id) references public.memberships (org_id, user_id) on delete cascade
);

-- Lookup des helpers RLS par user (la PK ne couvre que le préfixe org_id).
create index if not exists membership_scopes_user_idx on public.membership_scopes (user_id);

alter table public.membership_scopes enable row level security;

-- Lecture : le membre voit SON périmètre (l'UI s'y adapte) ; l'admin de l'org voit ceux de son
-- équipe. Écriture : AUCUNE policy → uniquement team_set_scope() (SECURITY DEFINER, journalisé).
drop policy if exists membership_scopes_select on public.membership_scopes;
create policy membership_scopes_select on public.membership_scopes
  for select using (
    user_id = (select auth.uid()) or public.is_org_admin(org_id)
  );

-- ── 2) Helpers RLS (STABLE, non corrélés → InitPlan : 1 évaluation par requête) ───────────────
-- Orgs où le caller est membre NON scopé (= plein accès, comportement historique).
create or replace function public.current_user_unscoped_org_ids()
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
    and not exists (
      select 1 from public.membership_scopes s
      where s.org_id = m.org_id and s.user_id = m.user_id
    )
$$;

-- Dossiers explicitement grantés au caller (toutes orgs confondues — les ids sont des UUID
-- de dossiers de l'org qui a granté, validés par team_set_scope).
create or replace function public.current_user_scoped_dossier_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select unnest(s.dossier_ids)
  from public.membership_scopes s
  join public.orgs o on o.id = s.org_id
  where s.user_id = auth.uid()
    and o.disabled_at is null
$$;

-- Correspondances rattachées aux dossiers grantés (messages, journal d'accès, chemins Storage).
create or replace function public.current_user_scoped_correspondence_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select c.id
  from public.correspondences c
  where c.dossier_id in (select public.current_user_scoped_dossier_ids())
$$;

revoke all on function public.current_user_unscoped_org_ids() from public, anon;
revoke all on function public.current_user_scoped_dossier_ids() from public, anon;
revoke all on function public.current_user_scoped_correspondence_ids() from public, anon;
grant execute on function public.current_user_unscoped_org_ids() to authenticated;
grant execute on function public.current_user_scoped_dossier_ids() to authenticated;
grant execute on function public.current_user_scoped_correspondence_ids() to authenticated;

-- ── 3) Couche SUIVI — restrictions par dossier (policies RESTRICTIVE, AND) ────────────────────
-- dossiers : lecture des dossiers grantés SEULEMENT ; toute écriture (montage/arbre CTD) reste
-- réservée aux membres non scopés — « l'agent dépose et suit, il n'édite pas le Module 3 ».
drop policy if exists cs1_dossiers_select on public.dossiers;
create policy cs1_dossiers_select on public.dossiers
  as restrictive for select to authenticated
  using (
    org_id in (select public.current_user_unscoped_org_ids())
    or id in (select public.current_user_scoped_dossier_ids())
  );
drop policy if exists cs1_dossiers_insert on public.dossiers;
create policy cs1_dossiers_insert on public.dossiers
  as restrictive for insert to authenticated
  with check (org_id in (select public.current_user_unscoped_org_ids()));
drop policy if exists cs1_dossiers_update on public.dossiers;
create policy cs1_dossiers_update on public.dossiers
  as restrictive for update to authenticated
  using (org_id in (select public.current_user_unscoped_org_ids()))
  with check (org_id in (select public.current_user_unscoped_org_ids()));
drop policy if exists cs1_dossiers_delete on public.dossiers;
create policy cs1_dossiers_delete on public.dossiers
  as restrictive for delete to authenticated
  using (org_id in (select public.current_user_unscoped_org_ids()));

-- lifecycle_events : le membre scopé SUIT et FAIT AVANCER ses dossiers grantés (append-only —
-- la policy de base 0047 exige déjà le rôle gestionnaire de soumission pour INSERT).
drop policy if exists cs1_lifecycle_events_select on public.lifecycle_events;
create policy cs1_lifecycle_events_select on public.lifecycle_events
  as restrictive for select to authenticated
  using (
    org_id in (select public.current_user_unscoped_org_ids())
    or dossier_id in (select public.current_user_scoped_dossier_ids())
  );
drop policy if exists cs1_lifecycle_events_insert on public.lifecycle_events;
create policy cs1_lifecycle_events_insert on public.lifecycle_events
  as restrictive for insert to authenticated
  with check (
    org_id in (select public.current_user_unscoped_org_ids())
    or dossier_id in (select public.current_user_scoped_dossier_ids())
  );

-- correspondances : lecture + décision in-app (UPDATE, cas M4 : l'agent relaie la décision de
-- l'autorité) sur les dossiers grantés. CRÉATION/SUPPRESSION réservées aux non scopés (envoyer
-- une correspondance = compiler le M1 → couche ÉDITION, inaccessible au membre scopé).
drop policy if exists cs1_correspondences_select on public.correspondences;
create policy cs1_correspondences_select on public.correspondences
  as restrictive for select to authenticated
  using (
    org_id in (select public.current_user_unscoped_org_ids())
    or dossier_id in (select public.current_user_scoped_dossier_ids())
  );
drop policy if exists cs1_correspondences_insert on public.correspondences;
create policy cs1_correspondences_insert on public.correspondences
  as restrictive for insert to authenticated
  with check (org_id in (select public.current_user_unscoped_org_ids()));
drop policy if exists cs1_correspondences_update on public.correspondences;
create policy cs1_correspondences_update on public.correspondences
  as restrictive for update to authenticated
  using (
    org_id in (select public.current_user_unscoped_org_ids())
    or dossier_id in (select public.current_user_scoped_dossier_ids())
  )
  with check (
    org_id in (select public.current_user_unscoped_org_ids())
    or dossier_id in (select public.current_user_scoped_dossier_ids())
  );
drop policy if exists cs1_correspondences_delete on public.correspondences;
create policy cs1_correspondences_delete on public.correspondences
  as restrictive for delete to authenticated
  using (org_id in (select public.current_user_unscoped_org_ids()));

-- Fil de discussion : lecture + participation ('sender', policy de base 0028) sur les
-- correspondances des dossiers grantés.
drop policy if exists cs1_correspondence_messages_select on public.correspondence_messages;
create policy cs1_correspondence_messages_select on public.correspondence_messages
  as restrictive for select to authenticated
  using (
    org_id in (select public.current_user_unscoped_org_ids())
    or correspondence_id in (select public.current_user_scoped_correspondence_ids())
  );
drop policy if exists cs1_correspondence_messages_insert on public.correspondence_messages;
create policy cs1_correspondence_messages_insert on public.correspondence_messages
  as restrictive for insert to authenticated
  with check (
    org_id in (select public.current_user_unscoped_org_ids())
    or correspondence_id in (select public.current_user_scoped_correspondence_ids())
  );

-- Journal d'accès des liens partagés : visible pour les correspondances des dossiers grantés.
drop policy if exists cs1_share_access_log_select on public.share_access_log;
create policy cs1_share_access_log_select on public.share_access_log
  as restrictive for select to authenticated
  using (
    org_id in (select public.current_user_unscoped_org_ids())
    or correspondence_id in (select public.current_user_scoped_correspondence_ids())
  );

-- ── 4) Couche ÉDITION + données org — EXCLUES pour le membre scopé ────────────────────────────
-- Catalogue produits, documents de travail, pièces du CTD builder, docs générés, référentiel
-- parties, branding/signatures : « pas une agence invitée ne verra tout mon catalogue ».
drop policy if exists cs1_products_all on public.products;
create policy cs1_products_all on public.products
  as restrictive for all to authenticated
  using (org_id in (select public.current_user_unscoped_org_ids()))
  with check (org_id in (select public.current_user_unscoped_org_ids()));

drop policy if exists cs1_documents_all on public.documents;
create policy cs1_documents_all on public.documents
  as restrictive for all to authenticated
  using (org_id in (select public.current_user_unscoped_org_ids()))
  with check (org_id in (select public.current_user_unscoped_org_ids()));

drop policy if exists cs1_generated_docs_all on public.generated_docs;
create policy cs1_generated_docs_all on public.generated_docs
  as restrictive for all to authenticated
  using (org_id in (select public.current_user_unscoped_org_ids()))
  with check (org_id in (select public.current_user_unscoped_org_ids()));

drop policy if exists cs1_dossier_attachments_all on public.dossier_attachments;
create policy cs1_dossier_attachments_all on public.dossier_attachments
  as restrictive for all to authenticated
  using (org_id in (select public.current_user_unscoped_org_ids()))
  with check (org_id in (select public.current_user_unscoped_org_ids()));

drop policy if exists cs1_parties_all on public.parties;
create policy cs1_parties_all on public.parties
  as restrictive for all to authenticated
  using (org_id in (select public.current_user_unscoped_org_ids()))
  with check (org_id in (select public.current_user_unscoped_org_ids()));

drop policy if exists cs1_pro_settings_all on public.pro_settings;
create policy cs1_pro_settings_all on public.pro_settings
  as restrictive for all to authenticated
  using (org_id in (select public.current_user_unscoped_org_ids()))
  with check (org_id in (select public.current_user_unscoped_org_ids()));

-- Usage/facturation de l'org (consommation IA, compilations, dérogations de quota) : données
-- internes de l'org hôte, pas du mandataire scopé.
drop policy if exists cs1_ai_usage_select on public.ai_usage;
create policy cs1_ai_usage_select on public.ai_usage
  as restrictive for select to authenticated
  using (org_id in (select public.current_user_unscoped_org_ids()));

drop policy if exists cs1_compilations_select on public.compilations;
create policy cs1_compilations_select on public.compilations
  as restrictive for select to authenticated
  using (org_id in (select public.current_user_unscoped_org_ids()));

drop policy if exists cs1_org_quota_override_select on public.org_quota_override;
create policy cs1_org_quota_override_select on public.org_quota_override
  as restrictive for select to authenticated
  using (org_id in (select public.current_user_unscoped_org_ids()));

-- Journal d'audit : la LECTURE org-entière révélerait les métadonnées de tout le catalogue
-- (noms de documents, produits…) → réservée aux non scopés. L'ÉCRITURE (0033 : acteur = soi)
-- reste ouverte : les actions du membre scopé restent journalisées (ALCOA++).
drop policy if exists cs1_audit_log_select on public.audit_log;
create policy cs1_audit_log_select on public.audit_log
  as restrictive for select to authenticated
  using (org_id in (select public.current_user_unscoped_org_ids()));

-- Liste des membres : le membre scopé ne voit que SA propre ligne (divulgation minimale) ;
-- il résout son rôle/périmètre, sans annuaire de l'org hôte.
drop policy if exists cs1_memberships_select on public.memberships;
create policy cs1_memberships_select on public.memberships
  as restrictive for select to authenticated
  using (
    org_id in (select public.current_user_unscoped_org_ids())
    or user_id = (select auth.uid())
  );

-- ── 5) Storage (bucket `documents`) — chemins autorisés par le périmètre ──────────────────────
-- Arborescence réelle (conventions app) :
--   {orgId}/dossiers/{dossierId}/{attachmentId}/…        → pièce du CTD builder (ÉDITION, exclue)
--   {orgId}/dossiers/{dossierId}/events/{eventId}/…      → pièce du journal de cycle de vie (SUIVI)
--   {orgId}/correspondence/{correspondenceId}/…          → PDF compilé + pièces du fil (SUIVI)
--   {orgId}/products/{productId}/…                       → document du catalogue (ÉDITION, exclue)
-- Le membre scopé LIT les pièces suivi de ses dossiers grantés et DÉPOSE ses preuves sous
-- events/ et dans le fil de correspondance. Jamais de DELETE (les pièces référencées par le
-- journal append-only restent intègres).
drop policy if exists cs1_documents_storage_select on storage.objects;
create policy cs1_documents_storage_select on storage.objects
  as restrictive for select to authenticated
  using (
    bucket_id <> 'documents'
    or (storage.foldername(name))[1] in (select (public.current_user_unscoped_org_ids())::text)
    or (
      (storage.foldername(name))[2] = 'dossiers'
      and (storage.foldername(name))[4] = 'events'
      and (storage.foldername(name))[3] in (select (public.current_user_scoped_dossier_ids())::text)
    )
    or (
      (storage.foldername(name))[2] = 'correspondence'
      and (storage.foldername(name))[3] in (select (public.current_user_scoped_correspondence_ids())::text)
    )
  );

drop policy if exists cs1_documents_storage_insert on storage.objects;
create policy cs1_documents_storage_insert on storage.objects
  as restrictive for insert to authenticated
  with check (
    bucket_id <> 'documents'
    or (storage.foldername(name))[1] in (select (public.current_user_unscoped_org_ids())::text)
    or (
      (storage.foldername(name))[2] = 'dossiers'
      and (storage.foldername(name))[4] = 'events'
      and (storage.foldername(name))[3] in (select (public.current_user_scoped_dossier_ids())::text)
    )
    or (
      (storage.foldername(name))[2] = 'correspondence'
      and (storage.foldername(name))[3] in (select (public.current_user_scoped_correspondence_ids())::text)
    )
  );

drop policy if exists cs1_documents_storage_delete on storage.objects;
create policy cs1_documents_storage_delete on storage.objects
  as restrictive for delete to authenticated
  using (
    bucket_id <> 'documents'
    or (storage.foldername(name))[1] in (select (public.current_user_unscoped_org_ids())::text)
  );

-- ── 6) Gestion du périmètre : team_set_scope() — admin only, journalisé (GxP) ─────────────────
-- p_dossier_ids : null = toute l'org (supprime le périmètre) ; '{}' = ne voit rien ; sinon la
-- liste EXACTE (remplacement atomique). Chaque id est vérifié appartenir à l'org (fail-safe :
-- jamais de grant d'un dossier étranger). Un admin n'est pas scopable (anti-lockout).
create or replace function public.team_set_scope(p_org uuid, p_user uuid, p_dossier_ids uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ids uuid[];
  v_target_role text;
  v_email text;
  v_target_email text;
  v_label text;
begin
  if not public.is_org_admin(p_org) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select role::text into v_target_role
  from public.memberships where org_id = p_org and user_id = p_user;
  if v_target_role is null then
    raise exception 'not_a_member' using errcode = 'P0002';
  end if;
  if v_target_role = 'admin' then
    raise exception 'cannot_scope_admin' using errcode = '42501';
  end if;

  if p_dossier_ids is null then
    delete from public.membership_scopes where org_id = p_org and user_id = p_user;
    v_label := 'périmètre : toute l''organisation';
  else
    -- Dédoublonne + borne (l'ensemble est évalué en mémoire par les policies).
    select coalesce(array_agg(distinct d), '{}') into v_ids
    from unnest(p_dossier_ids) as d;
    if coalesce(array_length(v_ids, 1), 0) > 500 then
      raise exception 'scope_too_large' using errcode = '22023';
    end if;
    if exists (
      select 1 from unnest(v_ids) as d
      where not exists (select 1 from public.dossiers where id = d and org_id = p_org)
    ) then
      raise exception 'dossier_not_in_org' using errcode = '22023';
    end if;

    insert into public.membership_scopes (org_id, user_id, dossier_ids, updated_by)
    values (p_org, p_user, v_ids, auth.uid())
    on conflict (org_id, user_id) do update
      set dossier_ids = excluded.dossier_ids,
          updated_at = now(),
          updated_by = excluded.updated_by;
    v_label := 'périmètre : ' || coalesce(array_length(v_ids, 1), 0)::text || ' dossier(s)';
  end if;

  -- Journal GxP : grant/révocation tracés avec acteur + cible (métadonnées, jamais le contenu).
  select email into v_email from auth.users where id = auth.uid();
  select email into v_target_email from auth.users where id = p_user;
  insert into public.audit_log (id, org_id, actor_id, actor_email, entity, entity_id, action, label)
  values (gen_random_uuid(), p_org, auth.uid()::text, coalesce(v_email, ''),
          'membership_scope', p_user::text,
          case when p_dossier_ids is null then 'scope_cleared' else 'scope_set' end,
          coalesce(v_target_email, p_user::text) || ' — ' || v_label);
end;
$$;

revoke all on function public.team_set_scope(uuid, uuid, uuid[]) from public, anon;
grant execute on function public.team_set_scope(uuid, uuid, uuid[]) to authenticated;

-- ── 7) team_set_role : cohérence rôle ↔ périmètre (anti « admin scopé ») ──────────────────────
-- Même signature (create or replace). Promouvoir un membre scopé en admin supprime son périmètre
-- (un admin a par définition tout accès — team_set_scope refuse de scoper un admin) ; la
-- suppression est journalisée (GxP).
create or replace function public.team_set_role(p_org uuid, p_user uuid, p_role org_role)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_actor_email text;
begin
  if not public.is_org_admin(p_org) then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_role <> 'admin' and exists (select 1 from public.memberships where org_id = p_org and user_id = p_user and role = 'admin') and (select count(*) from public.memberships where org_id = p_org and role = 'admin') <= 1 then
    return jsonb_build_object('ok', false, 'reason', 'last_admin');
  end if;
  update public.memberships set role = p_role where org_id = p_org and user_id = p_user;
  select email into v_actor_email from auth.users where id = auth.uid();
  insert into public.audit_log (id, org_id, actor_id, actor_email, entity, entity_id, action, label)
  values (gen_random_uuid(), p_org, auth.uid()::text, coalesce(v_actor_email, ''), 'membership', p_user::text, 'set_role', 'rôle → ' || p_role::text);

  if p_role = 'admin' then
    delete from public.membership_scopes where org_id = p_org and user_id = p_user;
    if found then
      insert into public.audit_log (id, org_id, actor_id, actor_email, entity, entity_id, action, label)
      values (gen_random_uuid(), p_org, auth.uid()::text, coalesce(v_actor_email, ''),
              'membership_scope', p_user::text, 'scope_cleared', 'promotion admin — périmètre supprimé');
    end if;
  end if;
  return jsonb_build_object('ok', true);
end; $$;

-- ── 8) team_list : exposer le périmètre courant à l'UI Équipe (admins) ────────────────────────
-- Même signature (create or replace) ; ajoute `scope_dossier_ids` (null = toute l'org).
-- Divulgation minimale : un CALLER scopé ne voit que SA propre ligne (cohérent avec la policy
-- restrictive sur memberships) et aucune invitation en attente.
create or replace function public.team_list(p_org uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_caller_scoped boolean;
begin
  if not exists (select 1 from public.memberships where org_id = p_org and user_id = auth.uid()) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  v_caller_scoped := exists (
    select 1 from public.membership_scopes s
    where s.org_id = p_org and s.user_id = auth.uid()
  );
  return jsonb_build_object(
    'members', coalesce((
      select jsonb_agg(jsonb_build_object(
        'user_id', u.id,
        'email', u.email,
        'role', m.role,
        'is_you', u.id = auth.uid(),
        'joined_at', m.created_at,
        'scope_dossier_ids', (
          select to_jsonb(s.dossier_ids) from public.membership_scopes s
          where s.org_id = m.org_id and s.user_id = m.user_id
        )
      ) order by (m.role <> 'admin'), u.email)
      from public.memberships m
      join auth.users u on u.id = m.user_id
      where m.org_id = p_org
        and (not v_caller_scoped or m.user_id = auth.uid())
    ), '[]'::jsonb),
    'pending', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', i.id, 'email', i.email, 'role', i.role,
        'expires_at', i.expires_at, 'created_at', i.created_at
      ) order by i.created_at desc)
      from public.invitations i
      where i.org_id = p_org and i.accepted_at is null and i.expires_at > now()
        and not v_caller_scoped
    ), '[]'::jsonb)
  );
end;
$$;
