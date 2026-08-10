-- 0083 — Commandes payées à l'acte (PLAN-CHARIOW §6, lots L1+L3).
--
-- Première écriture SERVEUR d'un encaissement : jusqu'ici un paiement Chariow abouti ne
-- laissait aucune trace chez nous — le document restait dans l'IndexedDB de l'acheteur et la
-- confirmation vivait dans son navigateur. Cette table est le registre : une ligne par vente,
-- écrite par l'Edge `chariow-pulse` APRÈS re-vérification de la vente auprès de l'API Chariow
-- (un Pulse n'est pas signé : c'est un signal, jamais une preuve).
--
-- Postures héritées du plan, non négociables :
--   • RLS activée SANS policy (deny-all) — écrite et lue par service-role uniquement, comme
--     `checking_leads` (0081) : PII d'acheteurs, aucun rôle client ne lit ni ne forge.
--   • Idempotence EN BASE : `chariow_sale_id` unique. Chariow rejoue un Pulse jusqu'à 5 fois
--     (1 min → 24 h) ; la contrainte garantit « jamais une seconde ligne », pas le code.
--   • Un seul mécanisme de crédits pour toutes les offres à l'acte (upgrade, bundle, audits,
--     packs CTD Builder — B3 du PLAN-CTD-BUILDER dépend de cette table) : `credits_total` /
--     `credits_used`, décrémentés plus tard par la fonction qui PRODUIT le livrable (L5).
--
-- Écarts assumés vis-à-vis du schéma esquissé dans le plan (§6) :
--   • `amount` + `currency` remplacent `amount_xof` : hors zone franc, le checkout règle en
--     EUR (`deviseDePaiement`, checkout-core) — figer « xof » dans le nom mentirait sur les
--     ventes européennes. Le montant est celui que le processeur confirme, dans sa devise.
--   • pas de `lead_id` : le checkout de la Bibliothèque ne transporte aucun lead — ajouter la
--     colonne le jour où un parcours la renseigne, pas avant.
--   • `offer` reste un texte borné SANS enum en dur : la liste blanche vit dans le code de
--     l'Edge (seul un produit du catalogue connu est enregistré) ; un enum SQL ajouterait une
--     migration à chaque offre sans fermer aucun chemin d'écriture — service-role est le seul.

create table if not exists public.orders (
  id                  uuid primary key default gen_random_uuid(),
  created_at          timestamptz not null default now(),
  offer               text not null check (char_length(offer) between 2 and 40),
  status              text not null default 'paid'
                        check (status in ('pending', 'paid', 'delivered', 'refunded', 'failed')),
  chariow_sale_id     text unique check (chariow_sale_id is null or char_length(chariow_sale_id) between 4 and 80),
  chariow_purchase_id text check (chariow_purchase_id is null or char_length(chariow_purchase_id) <= 80),
  amount              integer not null check (amount >= 0),
  currency            text not null check (char_length(currency) = 3),
  email               text not null check (char_length(email) between 3 and 254),
  first_name          text check (first_name is null or char_length(first_name) <= 100),
  last_name           text check (last_name is null or char_length(last_name) <= 100),
  phone               text check (phone is null or char_length(phone) <= 32),
  country             text check (country is null or char_length(country) <= 8),
  -- Jeton de livraison : HACHÉ, jamais en clair (même règle que `share-auth`). Posé par L5.
  delivery_token_hash text,
  credits_total       integer not null default 1 check (credits_total between 1 and 1000),
  credits_used        integer not null default 0 check (credits_used >= 0),
  -- Validité (packs et licence CTD Builder : 12 mois) — null = sans échéance.
  expires_at          timestamptz,
  -- PH-2026-000001, attribué DANS la transaction qui enregistre la vente payée. Null sur une
  -- commande de recette : un règlement de test ne doit jamais entrer dans la séquence légale.
  invoice_number      text unique,
  metadata            jsonb not null default '{}'::jsonb,
  check (credits_used <= credits_total)
);

comment on table public.orders is
  'Commandes payées à l''acte (Chariow) — écrites par l''Edge chariow-pulse après re-vérification serveur.';

-- Lecture équipe « les plus récents d'abord » + rapprochement par acheteur au support.
create index if not exists orders_created_idx on public.orders (created_at desc);
create index if not exists orders_email_idx on public.orders (email);

alter table public.orders enable row level security;   -- aucune policy = deny-all

-- ── Numérotation de facture : séquentielle SANS TROU (PLAN-CHARIOW §10) ───────────────────────
--
-- Pas une SEQUENCE Postgres : une séquence survit au rollback et laisse des trous — précisément
-- ce que l'obligation comptable interdit. Un compteur par année, incrémenté sous verrou de
-- ligne DANS la transaction qui écrit la commande : si l'écriture échoue, le numéro retombe
-- avec elle. Le verrou sérialise les ventes concurrentes ; au débit attendu (ventes à l'acte),
-- il est invisible.

create table if not exists public.invoice_counters (
  year integer primary key,
  last integer not null default 0
);

alter table public.invoice_counters enable row level security;   -- deny-all, service-role only

-- ── Enregistrement atomique d'une vente re-vérifiée ──────────────────────────────────────────
--
-- Appelée UNIQUEMENT par l'Edge `chariow-pulse` (service-role), avec des champs déjà validés
-- par `chariow-pulse-core` contre la réponse de `GET /v1/sales/{id}` — jamais avec le contenu
-- brut d'un Pulse. Idempotente : un rejeu (même `sale_id`) renvoie la ligne existante,
-- n'écrit rien, ne consomme aucun numéro de facture.

create or replace function public.record_chariow_sale(
  p_sale_id text,
  p_purchase_id text,
  p_offer text,
  p_essai boolean,
  p_credits integer,
  p_amount integer,
  p_currency text,
  p_email text,
  p_first_name text,
  p_last_name text,
  p_phone text,
  p_country text,
  p_ref uuid,
  p_metadata jsonb
) returns jsonb
language plpgsql
volatile
set search_path = public
as $$
declare
  v_id uuid;
  v_invoice text;
  v_year integer;
  v_n integer;
begin
  -- Rejeu : la contrainte unique porte la garantie, ce SELECT ne fait qu'éviter une erreur.
  select id, invoice_number into v_id, v_invoice
    from public.orders where chariow_sale_id = p_sale_id;
  if found then
    return jsonb_build_object('order_id', v_id, 'invoice_number', v_invoice, 'inserted', false);
  end if;

  insert into public.orders (
    offer, status, chariow_sale_id, chariow_purchase_id, amount, currency,
    email, first_name, last_name, phone, country, credits_total, metadata
  ) values (
    p_offer, 'paid', p_sale_id, p_purchase_id, p_amount, p_currency,
    p_email, p_first_name, p_last_name, p_phone, p_country, greatest(p_credits, 1),
    coalesce(p_metadata, '{}'::jsonb)
      || jsonb_strip_nulls(jsonb_build_object('ref', p_ref))
      || jsonb_build_object('essai', p_essai)
  )
  on conflict (chariow_sale_id) do nothing
  returning id into v_id;

  if v_id is null then
    -- Course entre deux rejeux : l'insertion concurrente a gagné — on renvoie sa ligne.
    select id, invoice_number into v_id, v_invoice
      from public.orders where chariow_sale_id = p_sale_id;
    return jsonb_build_object('order_id', v_id, 'invoice_number', v_invoice, 'inserted', false);
  end if;

  -- Facture : ventes réelles seulement. Une commande de recette (570/575 F) est enregistrée —
  -- elle doit se voir dans le registre — mais n'entre pas dans la séquence comptable.
  if not p_essai then
    v_year := extract(year from now())::integer;
    insert into public.invoice_counters as c (year, last) values (v_year, 1)
      on conflict (year) do update set last = c.last + 1
      returning c.last into v_n;
    v_invoice := format('PH-%s-%s', v_year, lpad(v_n::text, 6, '0'));
    update public.orders set invoice_number = v_invoice where id = v_id;
  end if;

  return jsonb_build_object('order_id', v_id, 'invoice_number', v_invoice, 'inserted', true);
end;
$$;

revoke all on function public.record_chariow_sale(
  text, text, text, boolean, integer, integer, text, text, text, text, text, text, uuid, jsonb
) from public, anon, authenticated;
grant execute on function public.record_chariow_sale(
  text, text, text, boolean, integer, integer, text, text, text, text, text, text, uuid, jsonb
) to service_role;
