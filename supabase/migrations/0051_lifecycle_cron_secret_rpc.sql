-- 0051_lifecycle_cron_secret_rpc.sql — Auth du cron relances auto SANS synchronisation de secret
-- (durcissement ops de 0050, LOT 10).
--
-- Le déploiement initial (0050) demandait de RECOPIER le secret Vault vers un secret
-- d'environnement Edge (`supabase secrets set LIFECYCLE_CRON_SECRET`) : une opération manuelle
-- qui fait transiter le secret par un canal d'ops (terminal, transcript). Remplacée :
--   • La fonction Edge `lifecycle-reminders` vérifie désormais le header `x-cron-secret` contre
--     le HASH SHA-256 du secret Vault, obtenu via cette RPC SECURITY DEFINER.
--   • UNE seule source de vérité (Vault `lifecycle_cron_secret`), zéro copie : la rotation =
--     `select vault.update_secret(id, <nouveau>)` — rien d'autre à toucher.
--   • Seul le HASH sort de la base, et uniquement pour `service_role` (l'Edge) — anon et
--     authenticated sont révoqués ; le secret lui-même est indéductible (préimage SHA-256).
--   • L'étape OPS « supabase secrets set LIFECYCLE_CRON_SECRET » de 0050 est OBSOLÈTE : la
--     variable d'environnement, même présente, n'est plus lue par la fonction.

create or replace function public.lifecycle_cron_secret_hash()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select encode(extensions.digest(decrypted_secret, 'sha256'), 'hex')
  from vault.decrypted_secrets
  where name = 'lifecycle_cron_secret'
  order by created_at desc
  limit 1
$$;

comment on function public.lifecycle_cron_secret_hash() is
  'Hash SHA-256 du secret partagé du cron relances auto (Vault, source unique) — lecture réservée au service-role (Edge lifecycle-reminders, LOT 10).';

revoke all on function public.lifecycle_cron_secret_hash() from public, anon, authenticated;
grant execute on function public.lifecycle_cron_secret_hash() to service_role;
