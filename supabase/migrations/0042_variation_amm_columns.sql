-- 0042_variation_amm_columns.sql — Synchronise les champs variation / AMM (moteur de variation, PR #224).
-- ADDITIF, colonnes NULLABLE : aucun impact RLS (colonnes sur des tables déjà org-scoped, dont les
-- policies « for all using/with check org_id ∈ … » couvrent toutes les colonnes) ; rétro-compatible
-- (les dossiers / documents antérieurs restent valides — champs simplement nuls).
--
--  dossiers  : variations (n° des natures cochées) · variation_items (tableau comparatif sérialisé)
--              · amm_numero · amm_date (AMM existante visée par la variation / le renouvellement).
--  documents : issue_date (date d'octroi de l'AMM) · reference (N° officiel, ex. « AMM_2015_7457 »).

alter table public.dossiers
  add column if not exists variations jsonb,
  add column if not exists variation_items jsonb,
  add column if not exists amm_numero text,
  add column if not exists amm_date text;

alter table public.documents
  add column if not exists issue_date text,
  add column if not exists reference text;
