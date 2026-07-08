-- 0059_reminders_business_hours.sql — Relances aux HEURES OUVRABLES (au lieu de l'aube/nuit).
--
-- Décision CEO : les relances doivent arriver PENDANT les heures ouvrables, pas la nuit. On passe le
-- job `lifecycle-auto-reminders` (0050) de **05:17 UTC tous les jours** à **09:00 UTC du lundi au
-- vendredi**. Pourquoi 09:00 UTC : c'est « heures de bureau » pour toute la chaîne à la fois —
-- Afrique de l'Ouest (agences, UTC+0/+1) ≈ 09-10 h le matin ; Inde/Bangladesh (fabricants, UTC+5:30/+6)
-- ≈ 14 h 30-15 h l'après-midi ; Europe (UTC+1/+2) ≈ 10-11 h. `1-5` = jours ouvrables (pas de week-end).
-- Le moteur reste IDEMPOTENT : une pièce/un dossier qui franchit son seuil samedi est relancé lundi
-- 09:00, sans double tir. Aucun secret ici (URL + `x-cron-secret` lus dans Vault à l'exécution, cf. 0050).

do $$
begin
  perform cron.unschedule('lifecycle-auto-reminders');
exception
  when others then null; -- job absent (ne devrait pas, mais reste replay-safe)
end $$;

select cron.schedule(
  'lifecycle-auto-reminders',
  '0 9 * * 1-5',
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
