-- 0062 — Type d'organisation sur les leads démo (recette CEO 2026-07-17).
--
-- Le formulaire landing collecte désormais le type d'organisation AVANT le nom de
-- l'entreprise : Laboratoire pharmaceutique / Agence de marketing / Cabinet d'expert RA /
-- Représentant local / Autre (précision alors obligatoire, colonne dédiée pour garder des
-- catégories requêtables). L'enum est appliqué par l'Edge `demo-request` (liste synchronisée
-- avec le <select>) — pas de CHECK d'énumération en base pour ne pas coupler une évolution
-- marketing à une migration.

alter table public.demo_requests
  add column org_type text not null check (char_length(org_type) between 1 and 60),
  add column org_type_other text check (org_type_other is null or char_length(org_type_other) <= 120);
