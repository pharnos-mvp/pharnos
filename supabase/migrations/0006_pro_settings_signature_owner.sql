-- 0006_pro_settings_signature_owner.sql — Durcissement RLS (M3.1)
-- La signature est un artefact légal : une ligne `user:{uid}` ne doit être lisible/modifiable
-- que par son propriétaire. L'en-tête/pied (`org:{orgId}`) reste partagé par l'organisation.

drop policy if exists pro_settings_all on public.pro_settings;
create policy pro_settings_all on public.pro_settings
  for all using (
    org_id in (select public.current_user_org_ids())
    and (kind <> 'userSignature' or id = 'user:' || auth.uid()::text)
  )
  with check (
    org_id in (select public.current_user_org_ids())
    and (kind <> 'userSignature' or id = 'user:' || auth.uid()::text)
  );
