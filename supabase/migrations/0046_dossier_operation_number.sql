-- 0046_dossier_operation_number.sql — Numéro d'opération CANONIQUE, séquentiel, unique par org+année.
--
-- L'app est OFFLINE-FIRST : un dossier naît dans Dexie (hors-ligne) puis se synchronise (PostgREST
-- upsert). On ne peut donc PAS attribuer un n° séquentiel hors-ligne. Modèle retenu = « numéro
-- officiel à l'engagement » : le n° est attribué CÔTÉ SERVEUR à la 1re insertion (trigger BEFORE
-- INSERT). Un brouillon local non encore synchronisé n'a pas de n° → l'UI affiche « n° en attente ».
--
-- ADDITIF (colonnes nullable) ; aucun impact RLS (dossiers déjà org-scoped). Affichage = OP-{op_year}-{op_number sur 4}.

-- 1) Colonnes du n° d'opération.
alter table public.dossiers
  add column if not exists op_year smallint,
  add column if not exists op_number int;

-- 2) Compteur par (org, année). Table INTERNE : RLS activée SANS policy → inaccessible aux clients
--    (PostgREST), seul le trigger SECURITY DEFINER y touche (il bypass la RLS).
create table if not exists public.org_op_counters (
  org_id uuid not null references public.orgs (id) on delete cascade,
  year smallint not null,
  last_seq int not null default 0,
  primary key (org_id, year)
);
alter table public.org_op_counters enable row level security;

-- 3) Backfill : numérote les dossiers existants par (org, année) dans l'ordre de création.
with numbered as (
  select id,
         extract(year from created_at)::smallint as yr,
         row_number() over (
           partition by org_id, extract(year from created_at)
           order by created_at, id
         ) as rn
  from public.dossiers
  where op_number is null
)
update public.dossiers d
set op_year = n.yr, op_number = n.rn
from numbered n
where d.id = n.id;

-- 4) Seed les compteurs au max déjà attribué (les prochains numéros continuent la séquence).
insert into public.org_op_counters (org_id, year, last_seq)
select org_id, op_year, max(op_number)
from public.dossiers
where op_number is not null
group by org_id, op_year
on conflict (org_id, year)
  do update set last_seq = greatest(public.org_op_counters.last_seq, excluded.last_seq);

-- 5) Unicité du n° (org, année, numéro).
create unique index if not exists dossiers_op_ref_uniq
  on public.dossiers (org_id, op_year, op_number)
  where op_number is not null;

-- 6) Attribution atomique à la 1re insertion réelle.
--    Garde `exists(id)` : un upsert d'UPDATE (ré-push d'un dossier édité) déclenche AUSSI le trigger
--    BEFORE INSERT ; sans cette garde, chaque ré-push « brûlerait » un numéro (trous). On n'attribue
--    donc QUE si l'id n'existe pas encore → numérotation SANS TROU. L'incrément du compteur est
--    atomique (INSERT … ON CONFLICT … RETURNING = verrou de ligne, sûr en synchros concurrentes).
create or replace function public.assign_op_number()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  yr smallint;
  seq int;
begin
  if new.op_number is not null then
    return new; -- déjà numéroté (backfill / valeur fournie)
  end if;
  if exists (select 1 from public.dossiers where id = new.id) then
    return new; -- upsert d'update : ne pas réattribuer / ne pas brûler de numéro
  end if;
  yr := extract(year from coalesce(new.created_at, now()))::smallint;
  insert into public.org_op_counters (org_id, year, last_seq)
    values (new.org_id, yr, 1)
    on conflict (org_id, year)
      do update set last_seq = public.org_op_counters.last_seq + 1
    returning last_seq into seq;
  new.op_year := yr;
  new.op_number := seq;
  return new;
end;
$$;

drop trigger if exists dossiers_assign_op_number on public.dossiers;
create trigger dossiers_assign_op_number
  before insert on public.dossiers
  for each row execute function public.assign_op_number();
