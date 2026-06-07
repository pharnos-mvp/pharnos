-- 0009_audit_actor_check.sql — Durcissement audit (non-répudiation)
-- L'INSERT doit attribuer l'action à l'utilisateur authentifié lui-même : un membre ne peut
-- pas forger une entrée au nom d'un collègue. (`at` reste fourni par le client pour l'ordre
-- hors-ligne, mais l'acteur est vérifié côté serveur.)

drop policy if exists audit_log_insert on public.audit_log;
create policy audit_log_insert on public.audit_log
  for insert with check (
    org_id in (select public.current_user_org_ids())
    and actor_id = auth.uid()::text
  );
