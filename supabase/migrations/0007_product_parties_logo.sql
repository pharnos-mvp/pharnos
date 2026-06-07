-- 0007_product_parties_logo.sql — Titulaire/Fabricant produit + logo profil pro (M6)

alter table public.products add column if not exists titulaire text not null default '';
alter table public.products add column if not exists fabricant text not null default '';

alter table public.pro_settings add column if not exists logo_image text;
