-- Le cron réveille `job-tick` dans l'état exact que `reconcilierBasculesPerdues` répare.
--
-- LE DÉFAUT — du code juste que rien n'appelle, la signature de ce chantier. Une « bascule
-- perdue » (job `done` + livrable écrits, mais commande restée `running` : isolat tué entre les
-- deux écritures, ou écriture de la commande échouée) ne satisfaisait AUCUNE branche du prédicat
-- de `0086` : ses rubriques sont toutes `done`, son job est `done`. Or la réconciliation vit dans
-- `job-tick`, que le cron n'invoque que si le prédicat est vrai. Si rien d'autre ne tourne — le
-- cas NORMAL d'un produit qui prend ses premières commandes — l'orpheline attendait le prochain
-- acheteur… potentiellement jusqu'à l'expiration de son lien, livrable en base, payé, jamais servi.
--
-- La troisième branche réveille le tick tant qu'une bascule perdue existe. Elle est bornée par
-- construction : la réconciliation la répare au premier réveil, et le prédicat redevient faux.
select cron.unschedule('upgrade-tick');
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
    union all
    select 1 from public.upgrade_jobs j
      join public.orders o on o.id = j.order_id
     where j.phase = 'done' and j.error is null
       and j.deliverable_fr is not null and o.status = 'running'
  );
  $job$
);
