-- 0069 — Documents rattachés à une ORGANISATION (fiche d'ajout org, sessions II/III — décision CEO).
--
-- Jusqu'ici un document appartenait toujours à un PRODUIT (`product_id`). Les organisations créées
-- directement (MAH, fabricant, agence locale) portent désormais leurs propres documents (pièces
-- admin, docs d'information) : `party_id` — un document est SOIT produit-scopé SOIT org-scopé.
-- `product_id` était déjà nullable (0002). RLS documents inchangée (org-scoped) ; Storage : le
-- chemin `<org_id>/party/<party_id>/…` passe la policy existante (foldername[1] = org_id).

alter table public.documents
  add column if not exists party_id uuid references public.parties (id) on delete cascade;
create index if not exists documents_party_idx on public.documents (party_id);
