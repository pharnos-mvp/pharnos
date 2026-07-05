-- 0054_retention_purge.sql — Purge de rétention des brouillons supprimés (LOT 9, corbeille).
--
-- Politique (docs/RETENTION-POLICY.md, concrétise STORAGE-DATA-POLICY §7) : un BROUILLON supprimé
-- (soft delete `deleted_at`, jamais soumis) reste restaurable en corbeille pendant une fenêtre de
-- grâce de 30 jours, puis est PURGÉ définitivement par un cron nocturne : fichiers Storage effacés
-- (via l'API Storage — jamais de DELETE SQL sur storage.objects, qui orphelinerait les octets),
-- lignes enfants effacées (dossier_attachments, generated_docs, lifecycle_events), et la ligne
-- `dossiers` réduite en SQUELETTE TOMBSTONE (`purged_at` posé, contenu vidé, identité conservée) :
--   • la sync offline-first continue de propager la suppression aux appareils retardataires
--     (une ligne disparue ne serait jamais vue par le pull incrémental) ;
--   • le squelette est lui-même la preuve d'audit de la purge (ALCOA).
-- Un dossier SOUMIS n'est JAMAIS purgé : garde-fou re-vérifié CÔTÉ SERVEUR par l'Edge
-- (`archived_at` posé OU toute correspondance existante ⇒ exclu), pas seulement par l'UI.
--
-- Sécurité / conception (même pattern que 0050/0051 — relances auto) :
--   • AUCUN secret dans cette migration : URL de la fonction et secret partagé lus DANS Vault à
--     l'exécution du job. Entrées attendues : `retention_purge_url` + `lifecycle_cron_secret`
--     (secret PARTAGÉ par les crons internes — une seule rotation, même domaine de confiance ;
--     l'Edge le vérifie via la RPC hash `lifecycle_cron_secret_hash`, 0051).
--   • `purged_at` est GÉRÉ PAR LE SERVEUR : trigger anti-écriture client (un membre qui poserait
--     `purged_at` lui-même ferait sauter la purge réelle — fichiers jamais nettoyés — puisque
--     l'Edge ne traite que `purged_at is null`). Le client ne pousse jamais la colonne (pattern
--     op_year/op_number) : le trigger ne gêne aucun flux légitime.
--
-- OPS — une fois par environnement, HORS source :
--   select vault.create_secret('https://<ref>.supabase.co/functions/v1/retention-purge',
--                              'retention_purge_url');
--   (le secret `lifecycle_cron_secret` existe depuis la pose de 0050.)
--   Smoke : POST manuel avec x-cron-secret et body {"dryRun":true} → {scanned, planned, …}.

-- 1) Colonne de purge (additive, nullable → rétro-compatible).
alter table public.dossiers add column if not exists purged_at timestamptz;

comment on column public.dossiers.purged_at is
  'Purge de rétention (LOT 9) : posée par l''Edge retention-purge quand le brouillon supprimé dépasse la fenêtre de grâce. Ligne conservée en squelette tombstone (sync + audit). Server-managed (trigger protect_dossier_purged_at).';

-- 2) Index partiel : le scan nocturne ne touche que la corbeille non purgée (quasi vide en régime
--    de croisière) — jamais de scan de la table entière.
create index if not exists dossiers_trash_purge_idx
  on public.dossiers (deleted_at)
  where deleted_at is not null and purged_at is null;

-- 3) purged_at server-managed + tombstone IMMUABLE côté API. Deux gardes dans le même trigger :
--    a) un squelette purgé est TERMINAL : toute écriture d'un client (appareil hors-ligne
--       retardataire dont l'outbox upsert la vieille copie — deleted_at à null, contenu re-rempli)
--       est NEUTRALISÉE (return old = no-op silencieux : l'outbox du client se draine normalement,
--       le tombstone reste intact, le pull re-propage l'état purgé) ;
--    b) un client ne peut pas POSER purged_at lui-même (il simulerait une purge → l'Edge, qui ne
--       traite que purged_at is null, ne nettoierait jamais fichiers ni enfants).
--    Seul service_role (l'Edge) écrit ces états ; un rôle non-API (postgres en SQL direct,
--    ex. réparation manuelle) reste libre — auth.role() y est NULL.
create or replace function public.protect_dossier_purged_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') in ('', 'service_role') then
    return new;
  end if;
  if old.purged_at is not null then
    return old; -- tombstone purgé : écriture client neutralisée (no-op silencieux)
  end if;
  if new.purged_at is distinct from old.purged_at then
    raise exception 'purged_at is server-managed (retention purge)';
  end if;
  return new;
end
$$;

revoke all on function public.protect_dossier_purged_at() from public, anon, authenticated;

drop trigger if exists protect_dossier_purged_at_trg on public.dossiers;
create trigger protect_dossier_purged_at_trg
  before update on public.dossiers
  for each row execute function public.protect_dossier_purged_at();

-- 4) Cron nocturne — replay-safe : désinscrire (best-effort) puis réinscrire.
create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$
begin
  perform cron.unschedule('retention-purge');
exception
  when others then null; -- job absent (première pose)
end $$;

-- Tous les jours à 05:37 UTC — décalé de 20 min après les relances auto (05:17) pour ne pas
-- empiler deux réveils Edge, toujours avant la journée de travail ouest-africaine.
select cron.schedule(
  'retention-purge',
  '37 5 * * *',
  $job$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets
            where name = 'retention_purge_url'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets
                        where name = 'lifecycle_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $job$
);
