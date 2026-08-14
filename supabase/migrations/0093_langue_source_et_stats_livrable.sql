-- 0093 — LOT B3 : la langue du document SOURCE vit sur le job, et le livrable porte ses comptes.
--
-- `source_lang` : détectée par la PORTE de recevabilité (majorité des titres FR du gabarit vs EN
-- de la table d'assemblage, comptée sur les tables entières), écrite au lancement du job, jamais
-- devinée ensuite. Elle commande les libellés de phase de la page publique (une source anglaise
-- ne subit pas de « Traduction anglaise ») et le nom de l'archive livrée
-- (`Produit_RCP Upgrade.zip` pour une source FR, `Produit_SmPC Upgrade.zip` pour une source EN).
--
-- `product_name` : le nom du produit (rubrique 1), écrit UNE fois par le worker quand la rubrique
-- aboutit. Sans lui, la page publique — sondée toutes les deux secondes — requêtait la rubrique 1
-- à chaque sondage pour un texte qui ne change jamais : ~150 allers-retours par commande.
--
-- `deliverable_stats` : les quatre comptes de l'écran de livraison (rubriques reprises, rubriques
-- à compléter, contenus remis à leur place, valeurs à relire), calculés UNE fois à l'assemblage —
-- le seul moment où conformité et revue sont ensemble en mémoire — et figés avec le livrable.
--
-- `if not exists` : le remote a déjà pris des numéros réservés deux fois (0089/0090) — une
-- migration qui ne se rejoue pas est une migration qui finira par casser un push.
alter table public.upgrade_jobs
  add column if not exists source_lang text check (source_lang in ('fr', 'en')),
  add column if not exists product_name text,
  add column if not exists deliverable_stats jsonb;

comment on column public.upgrade_jobs.source_lang is
  'Langue du document source, détectée par la porte de recevabilité — null sur les jobs antérieurs au LOT B.';
comment on column public.upgrade_jobs.product_name is
  'Nom du produit (rubrique 1), écrit par le worker quand elle aboutit — évite une requête par sondage de la page publique.';
comment on column public.upgrade_jobs.deliverable_stats is
  'Comptes de l''écran de livraison {reprises, aCompleter, deplaces, aRelire}, figés à l''assemblage — null sur les jobs antérieurs au LOT B.';
