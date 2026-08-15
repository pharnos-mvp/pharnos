-- 0094 — LOT C1 : la réconciliation ACTIVE des ventes — la chaîne n'est plus jamais suspendue au
-- webhook d'un tiers.
--
-- La première vente réelle (2026-08-14) a payé pour l'apprendre : le Pulse Chariow n'est JAMAIS
-- arrivé, et la commande n'est née que d'un webhook déclenché à la main. Ce cron automatise ce
-- geste : toutes les deux minutes, l'Edge `chariow-reconcile` balaie les ventes réglées
-- (`GET /v1/sales`) et fait naître ce qui manque — par le MÊME chemin re-vérifié que le webhook.
--
-- Patron secret identique à `job-tick` (0086) et `lifecycle-reminders` (0051) : le secret vit dans
-- Vault, se génère DANS la base, et seul son HASH sort — vers le service-role uniquement.
--
-- ⚠️ OPS (à exécuter APRÈS cette migration, DANS la base — jamais par un terminal) :
--   select vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'chariow_reconcile_secret');
--   select vault.create_secret('https://<projet>.supabase.co/functions/v1/chariow-reconcile', 'chariow_reconcile_url');
-- Rotation : `vault.update_secret`, rien d'autre à toucher.

create or replace function public.chariow_reconcile_secret_hash()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select encode(extensions.digest(decrypted_secret, 'sha256'), 'hex')
  from vault.decrypted_secrets
  where name = 'chariow_reconcile_secret'
  order by created_at desc
  limit 1
$$;

comment on function public.chariow_reconcile_secret_hash() is
  'Hash SHA-256 du secret partagé du cron de réconciliation des ventes (Vault, source unique) — lecture réservée au service-role (Edge chariow-reconcile, LOT C1).';

revoke all on function public.chariow_reconcile_secret_hash() from public, anon, authenticated;
grant execute on function public.chariow_reconcile_secret_hash() to service_role;

-- Les ventes DÉFINITIVEMENT écartées par la re-vérification (produit hors périmètre malgré le
-- tri, contact absent…) : sans cette mémoire, une vente à jamais non-naissable était
-- re-téléchargée toutes les deux minutes ET occupait un créneau du cap à chaque tour — cinq
-- comme elle suffisaient à AFFAMER le balayage entier, en silence (trouvé en revue de diff).
-- Un verdict transitoire (panne réseau) n'y entre JAMAIS : il se retente au tour suivant.
create table if not exists public.chariow_reconcile_skips (
  sale_id text primary key,
  reason text not null,
  until timestamptz not null
);
comment on table public.chariow_reconcile_skips is
  'Ventes écartées DÉFINITIVEMENT par la réconciliation (LOT C1) — re-vérifiées au plus une fois par `until`, jamais toutes les 2 minutes.';
alter table public.chariow_reconcile_skips enable row level security;
-- Service-role uniquement : aucune policy — comme orders/order_tokens/upgrade_jobs.

-- Toutes les 2 minutes, gardé par la PRÉSENCE des secrets Vault : le travail à détecter vit chez
-- Chariow, pas dans notre base — c'est précisément ce qui rend ce cron nécessaire. Sans la garde,
-- un oubli de l'étape OPS ferait échouer `net.http_post(url := null)` toutes les deux minutes,
-- pour toujours — 720 échecs par jour dans `cron.job_run_details`, sans un symptôme visible.
select cron.schedule(
  'chariow-reconcile',
  '*/2 * * * *',
  $job$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'chariow_reconcile_url'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'chariow_reconcile_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  )
  where exists (
    select 1 from vault.decrypted_secrets where name = 'chariow_reconcile_url'
  ) and exists (
    select 1 from vault.decrypted_secrets where name = 'chariow_reconcile_secret'
  );
  $job$
);
