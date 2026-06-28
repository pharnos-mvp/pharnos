-- 0044 — Métadonnées de pièces administratives (wizard création produit).
-- ADDITIF : colonnes nullables sur `documents` — titulaire figurant sur la pièce, pays (AMM),
-- N° de lot (COA). Aucune valeur par défaut, aucune contrainte → zéro impact sur l'existant ;
-- le client (offline-first) les remplit via le wizard, la sync les pousse désormais.
alter table public.documents
  add column if not exists holder text,
  add column if not exists country text,
  add column if not exists batch_number text;
