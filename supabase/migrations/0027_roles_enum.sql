-- 0027_roles_enum.sql — Recette CEO #2 : 3 nouveaux rôles d'organisation.
--   agence_locale          = filiale locale (ex. « Denk Pharma Benin »)
--   agence_representation   = entreprise locale qui gère les soumissions
--   expert_ra               = expert RA individuel
-- Les TROIS peuvent gérer les soumissions (correspondance) ET éditer le contenu (comme Éditeur).
--
-- ⚠️ Postgres : un `ADD VALUE` ne peut pas être UTILISÉ dans la même transaction que son ajout.
-- On l'isole donc dans CE fichier (committé seul) ; les fonctions/policies qui s'en servent sont
-- dans 0028 (et y comparent en ::text par sécurité supplémentaire).
alter type public.org_role add value if not exists 'agence_locale';
alter type public.org_role add value if not exists 'agence_representation';
alter type public.org_role add value if not exists 'expert_ra';
