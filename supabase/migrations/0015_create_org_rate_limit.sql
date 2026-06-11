-- 0015_create_org_rate_limit.sql — Anti-abus : borne la création d'organisations (T4, PLAN-V2).
--
-- create_org est SECURITY DEFINER et appelable par tout utilisateur authentifié : sans garde,
-- un compte peut créer des organisations en boucle (pollution + déni par volume). On borne à
-- 3 créations par 24 h et par utilisateur — très au-dessus de l'usage réel (1 org par labo).
--
-- Heuristique « créée par » : l'utilisateur est rattaché admin au moment de la création et le
-- MVP n'a pas d'invitations → memberships admin sur des orgs récentes = orgs créées par lui.
-- 100 % additif : même signature, aucun changement de schéma (rollback = replay de la 0002).

create or replace function public.create_org(org_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_org_id uuid;
begin
  if coalesce(trim(org_name), '') = '' then
    raise exception 'Nom d''organisation requis';
  end if;

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

  insert into public.orgs (name) values (trim(org_name)) returning id into new_org_id;
  insert into public.memberships (org_id, user_id, role) values (new_org_id, auth.uid(), 'admin');
  return new_org_id;
end;
$$;

-- Ré-affirmés pour l'idempotence du fichier (create or replace conserve déjà les ACL).
revoke all on function public.create_org(text) from public, anon;
grant execute on function public.create_org(text) to authenticated;
