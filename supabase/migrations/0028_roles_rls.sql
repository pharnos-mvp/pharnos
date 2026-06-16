-- 0028_roles_rls.sql — Recette CEO #2 : permissions des 6 rôles.
--   Édition du contenu (products/documents/dossiers/generated_docs) : TOUS sauf Lecteur
--     → admin, ra_officer (Éditeur), agence_locale, agence_representation, expert_ra.
--   Gestion des soumissions (correspondance : envoi + messages + décisions) : Admin + les 3 rôles
--     agence/expert UNIQUEMENT (ni Éditeur, ni Lecteur).
--   Comparaisons en ::text → indépendantes du commit de l'enum (0027). La LECTURE reste ouverte à
--   tout membre de l'org.

-- ── Édition du contenu : +3 rôles (réécrit la fonction de 0023) ───────────────────────────────
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
    and m.role::text in ('admin', 'ra_officer', 'agence_locale', 'agence_representation', 'expert_ra')
$$;

-- ── Gestion des soumissions : Admin + agence/expert ──────────────────────────────────────────
create or replace function public.current_user_submission_org_ids()
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
    and m.role::text in ('admin', 'agence_locale', 'agence_representation', 'expert_ra')
$$;

-- ── Correspondances : lecture par tout membre, écriture par les gestionnaires de soumission ───
-- (remplace le policy `for all` de 0017 par select + insert/update/delete séparés.)
drop policy if exists correspondences_all on public.correspondences;
drop policy if exists correspondences_select on public.correspondences;
create policy correspondences_select on public.correspondences
  for select using (org_id in (select public.current_user_org_ids()));
drop policy if exists correspondences_insert on public.correspondences;
create policy correspondences_insert on public.correspondences
  for insert with check (org_id in (select public.current_user_submission_org_ids()));
drop policy if exists correspondences_update on public.correspondences;
create policy correspondences_update on public.correspondences
  for update using (org_id in (select public.current_user_submission_org_ids()))
  with check (org_id in (select public.current_user_submission_org_ids()));
drop policy if exists correspondences_delete on public.correspondences;
create policy correspondences_delete on public.correspondences
  for delete using (org_id in (select public.current_user_submission_org_ids()));

-- Messages du fil : lecture inchangée (tout membre) ; insertion réservée aux gestionnaires.
drop policy if exists correspondence_messages_insert on public.correspondence_messages;
create policy correspondence_messages_insert on public.correspondence_messages
  for insert with check (
    org_id in (select public.current_user_submission_org_ids()) and author = 'sender'
  );
