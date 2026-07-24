-- 0068 — Nouveau rôle de partie : `agent` (agence réglementaire locale / représentant / consultant).
--
-- Décision CEO 2026-07-24 : les organisations gagnent un 3ᵉ type créable directement depuis la
-- page Organisations (bouton ＋) — « Agence réglementaire » : le prestataire/représentant local qui
-- dépose et suit des dossiers pour le compte d'un MAH. Appelé surtout à l'envoi de correspondance
-- (liste au choix ou création directe — branchement à venir).
--
-- Additif pur : on élargit seulement la CHECK des rôles (cumulables), aucune donnée existante
-- n'est touchée. RLS inchangée (org-scoped).

alter table public.parties drop constraint parties_roles_check;
alter table public.parties add constraint parties_roles_check
  check (roles <@ array['titulaire', 'fabricant', 'distributeur', 'agent']::text[]);
