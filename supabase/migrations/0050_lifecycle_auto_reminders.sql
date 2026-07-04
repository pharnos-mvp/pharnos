-- 0050_lifecycle_auto_reminders.sql — Relances AUTOMATIQUES du cycle de vie (LOT 10, phase 2 du
-- jalon M5). pg_cron appelle chaque nuit l'Edge Function `lifecycle-reminders` via pg_net ; la
-- fonction dérive côté serveur les dossiers « en attente d'un tiers » au-delà du seuil pays et
-- journalise `reminder_sent` (actor_id = 'system', payload { stage, waiting_days, threshold_days })
-- + e-mail best-effort au côté labo. Détails : supabase/functions/lifecycle-reminders/index.ts.
--
-- Sécurité / conception :
--   • AUCUN secret dans cette migration (source publique = jamais de littéral) : l'URL de la
--     fonction et le secret partagé `x-cron-secret` sont lus DANS Vault À L'EXÉCUTION du job.
--     Entrées Vault attendues : `lifecycle_reminders_url` + `lifecycle_cron_secret`.
--     Si elles manquent, net.http_post reçoit NULL → échec visible dans cron.job_run_details,
--     zéro écriture (fail-safe observable).
--   • Le job tourne en rôle postgres (propriétaire) : lecture Vault et net.* OK, rien à granter
--     à anon/authenticated — la surface API publique ne change pas.
--   • L'Edge (verify_jwt = false) n'accepte QUE le secret partagé — voir le contrat dans la
--     fonction. L'événement journalisé REPART le compteur d'attente → rejouer le cron le même
--     jour ne double-tire pas (auto-idempotence).
--
-- OPS — une fois par environnement, HORS source (cf. docs/PLAN-LIFECYCLE.md §5, LOT 10) :
--   1) Générer un secret 256 bits (ex. select encode(gen_random_bytes(32), 'hex');)
--   2) Vault : select vault.create_secret('<secret>',  'lifecycle_cron_secret');
--              select vault.create_secret('https://<ref>.supabase.co/functions/v1/lifecycle-reminders',
--                                         'lifecycle_reminders_url');
--   3) Edge  : supabase secrets set LIFECYCLE_CRON_SECRET=<secret>   (même valeur)
--   4) Smoke : POST manuel avec header x-cron-secret et body {"dryRun":true} → {scanned, planned…}

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Replay-safe : reprogrammer = désinscrire (best-effort) puis réinscrire.
do $$
begin
  perform cron.unschedule('lifecycle-auto-reminders');
exception
  when others then null; -- job absent (première pose)
end $$;

-- Tous les jours à 05:17 UTC (≈ 05-06 h en Afrique de l'Ouest : les relances sont journalisées
-- et les e-mails arrivent avant la journée de travail, sans chevaucher les backups nocturnes).
select cron.schedule(
  'lifecycle-auto-reminders',
  '17 5 * * *',
  $job$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets
            where name = 'lifecycle_reminders_url'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets
                        where name = 'lifecycle_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $job$
);
