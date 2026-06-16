-- 0031_revoke_trigger_fn_execute.sql — Durcissement N1-b : retirer les fonctions de TRIGGER de la
-- surface RPC REST. (Advisors Supabase 0028/0029.)
--
-- handle_new_user() (trigger AFTER INSERT sur auth.users, cf. 0001) et rls_auto_enable() (créée
-- hors-migration, présente en prod) sont des fonctions de TRIGGER. Créées avec l'EXECUTE par
-- défaut à PUBLIC, elles étaient appelables en RPC par anon/authenticated (/rest/v1/rpc/...).
--
-- REVOKE SÛR : une fonction de trigger est invoquée par le moteur (en tant que propriétaire/
-- définisseur), elle n'est PAS soumise au privilège EXECUTE du rôle appelant. Retirer EXECUTE à
-- public/anon/authenticated ne change donc rien au déclenchement des triggers (inscription =
-- création de profil OK ; le propriétaire conserve ses droits). Aligne ces fonctions sur le
-- pattern déjà appliqué à caller_org_id() / enforce_dossier_quota() (0019).
--
-- NON touché VOLONTAIREMENT (ces WARN advisors sont par conception — voir N1-c/pgTAP pour la
-- preuve de la vraie barrière = RLS) :
--   • current_user_org_ids / current_user_editable_org_ids / is_org_admin : appelées DANS les
--     policies RLS de TOUTES les tables tenant (+ Storage) → DOIVENT rester exécutables par
--     authenticated (cf. 0023:44). Ne renvoient que les org du caller (aucune fuite ; vide pour anon).
--   • is_platform_admin / consume_ai_quota / record_ai_usage : déjà revoke public+anon / grant
--     authenticated (résolvent l'org via auth.uid() / gate l'Edge admin). record_ai_usage borne
--     les tokens via greatest(...,0) → aucun contournement de quota possible.
--   • create_org / create_org_onboarding / choose_plan / my_org_plan / accept_invitation /
--     create_invitation / team_* : RPC applicatives légitimes (garde d'autorisation interne).

-- handle_new_user : présente dans le dépôt (0001) → revoke direct.
revoke all on function public.handle_new_user() from public, anon, authenticated;

-- rls_auto_enable : présente en prod mais ABSENTE des migrations du dépôt (drift schéma créé
-- hors-migration). On garde un check d'existence → la migration s'applique proprement partout
-- (DB fraîche CI : ignorée ; prod : révoquée). À tracer/normaliser ultérieurement.
do $$
begin
  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'rls_auto_enable'
  ) then
    execute 'revoke all on function public.rls_auto_enable() from public, anon, authenticated';
  end if;
end
$$;
