-- 0067 — Normalise `documents.category` d'après le TYPE de pièce (source de vérité).
--
-- Contexte : le COA a été reclassé en pièce ADMINISTRATIVE (#252) ; les COA déposés AVANT ont gardé
-- `category = 'info'` en base. Résultat visible (retour CEO) : « COA (Certificat d'analyse) »
-- apparaissait sous « Documents d'information » sur la fiche produit. Le type ne ment pas, le
-- `category` stocké peut dériver → on le réaligne une bonne fois.
--
-- L'UI classe désormais par type canonique (`categoryForDocType`), donc l'affichage est déjà juste ;
-- cette migration répare la DONNÉE pour tous les autres consommateurs et pour l'avenir.
--
-- `updated_at = now()` : INDISPENSABLE — la synchro pull est incrémentale sur `updated_at`. Sans ce
-- bump, les clients hors-ligne garderaient indéfiniment l'ancienne catégorie en cache local
-- (même piège que 0060). Idempotent : les lignes déjà correctes ne sont pas touchées.

update public.documents
set category = 'admin', updated_at = now()
where deleted_at is null
  and doc_type in ('amm', 'gmp', 'copp', 'fsc', 'ml', 'contract', 'coa', 'other_admin')
  and category is distinct from 'admin';

update public.documents
set category = 'info', updated_at = now()
where deleted_at is null
  and doc_type in ('rcp', 'notice', 'labeling', 'artwork', 'other_info')
  and category is distinct from 'info';
