-- 0011_pro_settings_profile.sql — Infos professionnelles (organisation) : entreprise, poste, pays
-- Champs texte affichés en tête de l'onglet « Informations professionnelles » du profil.
-- Portés par l'enregistrement orgBranding ('org:{orgId}') de pro_settings (partagés par l'équipe).

alter table public.pro_settings add column if not exists entreprise text;
alter table public.pro_settings add column if not exists poste text;
alter table public.pro_settings add column if not exists pays text;
