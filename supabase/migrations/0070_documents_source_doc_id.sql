-- 0070 — Provenance « piochée depuis la base » (PLAN-ORG-REFERENTIEL §2).
--
-- Piocher une pièce de la base documentaire d'une ORGANISATION (MAH/fabricant) vers un produit crée
-- une COPIE LIÉE : nouveau document produit-scopé (blob copié, métadonnées héritées) + `source_doc_id`
-- pointant le document org-scopé d'origine. Le dossier reste une photographie opposable (la source
-- peut évoluer sans muter le produit) ; la provenance ouvre l'affordance future « une version plus
-- récente existe dans la base ». ON DELETE SET NULL : supprimer la source n'orpheline jamais la copie.
-- Même pattern que generated_docs.source_doc_id (0014). Additif, aucun backfill.

alter table public.documents
  add column if not exists source_doc_id uuid references public.documents (id) on delete set null;

-- Index FK : sans lui, chaque suppression de document ferait un seq scan (action SET NULL) et la
-- future recherche « copies de cette source » aussi.
create index if not exists documents_source_doc_idx on public.documents (source_doc_id);
