-- 0075 — Auto-adoption du référentiel à la CRÉATION d'une organisation (P4.4).
--
-- Sans elle, une org neuve démarrait sur le SOCLE (0074) et voyait immédiatement une bannière
-- « mise à jour à adopter » pour du contenu antérieur à son existence — du bruit, pas un
-- consentement : une org qui naît n'a AUCUN état antérieur à protéger, son état initial EST la
-- dernière version publiée applicable. Les orgs EXISTANTES, elles, ne bougent jamais sans
-- adoption explicite (invariant P4.2 intact).
--
-- Mécanisme : trigger AFTER INSERT sur `orgs` — couvre create_org, create_org_onboarding (0063)
-- et tout futur chemin de création, sans dupliquer le corps de ces RPC (anti-dérive).

create or replace function public.auto_adopt_latest_ref()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_version public.ref_versions%rowtype;
  v_email text;
begin
  select * into v_version
  from public.ref_versions v
  where v.status = 'published'
    and (v.effective_date is null or v.effective_date <= current_date)
  order by coalesce(v.effective_date::timestamptz, v.published_at, v.created_at) desc,
           v.published_at desc nulls last, v.created_at desc
  limit 1;
  if v_version.id is null then
    return new; -- aucun référentiel publié (env de test vierge) → l'org suivra le socle code
  end if;

  -- auth.uid() peut être null (création par service role/console) — adopted_by est nullable.
  select email into v_email from auth.users where id = auth.uid();
  insert into public.org_ref_adoptions (org_id, version_id, adopted_by, adopted_by_email)
  values (new.id, v_version.id, auth.uid(), coalesce(v_email, ''))
  on conflict (org_id, version_id) do nothing;

  insert into public.audit_log (id, org_id, actor_id, actor_email, entity, entity_id, action, label)
  values (gen_random_uuid(), new.id, coalesce(auth.uid()::text, 'system'), coalesce(v_email, ''),
          'ref_version', v_version.id::text, 'adopt',
          'référentiel ' || v_version.label || ' adopté (état initial de l''organisation)');
  return new;
end;
$$;
-- Fonction de TRIGGER : invoquée par le moteur, jamais par un rôle (pattern 0019/0031).
revoke all on function public.auto_adopt_latest_ref() from public, anon, authenticated;

drop trigger if exists orgs_auto_adopt_ref on public.orgs;
create trigger orgs_auto_adopt_ref
  after insert on public.orgs
  for each row execute function public.auto_adopt_latest_ref();
