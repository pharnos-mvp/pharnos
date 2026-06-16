-- 0030_dossiers_archived.sql — Intégrité des données (GxP / ALCOA++) : archivage des dossiers.
--
-- Un dossier SOUMIS (≥ 1 correspondance avec une agence) est un enregistrement réglementaire :
-- on ne le SUPPRIME pas, on l'ARCHIVE (retiré de l'actif, CONSERVÉ pour la durée de rétention,
-- jamais purgé). `archived_at` est distinct de `deleted_at` (suppression douce des brouillons) :
--   - deleted_at : brouillon retiré (corbeille, purgeable à terme).
--   - archived_at : dossier soumis conservé (rétention réglementaire, permanent).
-- Additif et nullable → 100 % rétro-compatible (les dossiers existants restent actifs).
alter table public.dossiers add column if not exists archived_at timestamptz;

-- Index partiel : retrouver vite les dossiers archivés d'une org (vue Archives).
create index if not exists dossiers_archived_idx
  on public.dossiers (org_id)
  where archived_at is not null;
