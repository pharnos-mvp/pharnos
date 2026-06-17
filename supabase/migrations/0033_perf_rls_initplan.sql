-- 0033_perf_rls_initplan.sql — Jalon N2-a : perf RLS (advisor auth_rls_initplan) + index FK.
--
-- auth_rls_initplan : 5 policies réévaluaient `auth.uid()` PAR LIGNE. En l'enveloppant dans
-- `(select auth.uid())`, Postgres l'évalue UNE fois par requête (InitPlan) → coût constant à
-- l'échelle. Sémantique STRICTEMENT identique (`auth.uid()` est STABLE) → aucun changement
-- fonctionnel ; l'isolation tenant prouvée par pgTAP reste inchangée. `current_user_org_ids()`
-- était déjà en sous-requête (non concerné).

-- profiles (0001) : chacun ne gère que son propre profil.
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
  for select using (id = (select auth.uid()));

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update using (id = (select auth.uid())) with check (id = (select auth.uid()));

drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own on public.profiles
  for insert with check (id = (select auth.uid()));

-- pro_settings (0006) : la signature `userSignature` n'est lisible/modifiable que par son propriétaire.
drop policy if exists pro_settings_all on public.pro_settings;
create policy pro_settings_all on public.pro_settings
  for all using (
    org_id in (select public.current_user_org_ids())
    and (kind <> 'userSignature' or id = 'user:' || (select auth.uid())::text)
  )
  with check (
    org_id in (select public.current_user_org_ids())
    and (kind <> 'userSignature' or id = 'user:' || (select auth.uid())::text)
  );

-- audit_log (0009) : non-répudiation — l'acteur DOIT être l'utilisateur authentifié lui-même.
drop policy if exists audit_log_insert on public.audit_log;
create policy audit_log_insert on public.audit_log
  for insert with check (
    org_id in (select public.current_user_org_ids())
    and actor_id = (select auth.uid())::text
  );

-- unindexed_foreign_keys : invitations.invited_by (FK → auth.users) sans index couvrant.
create index if not exists invitations_invited_by_idx on public.invitations (invited_by);

-- NB unused_index (advisor INFO, NON traité volontairement) : share_access_log_org_idx,
-- generated_docs_dossier_idx, dossier_attachments_dossier_idx, correspondences_dossier_idx,
-- dossiers_archived_idx sont « jamais utilisés » UNIQUEMENT faute de trafic pré-lancement.
-- Ils couvrent des FK / chemins de requête réels (sync, filtres) → CONSERVÉS (les droper
-- nuirait dès que le volume des pilotes monte).
