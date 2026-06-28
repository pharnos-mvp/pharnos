-- 0045 — Modèle `parties` (référentiel RIM : Organisations à rôles) + FK produits.
--
-- ADDITIF & non destructif : nouvelle table + colonnes FK NULLABLES sur `products`. Le free-text
-- `titulaire`/`fabricant` (0007) reste la source de vérité pendant la transition → zéro régression,
-- zéro perte de données. La dérivation des `parties` depuis les free-text est faite CÔTÉ CLIENT
-- (offline-first, IDs déterministes → dédup naturelle serveur/multi-appareil) ; ce fichier ne pose
-- QUE le schéma + la RLS (isolation tenant, pilier confidentialité pharma).
--
-- Une seule entité « Organisation » avec des rôles cumulables (Titulaire d'AMM / Fabricant /
-- Distributeur), conforme RA + IDMP (ADR-0001) — on ne duplique pas une org par type.

create table if not exists public.parties (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id) on delete cascade,
  nom text not null check (char_length(nom) between 1 and 300),
  -- Rôles cumulables : 'titulaire' | 'fabricant' | 'distributeur'. CHECK = vocabulaire contrôlé.
  roles text[] not null default '{}'
    check (roles <@ array['titulaire', 'fabricant', 'distributeur']::text[]),
  pays text not null default '',
  adresse text not null default '',
  -- GMP (pertinent pour le rôle fabricant) : N° de certificat + échéance suivie par Monitor.
  gmp_certificat text not null default '',
  gmp_expiry date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Soft delete : conservé pour la réconciliation de synchro (miroir du pattern produits).
  deleted_at timestamptz
);
create index if not exists parties_org_idx on public.parties (org_id);

alter table public.parties enable row level security;

-- RLS : miroir EXACT du pattern `products` (isolation par org via current_user_org_ids()).
drop policy if exists parties_select on public.parties;
create policy parties_select on public.parties
  for select using (org_id in (select public.current_user_org_ids()));

drop policy if exists parties_insert on public.parties;
create policy parties_insert on public.parties
  for insert with check (org_id in (select public.current_user_org_ids()));

drop policy if exists parties_update on public.parties;
create policy parties_update on public.parties
  for update using (org_id in (select public.current_user_org_ids()))
  with check (org_id in (select public.current_user_org_ids()));

drop policy if exists parties_delete on public.parties;
create policy parties_delete on public.parties
  for delete using (org_id in (select public.current_user_org_ids()));

-- Liens produit → organisation. NULLABLE (le free-text reste en secours) ; ON DELETE SET NULL :
-- supprimer une organisation ne casse jamais un produit (le free-text subsiste). Index sur les FK
-- (advisor unindexed_foreign_keys + chemin de requête des agrégations par org).
alter table public.products
  add column if not exists titulaire_id uuid references public.parties (id) on delete set null,
  add column if not exists fabricant_id uuid references public.parties (id) on delete set null;
create index if not exists products_titulaire_id_idx on public.products (titulaire_id);
create index if not exists products_fabricant_id_idx on public.products (fabricant_id);
