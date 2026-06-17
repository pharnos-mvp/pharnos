-- 0035_sync_composite_indexes.sql — Jalon N3 (scalabilité) : index composites (org_id, updated_at)
-- pour la SYNC incrémentale (pull offline-first).
--
-- Toutes les requêtes de pull suivent le MÊME accès (catalogue/sync.ts, documents-sync.ts,
-- dossier-sync.ts, generated-docs, dossier-attachments-sync.ts) :
--     WHERE org_id = $1 AND updated_at > $cursor ORDER BY updated_at ASC
-- Or ces 5 tables n'avaient qu'un index sur (org_id) → au volume, une grande org scannerait
-- TOUTES ses lignes puis trierait en mémoire (le filtre updated_at et le ORDER BY ne sont pas
-- couverts). Le composite (org_id, updated_at) transforme ça en **index range scan** depuis le
-- curseur, déjà trié → coût ∝ lignes RETOURNÉES, pas lignes de l'org.
--
-- `correspondences` (0017) et `audit_log` avaient déjà leur composite. Le single (org_id) devient
-- un **préfixe redondant** du composite (un B-tree (org_id, updated_at) sert aussi les filtres
-- RLS `org_id = …`) → on le remplace pour éviter la double écriture d'index. Création AVANT drop
-- dans la même transaction de migration → aucune fenêtre sans index sur org_id.

create index if not exists products_org_updated_idx on public.products (org_id, updated_at);
drop index if exists public.products_org_idx;

create index if not exists documents_org_updated_idx on public.documents (org_id, updated_at);
drop index if exists public.documents_org_idx;

create index if not exists dossiers_org_updated_idx on public.dossiers (org_id, updated_at);
drop index if exists public.dossiers_org_idx;

create index if not exists generated_docs_org_updated_idx on public.generated_docs (org_id, updated_at);
drop index if exists public.generated_docs_org_idx;

create index if not exists dossier_attachments_org_updated_idx on public.dossier_attachments (org_id, updated_at);
drop index if exists public.dossier_attachments_org_idx;
