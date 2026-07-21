-- 0065_products_pght.sql — PGHT (Prix Grossiste Hors Taxe) multi-pays sur les produits.
--
-- La fiche produit (session Identification) capture désormais une table de prix par pays
-- ({country, currency, amount}) ; ces montants alimentent la « Lettre de PGHT » du CTD Builder
-- (prix du pays du dossier, converti en FCFA). Le stockage était local-only (Dexie) → cette colonne
-- le rend synchronisé cross-device comme le reste du produit.
--
-- ADDITIF & non destructif : colonne jsonb NOT NULL DEFAULT '[]' → les produits existants prennent
-- un tableau vide, aucun push existant ne casse. Aucune contrainte de forme au niveau SQL (la
-- validation de forme/devise/montant est côté client, zod) ; la colonne hérite de la RLS de `products`
-- (isolation par org, migration 0009/0033) — pas de policy par colonne à ajouter.

alter table public.products
  add column if not exists pght jsonb not null default '[]'::jsonb;

comment on column public.products.pght is
  'PGHT par pays : [{country: ISO2, currency: XOF|EUR, amount: string}] ; alimente la lettre PGHT (M-PGHT, 0065).';
