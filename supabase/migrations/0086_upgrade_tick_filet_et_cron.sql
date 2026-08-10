-- 0086 — Le filet ramasse les orphelines, et le cron démarre le moteur (U4, après revue).
--
-- Trois correctifs, tous issus de la revue de `c0cd3d3` :
--   1. Le filet ne balayait que `running`. Une rubrique `queued` au plafond de tentatives n'était
--      réclamable par personne (`claim_upgrade_sections` et `next_upgrade_work` l'excluent) mais
--      restait comptée comme du travail en attente : **le job était figé pour toujours**, la
--      commande bloquée en `running`, l'acheteur verrouillé, et pas un seul log.
--   2. `order by created_at` ne départageait rien : les rubriques d'un même `upsert` portent
--      l'horodatage de TRANSACTION, donc une valeur identique. L'ordre revenait au plan
--      d'exécution — et en revue, c'est le tableau le plus court qui doit préchauffer le cache.
--   3. Rien n'invoquait `job-tick`. La file se remplissait et ne se vidait jamais.
--
-- ⚠️ Le cron est le DÉMARREUR et le filet, jamais le cadenceur : l'invocation boucle elle-même sur
-- plusieurs vagues. À une vague par tick, ~14 vagues par commande à 30 s de période ajoutaient sept
-- minutes d'attente pure aux 5,3 minutes de travail réel.
create or replace function public.requeue_dead_sections(p_stale_seconds int default 180)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reprises int;
  v_orphelines int;
begin
  -- 1. Réclamations perdues : une invocation tuée laisse `running` pour toujours.
  with mortes as (
    select id, attempts
    from public.upgrade_sections
    where status = 'running'
      and claimed_at < now() - make_interval(secs => p_stale_seconds)
    for update skip locked
  )
  update public.upgrade_sections s
  set status = case when m.attempts >= 3 then 'failed' else 'queued' end,
      claimed_at = null,
      error = case when m.attempts >= 3 then 'reclamation perdue, tentatives epuisees' else s.error end
  from mortes m
  where s.id = m.id;
  get diagnostics v_reprises = row_count;

  -- 2. ORPHELINES : `queued` au plafond. Plus rien ne peut les réclamer, mais le test d'épuisement
  --    de phase les comptait. On les tranche ici, sans quoi le job ne se termine jamais.
  with orphelines as (
    select id from public.upgrade_sections
    where status = 'queued' and attempts >= 3
    for update skip locked
  )
  update public.upgrade_sections s
  set status = 'failed',
      claimed_at = null,
      error = coalesce(s.error, 'tentatives epuisees, plus jamais reclamable')
  from orphelines o
  where s.id = o.id;
  get diagnostics v_orphelines = row_count;

  return v_reprises + v_orphelines;
end;
$$;

revoke all on function public.requeue_dead_sections(int) from public, anon, authenticated;
grant execute on function public.requeue_dead_sections(int) to service_role;

create or replace function public.claim_upgrade_sections(
  p_job uuid, p_phase text, p_limit int, p_global_cap int
)
returns setof public.upgrade_sections
language plpgsql
security definer
set search_path = public
as $$
declare
  v_running int;
  v_slots int;
begin
  select count(*) into v_running from public.upgrade_sections where status = 'running';
  v_slots := least(p_limit, greatest(0, p_global_cap - v_running));
  if v_slots <= 0 then return; end if;

  return query
  with pris as (
    select s.id
    from public.upgrade_sections s
    where s.job_id = p_job and s.phase = p_phase and s.status = 'queued' and s.attempts < 3
    order by s.created_at, s.id
    limit v_slots
    for update skip locked
  )
  update public.upgrade_sections s
  set status = 'running', claimed_at = now(), attempts = s.attempts + 1
  from pris where s.id = pris.id
  returning s.*;
end;
$$;

revoke all on function public.claim_upgrade_sections(uuid, text, int, int) from public, anon, authenticated;
grant execute on function public.claim_upgrade_sections(uuid, text, int, int) to service_role;

-- L'appel ne part QUE s'il y a du travail : un cron qui frappe dans le vide toutes les 30 secondes
-- consomme un worker et brouille les journaux.
--
-- ⚠️ OPS : les deux secrets Vault (`upgrade_tick_url`, `upgrade_tick_secret`) doivent exister AVANT
-- que ce cron ne serve à quelque chose. Le secret se génère DANS la base
-- (`encode(extensions.gen_random_bytes(32), 'hex')`) — il ne doit transiter ni par un terminal, ni
-- par un secret d'environnement Edge. Rotation : `vault.update_secret`, rien d'autre à toucher.
select cron.schedule(
  'upgrade-tick',
  '30 seconds',
  $job$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'upgrade_tick_url'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'upgrade_tick_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 150000
  )
  where exists (
    select 1 from public.upgrade_sections where status in ('queued', 'running')
    union all
    select 1 from public.upgrade_jobs where phase <> 'done'
  );
  $job$
);
