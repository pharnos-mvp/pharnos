-- 0074 — Durcissements de la revue P4.2 (#415) : socle EXPLICITE, épinglage borné, backfill.
--
-- Trois défauts fermés ici, tous dormants aujourd'hui (une seule version publiée) mais armés dès
-- que le God dashboard (P4.4) permettra de publier/archiver :
--
-- 1) SOCLE EXPLICITE (bloquant B1). Le plafond de résolution client était « la version la plus
--    ANCIENNE présente dans la réplique » — une inférence : archiver le socle (ou son absence de
--    la réplique) faisait glisser le plafond sur une version JAMAIS adoptée, donc du contenu
--    réglementaire appliqué sans consentement, sans aucun signal (`pending` vide). Le socle
--    devient une PROPRIÉTÉ de la donnée (`is_baseline`), unique, et le client ne retient plus
--    jamais qu'une version adoptée ou le socle déclaré.
--
-- 2) ÉPINGLAGE BORNÉ (majeur M1). `dossiers.ref_version_id` est une colonne cliente ordinaire :
--    un éditeur non-admin pouvait y écrire (PostgREST) l'id d'une version que son org n'a PAS
--    adoptée et se servir son barème — contournement du gate « admin seul ». Le client borne
--    désormais au plafond ; ce trigger est la ceinture serveur (null / socle / adoptée).
--
-- 3) BACKFILL (majeur M2). Les dossiers existants avaient `ref_version_id = null` → ils suivaient
--    l'org, alors que le dialog de consentement promet « vos dossiers existants restent épinglés,
--    aucun n'est modifié ». On les épingle donc à la version que leur org applique. `updated_at`
--    bumpé SINON le pull incrémental client (`.gt('updated_at', …)`) ne verrait jamais le
--    changement (leçon 0060).
--
-- Plus : RPC d'adoption durci (org non désactivée + membre non scopé, `p_org` obligatoire) et
-- retrait d'un index redondant.

-- ── 1) Socle explicite ────────────────────────────────────────────────────────────────────────
alter table public.ref_versions
  add column if not exists is_baseline boolean not null default false;

-- Un seul socle possible (partiel : n'indexe que la ligne vraie).
create unique index if not exists ref_versions_baseline_uidx
  on public.ref_versions (is_baseline) where is_baseline;

-- Le seed 0071 EST le socle (contenu identique au code, cf. `ref-seed.test.ts`).
update public.ref_versions
   set is_baseline = true
 where id = '7a1e4d20-0000-4000-8000-000000000071'
   and not exists (select 1 from public.ref_versions where is_baseline);

-- ── 2) Épinglage : FK restrictive + garde d'appartenance ──────────────────────────────────────
-- `on delete set null` dé-épinglait SILENCIEUSEMENT un dossier déposé (ses montants changeaient
-- sans trace) : pour une pièce opposable, une version référencée s'ARCHIVE, elle ne se supprime
-- pas. `restrict` transforme la faute en erreur explicite côté god.
alter table public.dossiers drop constraint if exists dossiers_ref_version_id_fkey;
alter table public.dossiers
  add constraint dossiers_ref_version_id_fkey
  foreign key (ref_version_id) references public.ref_versions (id) on delete restrict;

create or replace function public.enforce_dossier_ref_version()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.ref_version_id is null then
    return new;
  end if;
  -- Autorisé : le socle (état de départ de toute org) ou une version ADOPTÉE par l'org du dossier.
  if exists (
    select 1 from public.ref_versions v
     where v.id = new.ref_version_id and v.is_baseline
  ) or exists (
    select 1 from public.org_ref_adoptions a
     where a.org_id = new.org_id and a.version_id = new.ref_version_id
  ) then
    return new;
  end if;
  raise exception 'ref_version_not_adopted' using errcode = '42501';
end;
$$;
revoke all on function public.enforce_dossier_ref_version() from public, anon, authenticated;

drop trigger if exists dossiers_ref_version_guard on public.dossiers;
create trigger dossiers_ref_version_guard
  before insert or update of ref_version_id on public.dossiers
  for each row execute function public.enforce_dossier_ref_version();

-- ── 3) Backfill des dossiers existants ────────────────────────────────────────────────────────
update public.dossiers d
   set ref_version_id = coalesce(
         (select a.version_id
            from public.org_ref_adoptions a
            join public.ref_versions v on v.id = a.version_id and v.status = 'published'
           where a.org_id = d.org_id
           order by coalesce(v.effective_date::timestamptz, v.published_at, v.created_at) desc,
                    v.published_at desc nulls last, v.created_at desc
           limit 1),
         (select v.id from public.ref_versions v where v.is_baseline limit 1)
       ),
       updated_at = greatest(d.updated_at, now())
 where d.ref_version_id is null
   and exists (select 1 from public.ref_versions where is_baseline);

-- ── 4) RPC d'adoption durci ───────────────────────────────────────────────────────────────────
-- `p_org` devient OBLIGATOIRE (RPC neuf, aucun appelant legacy) : le repli « org la plus ancienne
-- du user » de `caller_org_id()` est le footgun de facturation documenté par 0049 — un multi-org
-- (cas nominal CS1) n'a rien à faire avec une résolution implicite pour un acte de consentement.
-- Et l'autorisation passe par `current_user_unscoped_org_ids()` : couvre d'un coup l'org
-- DÉSACTIVÉE (0048 joint `orgs.disabled_at is null`) et le membre SCOPÉ (qui ne peut pas lire la
-- config qu'il aurait adoptée — RESTRICTIVE CS1).
drop function if exists public.adopt_ref_version(uuid, uuid);
create function public.adopt_ref_version(p_version uuid, p_org uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_email text;
  v_label text;
begin
  if p_org is null then
    raise exception 'no_org' using errcode = '42501';
  end if;
  if not exists (select 1 from public.current_user_unscoped_org_ids() o where o = p_org) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if not public.is_org_admin(p_org) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select label into v_label
  from public.ref_versions
  where id = p_version and status = 'published';
  if v_label is null then
    raise exception 'version_not_published' using errcode = '42501';
  end if;

  select email into v_email from auth.users where id = auth.uid();

  insert into public.org_ref_adoptions (org_id, version_id, adopted_by, adopted_by_email)
  values (p_org, p_version, auth.uid(), coalesce(v_email, ''))
  on conflict (org_id, version_id) do nothing;

  -- Rejeu (double clic, deux onglets, retry réseau) : la table est protégée par l'unique, mais
  -- l'audit ne doit PAS accumuler des traces d'un consentement déjà donné → on sort ici.
  if not found then
    return;
  end if;

  insert into public.audit_log (id, org_id, actor_id, actor_email, entity, entity_id, action, label)
  values (gen_random_uuid(), p_org, auth.uid()::text, coalesce(v_email, ''), 'ref_version',
          p_version::text, 'adopt', 'référentiel ' || v_label || ' adopté');
end;
$$;
revoke all on function public.adopt_ref_version(uuid, uuid) from public, anon;
grant execute on function public.adopt_ref_version(uuid, uuid) to authenticated;

-- ── 5) Index redondant ────────────────────────────────────────────────────────────────────────
-- `unique (org_id, version_id)` sert déjà les prédicats `where org_id = X` (colonne de tête).
drop index if exists public.org_ref_adoptions_org_idx;
