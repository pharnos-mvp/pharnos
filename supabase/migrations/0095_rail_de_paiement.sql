-- 0095 — La commande sait de quel PROCESSEUR elle vient.
--
-- POURQUOI DEUX RAILS, ET POURQUOI C'EST L'ÉTAT FINAL. Aucun processeur ne couvre à la fois le
-- mobile money UEMOA (Chariow, seul à le faire) et la conformité fiscale mondiale (Paddle, qui est
-- merchant of record : il devient le vendeur légal, s'immatricule et reverse la TVA à notre place).
-- Le catalogue, la naissance de commande et tout l'après-paiement restent COMMUNS ; seul le canal
-- d'encaissement change.
--
-- ⚠️ `chariow_sale_id` garde son nom alors qu'il portera aussi des identifiants Paddle (`txn_…`).
-- Le renommer casserait les Edge Functions DÉPLOYÉES à la seconde où la migration passe — et cette
-- colonne est le pivot de l'idempotence de tout le rail. Son unicité reste valable telle quelle :
-- les identifiants des deux processeurs ne peuvent pas se confondre (`SALE…` contre `txn_…`).
-- Le renommage se fera le jour où un seul rail restera, avec les déploiements dans l'ordre.

alter table public.orders
  add column if not exists rail text not null default 'chariow'
    check (rail in ('chariow', 'paddle'));

comment on column public.orders.rail is
  'Processeur qui a encaissé cette commande. `chariow_sale_id` porte alors SON identifiant de vente '
  '(Chariow : SALE… · Paddle : txn_…). Défaut `chariow` : toutes les commandes antérieures à 0095 '
  'viennent de là, et le défaut évite une reprise de données sur une table qui encaisse.';

-- L'index sert le balayage de réconciliation, qui n'interroge QUE les ventes d'un rail donné :
-- sans lui, il lirait les commandes de l'autre processeur pour les jeter ensuite.
create index if not exists orders_rail_idx on public.orders (rail, created_at desc);
