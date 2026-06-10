-- 0014_generated_docs_source_doc_id.sql — Traduction d'une pièce stockée comme document généré (M5).
-- Lien optionnel vers le document produit source. La traduction ne remplace pas l'original ;
-- elle est propre au dossier (conformité face au pays cible). RLS inchangée (policy org-scoped existante).

alter table public.generated_docs
  add column if not exists source_doc_id text;
