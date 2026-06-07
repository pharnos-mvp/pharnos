-- 0010_dossier_excluded_docs.sql — Exclusion de documents produit par dossier (CTD workspace)
-- Retirer un document produit du workspace l'exclut du dossier sans le supprimer du catalogue.

alter table public.dossiers
  add column if not exists excluded_doc_ids jsonb not null default '[]'::jsonb;
