-- 0016_explicit_grants.sql — Privilèges de schéma rendus EXPLICITES (R1).
--
-- La stack locale (CI pgTAP) a cessé d'hériter des privilèges par défaut de la plateforme avec
-- une mise à jour de l'image Postgres : `set role authenticated` + SELECT échouait en
-- « permission denied » AVANT même l'évaluation RLS. En prod ces grants existent déjà (no-op).
--
-- Modèle de sécurité inchangé : les GRANTs ouvrent l'accès au niveau SQL, la **RLS reste la
-- barrière** (deny par défaut, policies par tenant — prouvées par pgTAP). Les fonctions ne sont
-- volontairement PAS couvertes ici : leurs privilèges sont gérés explicitement à leur création
-- (ex. create_org : revoke public/anon, grant authenticated — 0002/0015).

grant usage on schema public to anon, authenticated, service_role;

grant all on all tables in schema public to anon, authenticated, service_role;
grant all on all sequences in schema public to anon, authenticated, service_role;

alter default privileges in schema public
  grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on sequences to anon, authenticated, service_role;
