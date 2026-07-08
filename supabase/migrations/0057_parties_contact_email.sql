-- 0057_parties_contact_email.sql — E-mail de contact d'une organisation (`parties`), Slice 2a.
--
-- Prérequis de la relance FABRICANT (domaine B du monitoring, MAH ↔ fabricant) : la relance auto
-- des pièces admin qui expirent doit être adressée à un contact. Aujourd'hui `parties` ne porte
-- AUCUN contact → cette colonne le capture (renseignée depuis la fiche Organisation, cockpit RA).
--
-- ADDITIF & non destructif : colonne NULLABLE, bornée en longueur (défense en profondeur contre un
-- écrivain direct de l'API — le format e-mail est validé côté client + par le moteur d'envoi avant
-- tout envoi). `null`/absent = pas de contact → le moteur (Slice 2b) n'enverra rien pour ce fabricant.

alter table public.parties
  add column if not exists contact_email text
    check (contact_email is null or char_length(contact_email) <= 320);

comment on column public.parties.contact_email is
  'E-mail de contact de l''organisation (relance fabricant, domaine B) ; null = pas de relance envoyée.';
