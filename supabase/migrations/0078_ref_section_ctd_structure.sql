-- 0078 — La section `ctd_structure` devient publiable (P4.5).
--
-- POURQUOI UNE MIGRATION À PART (revue P4.5, M1) : `admin_ref_save_draft` est née en `0076`, DÉJÀ
-- APPLIQUÉE en production. Éditer 0076 en place n'aurait rien changé en prod (une migration jouée
-- ne se rejoue pas) tout en faisant dire le contraire au repo, à la CI et à tout `db reset` local :
-- divergence prod/local INVISIBLE, et historique non reproductible — inacceptable sur un produit
-- vendu sur la traçabilité. Une migration déjà appliquée est un fait passé : on empile, on ne
-- réécrit pas.
--
-- La liste de sections de cette RPC est une DÉFENSE EN PROFONDEUR (l'Edge valide déjà via
-- `_shared/ref-payload.ts`, lui-même verrouillé par des fixtures assertées côté Deno ET côté web).
-- Elle doit rester le miroir de `REF_SECTIONS` : une section qu'aucun client ne rend ne doit pas
-- pouvoir entrer en base, sinon le god croit avoir publié et rien ne bouge.
--
-- `ctd_structure` y entre maintenant que `resolvedModule1Tree` (web) applique réellement ses
-- deltas d'arborescence du Module 1 — le seul module CTD qui varie par pays.

create or replace function public.admin_ref_save_draft(
  p_version uuid,
  p_label text,
  p_effective date,
  p_note text,
  p_entries jsonb
)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_id uuid := p_version;
  v_status text;
  e jsonb;
  v_country text;
  v_section text;
begin
  if p_label !~ '^v\d{4}\.\d{1,3}$' then
    raise exception 'bad_label';
  end if;
  if p_entries is null or jsonb_typeof(p_entries) <> 'array'
     or jsonb_array_length(p_entries) < 1 or jsonb_array_length(p_entries) > 200 then
    raise exception 'bad_entries';
  end if;
  -- Défense en profondeur (l'Edge valide déjà) : pays/section/provenance par entrée.
  for e in select * from jsonb_array_elements(p_entries) loop
    v_country := e->>'country';
    v_section := e->>'section';
    if v_country !~ '^[A-Z]{2}$'
       -- Miroir de `_shared/ref-payload.ts` (`REF_SECTIONS`).
       or v_section not in ('agency', 'fees', 'submission', 'samples', 'ctd_structure')
       or jsonb_typeof(e->'payload') <> 'object'
       or length(trim(coalesce(e->'provenance'->>'texte', ''))) < 3 then
      raise exception 'bad_entry';
    end if;
  end loop;

  if v_id is null then
    insert into public.ref_versions (label, status, release_note, effective_date)
    values (p_label, 'draft', coalesce(p_note, ''), p_effective)
    returning id into v_id;
  else
    -- Verrou : une publication concurrente attend, puis le re-check `status` la respecte.
    select status into v_status from public.ref_versions where id = v_id for update;
    if v_status is null then
      raise exception 'not_found';
    end if;
    if v_status <> 'draft' then
      raise exception 'not_a_draft';
    end if;
    update public.ref_versions
       set label = p_label, release_note = coalesce(p_note, ''), effective_date = p_effective
     where id = v_id;
    delete from public.ref_entries where version_id = v_id;
  end if;

  insert into public.ref_entries (version_id, country, section, payload, provenance)
  select v_id, e->>'country', e->>'section', e->'payload', e->'provenance'
  from jsonb_array_elements(p_entries) e;

  return v_id;
end;
$$;
revoke all on function public.admin_ref_save_draft(uuid, text, date, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.admin_ref_save_draft(uuid, text, date, text, jsonb)
  to service_role;
