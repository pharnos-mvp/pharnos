-- Le jeton de l'e-mail n°2 devient POSSIBLE — la contrainte de `order_tokens` le refusait.
--
-- LE DÉFAUT, ET IL ÉTAIT TOTAL. `0083` fige `source in ('email','claim')` ; U5 insère
-- `source: 'completion'` pour le lien « vos fichiers sont prêts ». L'insertion levait un 23514 à
-- CHAQUE commande, l'envoi n'avait jamais lieu, et le `if (insErr) return` le taisait — pendant
-- que l'écran promettait l'e-mail et invitait à fermer l'onglet. Un envoi « au mieux » a le droit
-- d'échouer ; il n'a pas le droit d'échouer en silence : c'est ce silence qui a laissé passer ce
-- défaut, et le code le journalise désormais.
alter table public.order_tokens drop constraint if exists order_tokens_source_check;
alter table public.order_tokens add constraint order_tokens_source_check
  check (source in ('email', 'claim', 'completion'));

comment on constraint order_tokens_source_check on public.order_tokens is
  'email = jeton de l''e-mail n°1 (chariow-pulse) · claim = frappé par le pont (order-claim) · '
  'completion = frappé à la complétion pour l''e-mail n°2 (job-tick). Toute nouvelle source '
  's''ajoute ICI d''abord : la contrainte est le contrat, pas le code appelant.';
