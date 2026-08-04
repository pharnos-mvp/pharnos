-- 0084 — Le moteur en série : réclamation, sémaphore global, filet (PLAN-UPGRADE-PROD §2.5, U4).
--
-- Le mur n'est pas le CPU — les appels IA sont de l'ATTENTE — c'est le wall clock de 150 s par
-- invocation. Une orchestration de 5,3 minutes n'y rentre pas. Elle rentre parfaitement en VAGUES,
-- et tout ce fichier existe pour rendre ces vagues sûres quand plusieurs tournent à la fois.

-- ─────────────────────────── Réclamation d'une vague, SKIP LOCKED ──────────────────────────────
--
-- Deux ticks simultanés sont NORMAUX ici : le chemin nominal est l'auto-chaînage (le tick se
-- ré-invoque), et `pg_cron` sert de filet toutes les 30 s. `for update skip locked` rend cette
-- concurrence inoffensive — deux ticks ne réclament jamais la même rubrique — là où un simple
-- `select … where status='queued'` puis `update` les ferait travailler en double, à ~0,04 $ l'appel.
--
-- Le SÉMAPHORE GLOBAL est le seul endroit où la montée en charge se règle. Sans lui, dix acheteurs
-- simultanés lancent soixante appels et le fournisseur nous limite en 429 — chaque rejeu étant
-- lui-même facturé. Il compte les rubriques `running` TOUTES COMMANDES CONFONDUES.
create or replace function public.claim_upgrade_sections(
  p_job uuid,
  p_phase text,
  p_limit int,
  p_global_cap int
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

  -- Places réellement disponibles : jamais plus que la vague demandée, jamais plus que ce que le
  -- plafond global laisse. Un plafond déjà atteint rend zéro ligne — le tick se rendort, il
  -- n'échoue pas.
  v_slots := least(p_limit, greatest(0, p_global_cap - v_running));
  if v_slots <= 0 then
    return;
  end if;

  return query
  with pris as (
    select s.id
    from public.upgrade_sections s
    where s.job_id = p_job
      and s.phase = p_phase
      and s.status = 'queued'
      -- ⚠️ `attempts` borne les reprises AVANT la réclamation. Une rubrique qui a déjà brûlé ses
      -- trois tentatives ne doit pas être reprise indéfiniment : elle coûterait à chaque tour.
      and s.attempts < 3
    order by s.created_at
    limit v_slots
    for update skip locked
  )
  update public.upgrade_sections s
  set status = 'running',
      claimed_at = now(),
      -- Incrémenté à la RÉCLAMATION, pas à l'échec : un worker tué en vol n'écrit rien, et un
      -- compteur incrémenté seulement en cas d'échec laisserait la rubrique tourner sans fin.
      attempts = s.attempts + 1
  from pris
  where s.id = pris.id
  returning s.*;
end;
$$;

revoke all on function public.claim_upgrade_sections(uuid, text, int, int) from public, anon, authenticated;
grant execute on function public.claim_upgrade_sections(uuid, text, int, int) to service_role;

-- ─────────────────────────────────────── Le filet ──────────────────────────────────────────────
--
-- Une invocation Edge peut être tuée sans rien écrire (mur de 150 s, redémarrage de plateforme).
-- Ses rubriques restent alors `running` pour toujours, et le job se fige sans que rien ne le
-- signale. On les remet en file au-delà d'un délai franchement supérieur au pire cas mesuré
-- (vague la plus lente : 48,3 s).
--
-- ⚠️ Celles qui ont épuisé leurs tentatives passent en `failed`, pas en `queued` : les rendre à la
-- file les ferait reprendre sans fin.
create or replace function public.requeue_dead_sections(p_stale_seconds int default 180)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
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
      error = case when m.attempts >= 3 then 'réclamation perdue, tentatives épuisées' else s.error end
  from mortes m
  where s.id = m.id;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.requeue_dead_sections(int) from public, anon, authenticated;
grant execute on function public.requeue_dead_sections(int) to service_role;

-- ────────────────────────────── Le prochain travail à servir ───────────────────────────────────
--
-- ÉQUITÉ : du plus ancien au plus récent. Une grosse commande ne doit pas faire attendre
-- indéfiniment une petite (§2.6). Le tick n'a donc pas à choisir — la base tranche.
create or replace function public.next_upgrade_work()
returns table (job_id uuid, phase text, restantes bigint)
language sql
stable
security definer
set search_path = public
as $$
  select j.id, j.phase, count(s.id)
  from public.upgrade_jobs j
  join public.upgrade_sections s
    on s.job_id = j.id and s.phase = j.phase and s.status = 'queued' and s.attempts < 3
  where j.phase <> 'done'
  group by j.id, j.phase, j.created_at
  order by j.created_at
  limit 1
$$;

revoke all on function public.next_upgrade_work() from public, anon, authenticated;
grant execute on function public.next_upgrade_work() to service_role;

-- ──────────────────────── Auth du tick — le secret ne sort JAMAIS de la base ───────────────────
--
-- Même patron que `lifecycle_cron_secret_hash()` (0051) : UNE source de vérité dans Vault, zéro
-- copie vers un secret d'environnement. Seul le HASH sort, et seulement pour `service_role` — la
-- préimage d'un SHA-256 reste hors d'atteinte. La rotation, c'est `vault.update_secret`, rien d'autre.
create or replace function public.upgrade_tick_secret_hash()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select encode(extensions.digest(decrypted_secret, 'sha256'), 'hex')
  from vault.decrypted_secrets
  where name = 'upgrade_tick_secret'
  order by created_at desc
  limit 1
$$;

revoke all on function public.upgrade_tick_secret_hash() from public, anon, authenticated;
grant execute on function public.upgrade_tick_secret_hash() to service_role;

comment on function public.upgrade_tick_secret_hash() is
  'Hash SHA-256 du secret partagé du tick d''upgrade (Vault, source unique) — service-role seul.';
