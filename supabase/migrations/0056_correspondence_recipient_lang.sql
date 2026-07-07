-- 0056_correspondence_recipient_lang.sql — Langue du DESTINATAIRE d'une correspondance (Slice 1b).
--
-- Contexte : la relance automatique (LOT 10, cron `lifecycle-reminders`) adresse la T1 au
-- destinataire de la dernière correspondance active. Slice 1a figeait la langue à la langue
-- OFFICIELLE du pays (`officialLang`). Slice 1b la rend CHOISIE à l'envoi (sélecteur `ShareDialog`,
-- défaut = langue du pays) et RÉVISABLE depuis la page « Relances » — persistée ici.
--
-- Modèle : colonne NULLABLE. `null` = « pas de préférence explicite » → le cron retombe sur la
-- langue officielle du pays (comportement Slice 1a EXACT). Aucune rétro-remplissage nécessaire :
-- les correspondances antérieures gardent `null` et donc le même comportement qu'aujourd'hui.
-- L'app ne parle que FR/EN (Guinée-Bissau lusophone → repli FR côté dérivation) → CHECK borné.

alter table public.correspondences
  add column if not exists recipient_lang text
    check (recipient_lang is null or recipient_lang in ('fr', 'en'));

comment on column public.correspondences.recipient_lang is
  'Langue de la relance au destinataire (fr|en) ; null = langue officielle du pays (défaut cron).';
