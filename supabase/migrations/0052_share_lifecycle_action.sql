-- 0052_share_lifecycle_action.sql — Vue Agent local tokenisée (LOT 10b, jalon M7).
--
-- L'Edge `share` gagne l'action `lifecycle_event` : l'agent local (lien tokenisé, sans compte)
-- confirme les jalons AVAL du cycle de vie (réception, dépôt agence, notification relayée, AMM)
-- — chaque écriture passe par le service-role APRÈS validation du token (ADR-0003, RLS intacte)
-- et est journalisée dans `share_access_log`, dont le CHECK doit accepter le nouveau verbe
-- (avertissement explicite dans share/index.ts : sinon le journal d'accès échoue en silence).

alter table public.share_access_log
  drop constraint if exists share_access_log_action_check;
alter table public.share_access_log
  add constraint share_access_log_action_check
  check (action in ('open', 'decide', 'reply', 'lifecycle_event'));
