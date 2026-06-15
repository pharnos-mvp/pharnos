-- 0024_plan_tier_team.sql — Jalon O : ajoute le palier 'team' à l'enum plan_tier.
-- ISOLÉ dans sa propre migration : un ALTER TYPE ADD VALUE ne peut pas être UTILISÉ dans la même
-- transaction que son ajout. La 0025 (qui seed/insère 'team') suit dans une transaction séparée.
alter type public.plan_tier add value if not exists 'team' before 'business';
