-- 0060 — Corrige le « n° d'opération en attente perpétuel » côté client.
--
-- Le trigger `assign_op_number` (0046) attribue op_year/op_number à l'INSERT mais NE bumpait PAS
-- `updated_at`. Or le pull client est incrémental : `.gt('updated_at', curseur)` (dossier-sync.ts).
-- Dès que le curseur atteint la ligne (= son propre updated_at, poussé par le client), sa version
-- NUMÉROTÉE n'est plus jamais refetchée → le n° reste « en attente » côté client (selon la course des
-- sync, parfois à vie). Reproduit en prod : OP-2026-0006 attribué serveur, jamais descendu au client.
--
-- Correctif : on AVANCE `updated_at` (jamais en arrière : greatest) au moment de l'attribution, de
-- sorte que la ligne fraîchement numérotée dépasse le curseur au prochain pull. N° et updated_at sont
-- posés dans le MÊME insert (atomiques) → aucune fenêtre de course, aucune ligne « numérotée invisible ».
-- Idempotent (CREATE OR REPLACE) ; logique d'attribution inchangée par ailleurs.

create or replace function public.assign_op_number()
  returns trigger
  language plpgsql
  security definer
  set search_path to 'public'
as $function$
declare
  yr smallint;
  seq int;
begin
  if new.op_number is not null then
    return new;
  end if;
  if exists (select 1 from public.dossiers where id = new.id) then
    return new;
  end if;
  yr := extract(year from coalesce(new.created_at, now()))::smallint;
  insert into public.org_op_counters (org_id, year, last_seq)
    values (new.org_id, yr, 1)
    on conflict (org_id, year)
      do update set last_seq = public.org_op_counters.last_seq + 1
    returning last_seq into seq;
  new.op_year := yr;
  new.op_number := seq;
  -- Avance updated_at (jamais en arrière) → la ligne numérotée dépasse le curseur de pull incrémental
  -- et redescend au client. Atomique avec l'attribution du n° (même INSERT), donc pas de strand.
  new.updated_at := greatest(new.updated_at, now());
  return new;
end;
$function$;
