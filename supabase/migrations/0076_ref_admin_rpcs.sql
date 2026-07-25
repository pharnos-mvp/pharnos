-- 0076 — Durcissements revue P4.4 (#417) : RPC god transactionnelles + trigger 0075 blindé.
--
-- 1) `admin_ref_save_draft` (M1) : l'Edge faisait SELECT → UPDATE → DELETE → INSERT en 4
--    aller-retours — un publish concurrent entre deux pas laissait MUTER les entrées d'une
--    version PUBLIÉE (photographie opposable), et un INSERT en échec après le DELETE vidait le
--    brouillon (perte de curation). Une seule transaction, verrou `for update`, brouillon seul.
-- 2) `admin_ref_overview` (M3/M9) : les selects nus de l'Edge tronquaient à `max_rows` (1000)
--    SANS erreur → KPI d'adoption faux en silence ; et la règle d'applicabilité était re-dupliquée
--    avec une variante fausse (published_at seul, sans date d'effet). Ici : agrégats SQL bornés +
--    LA règle (la même que le trigger 0075 et `ref-state.ts`), plus le CONTENU RÉSOLU par
--    (pays, section) pour préremplir l'éditeur depuis l'état courant (M2), pas depuis le socle.
-- 3) `auto_adopt_latest_ref` (M4) : un trigger AFTER INSERT sans bloc exception pouvait faire
--    ÉCHOUER la création d'une organisation pour du bookkeeping — leçon P3 « bookkeeping jamais
--    bloquant ». Toute erreur est avalée (warning) : l'org naît, l'adoption se rattrape à la main.
--
-- Toutes réservées au service_role (pattern 0021) — l'Edge `admin` reste l'unique appelant,
-- derrière son gate `is_platform_admin()`.

-- ── 1) Sauvegarde de brouillon ATOMIQUE ───────────────────────────────────────────────────────
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
       or v_section not in ('agency', 'fees', 'submission', 'samples')
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

-- ── 2) Vue d'ensemble AGRÉGÉE + contenu résolu courant ────────────────────────────────────────
create or replace function public.admin_ref_overview()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
with applicable as (
  select v.*,
         coalesce(v.effective_date::timestamptz, v.published_at, v.created_at) as applicability
  from public.ref_versions v
  where v.status = 'published'
    and (v.effective_date is null or v.effective_date <= current_date)
),
latest as (
  select * from applicable
  order by applicability desc, published_at desc nulls last, created_at desc
  limit 1
),
-- Contenu RÉSOLU courant par (pays, section) : ce que l'éditeur doit PRÉREMPLIR (jamais le
-- socle code — publier v3 préremplie du socle annulerait v2 en silence, revue M2).
current_entries as (
  select distinct on (e.country, e.section)
         e.country, e.section, e.payload, e.provenance, a.label as version_label
  from public.ref_entries e
  join applicable a on a.id = e.version_id
  order by e.country, e.section, a.applicability desc,
           a.published_at desc nulls last, a.created_at desc
)
select jsonb_build_object(
  'versions', coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', v.id, 'label', v.label, 'status', v.status,
      'effective_date', v.effective_date, 'release_note', v.release_note,
      'published_at', v.published_at, 'created_at', v.created_at,
      'is_baseline', v.is_baseline,
      'entry_count', (select count(*) from public.ref_entries e where e.version_id = v.id),
      'countries', coalesce((
        select jsonb_agg(distinct e.country) from public.ref_entries e where e.version_id = v.id
      ), '[]'::jsonb),
      'adoption_count', (
        select count(*) from public.org_ref_adoptions a where a.version_id = v.id
      )
    ) order by v.created_at desc)
    from (select * from public.ref_versions order by created_at desc limit 200) v
  ), '[]'::jsonb),
  'latest_id', (select id from latest),
  'orgs', coalesce((
    select jsonb_agg(jsonb_build_object('id', o.id, 'name', o.name, 'disabled_at', o.disabled_at)
                     order by o.name)
    from (select * from public.orgs order by name limit 500) o
  ), '[]'::jsonb),
  'adoptions', coalesce((
    select jsonb_agg(jsonb_build_object(
      'org_id', a.org_id, 'version_id', a.version_id,
      'adopted_at', a.adopted_at, 'adopted_by_email', a.adopted_by_email
    ) order by a.adopted_at desc)
    from (select * from public.org_ref_adoptions order by adopted_at desc limit 5000) a
  ), '[]'::jsonb),
  'current', coalesce((
    select jsonb_agg(jsonb_build_object(
      'country', c.country, 'section', c.section,
      'payload', c.payload, 'provenance', c.provenance, 'version_label', c.version_label
    ))
    from current_entries c
  ), '[]'::jsonb),
  'active_dossiers', (select count(*) from public.dossiers where deleted_at is null),
  'pinned_behind', (
    select count(*) from public.dossiers d
    where d.deleted_at is null
      and d.ref_version_id is not null
      and d.ref_version_id <> coalesce((select id from latest), d.ref_version_id)
  )
)
$$;
revoke all on function public.admin_ref_overview() from public, anon, authenticated;
grant execute on function public.admin_ref_overview() to service_role;

-- ── 3) Trigger 0075 : bookkeeping JAMAIS bloquant ─────────────────────────────────────────────
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
    return new;
  end if;

  select email into v_email from auth.users where id = auth.uid();
  insert into public.org_ref_adoptions (org_id, version_id, adopted_by, adopted_by_email)
  values (new.id, v_version.id, auth.uid(), coalesce(v_email, ''))
  on conflict (org_id, version_id) do nothing;

  insert into public.audit_log (id, org_id, actor_id, actor_email, entity, entity_id, action, label)
  values (gen_random_uuid(), new.id, coalesce(auth.uid()::text, 'system'), coalesce(v_email, ''),
          'ref_version', v_version.id::text, 'adopt',
          'référentiel ' || v_version.label || ' adopté (état initial de l''organisation)');
  return new;
exception when others then
  -- Bookkeeping JAMAIS bloquant (leçon P3) : une contrainte future, une FK, un contexte sans
  -- auth.users lisible… ne doivent JAMAIS empêcher une organisation de naître. Le sous-bloc
  -- n'annule que ses propres écritures ; l'adoption se rattrape par le RPC.
  raise warning 'auto_adopt_latest_ref ignoré: %', sqlerrm;
  return new;
end;
$$;
