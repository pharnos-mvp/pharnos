-- 0012_product_addresses.sql — Adresses séparées du titulaire et du fabricant (Slice 0)
-- Le nom reste dans `titulaire`/`fabricant` ; l'adresse passe dans ces nouvelles colonnes
-- (bandeau système = nom seul ; page de couverture = nom + adresse). `not null default ''`
-- → les lignes existantes obtiennent '' automatiquement (aucune perte de données).

alter table public.products add column if not exists titulaire_adresse text not null default '';
alter table public.products add column if not exists fabricant_adresse text not null default '';
