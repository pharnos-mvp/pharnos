-- 0013_pro_settings_signataire.sql — Signataire (nom et prénom) du bloc signature des lettres.
-- Porté par l'enregistrement orgBranding ('org:{orgId}') de pro_settings (comme entreprise/poste/pays).

alter table public.pro_settings add column if not exists signataire text;
