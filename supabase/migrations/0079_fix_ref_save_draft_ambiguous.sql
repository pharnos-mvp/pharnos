-- 0079 — CORRECTIF DE PRODUCTION : `admin_ref_save_draft` levait « column reference "e" is
-- ambiguous » (42702) sur CHAQUE appel. Toute la voie de publication du référentiel était morte
-- en production depuis 0076 (2026-07-25) : aucun brouillon n'a jamais pu être enregistré.
--
-- CAUSE : la variable de boucle PL/pgSQL `e jsonb` porte le MÊME NOM que l'alias de table du
-- `insert ... select ... from jsonb_array_elements(p_entries) e`. Dans ce SELECT, `e->>'country'`
-- devient ambigu — PL/pgSQL ne sait pas s'il s'agit de sa variable ou de la colonne de l'alias.
-- Postgres ne le détecte qu'à l'EXÉCUTION de l'instruction (le corps n'est compilé qu'au premier
-- appel), donc `create function` réussissait et la CI ne voyait rien.
--
-- POURQUOI PERSONNE NE L'A VU : aucun test n'appelait cette RPC. Les pgTAP du chantier prouvent la
-- RLS et l'isolation (des tables), la revue lisait du SQL, et l'Edge remonte un `query_failed`
-- générique — l'écran god affichait donc « L'enregistrement a échoué » sans plus. Détecté à la
-- recette navigateur du 2026-07-26, en instrumentant la réponse réseau.
--
-- CORRECTIF : nommer explicitement l'alias et sa colonne (`as entries(entry)`), et renommer la
-- variable de boucle en `v_entry`. Plus aucun identifiant partagé entre le PL/pgSQL et le SQL.

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
  v_entry jsonb;
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
  for v_entry in select * from jsonb_array_elements(p_entries) loop
    v_country := v_entry->>'country';
    v_section := v_entry->>'section';
    if v_country !~ '^[A-Z]{2}$'
       -- Miroir de `_shared/ref-payload.ts` (`REF_SECTIONS`).
       or v_section not in ('agency', 'fees', 'submission', 'samples', 'ctd_structure')
       or jsonb_typeof(v_entry->'payload') <> 'object'
       or length(trim(coalesce(v_entry->'provenance'->>'texte', ''))) < 3 then
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

  -- Alias ET colonne NOMMÉS : plus aucun identifiant partagé avec le PL/pgSQL (cause du 42702).
  insert into public.ref_entries (version_id, country, section, payload, provenance)
  select v_id, entry->>'country', entry->>'section', entry->'payload', entry->'provenance'
  from jsonb_array_elements(p_entries) as entries(entry);

  return v_id;
end;
$$;
revoke all on function public.admin_ref_save_draft(uuid, text, date, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.admin_ref_save_draft(uuid, text, date, text, jsonb)
  to service_role;
