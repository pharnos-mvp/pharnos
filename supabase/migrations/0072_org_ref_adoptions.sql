-- 0072 — Adoption du référentiel réglementaire PAR ORGANISATION (P4.2, PLAN-ORG-REFERENTIEL §6).
--
-- Le contenu est publié globalement (0071) mais ne s'applique à une org que lorsqu'elle l'ADOPTE :
-- c'est le consentement tracé du briefing SaaS (« la donnée officielle se propose »). Décision CEO
-- 2026-07-24 : **l'admin d'org seul adopte**, et l'adoption est journalisée (qui, quand, quoi).
--
-- Journal APPEND-ONLY : 1 ligne = 1 adoption. Aucune policy d'écriture côté client — l'unique
-- chemin est le RPC `adopt_ref_version` (security definer : vérifie l'admin, refuse un brouillon,
-- écrit l'audit dans la même transaction). Un client ne peut donc ni s'auto-adopter une version,
-- ni antidater, ni supprimer une trace.
--
-- Résolution côté client (`ref-content.ts`) : le PLAFOND = version adoptée la plus applicable ;
-- sans aucune adoption, plafond = version SOCLE (la plus ancienne publiée) → comportement
-- strictement inchangé pour les orgs existantes, et toute publication future exige un consentement.

create table if not exists public.org_ref_adoptions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id) on delete cascade,
  version_id uuid not null references public.ref_versions (id) on delete cascade,
  adopted_at timestamptz not null default now(),
  -- Qui a adopté : l'id peut être effacé (RGPD/suppression de compte), l'e-mail reste la trace
  -- lisible du journal (même parti pris que `audit_log.actor_email`).
  adopted_by uuid references auth.users (id) on delete set null,
  adopted_by_email text not null default '',
  -- Idempotence : ré-adopter la même version ne crée pas de doublon (bouton cliqué deux fois,
  -- deux onglets, rejeu réseau).
  unique (org_id, version_id)
);

-- Lecture « les adoptions de mon org » (pull client) : l'unique + org_id ne couvre pas l'ordre
-- des colonnes du prédicat, on indexe explicitement.
create index if not exists org_ref_adoptions_org_idx on public.org_ref_adoptions (org_id);

alter table public.org_ref_adoptions enable row level security;

-- Lecture : membres de l'org uniquement (donnée tenant). Aucune policy insert/update/delete :
-- écriture exclusivement par le RPC ci-dessous (le service role bypasse la RLS).
drop policy if exists org_ref_adoptions_select on public.org_ref_adoptions;
create policy org_ref_adoptions_select on public.org_ref_adoptions
  for select to authenticated
  using (org_id in (select public.current_user_org_ids()));

-- CS1 (0048) fail-safe : un membre SCOPÉ (agence invitée sur des dossiers précis) ne lit pas la
-- configuration de l'org. Sans adoption lisible, son résolveur retombe sur le socle — aucun
-- blocage fonctionnel (il n'a pas accès au catalogue ni à la création de dossier).
drop policy if exists cs1_org_ref_adoptions_all on public.org_ref_adoptions;
create policy cs1_org_ref_adoptions_all on public.org_ref_adoptions
  as restrictive for all to authenticated
  using (org_id in (select public.current_user_unscoped_org_ids()));

-- ── RPC d'adoption : admin d'org seul, version PUBLIÉE seule, audit dans la même transaction ──
create or replace function public.adopt_ref_version(p_version uuid, p_org uuid default null)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_org uuid := public.caller_org_id(p_org);
  v_email text;
  v_label text;
begin
  if v_org is null then
    raise exception 'no_org' using errcode = '42501';
  end if;
  -- Décision CEO : l'adoption engage l'organisation → réservée à l'Administrateur.
  if not public.is_org_admin(v_org) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  -- On n'adopte JAMAIS un brouillon ni une version archivée (le client filtre déjà, mais la
  -- garde doit être serveur : un POST direct sur le RPC ne doit pas pouvoir figer un brouillon).
  select label into v_label
  from public.ref_versions
  where id = p_version and status = 'published';
  if v_label is null then
    raise exception 'version_not_published' using errcode = '42501';
  end if;

  select email into v_email from auth.users where id = auth.uid();

  insert into public.org_ref_adoptions (org_id, version_id, adopted_by, adopted_by_email)
  values (v_org, p_version, auth.uid(), coalesce(v_email, ''))
  on conflict (org_id, version_id) do nothing;

  insert into public.audit_log (id, org_id, actor_id, actor_email, entity, entity_id, action, label)
  values (gen_random_uuid(), v_org, auth.uid()::text, coalesce(v_email, ''), 'ref_version',
          p_version::text, 'adopt', 'référentiel ' || v_label || ' adopté');
end;
$$;
revoke all on function public.adopt_ref_version(uuid, uuid) from public, anon;
grant execute on function public.adopt_ref_version(uuid, uuid) to authenticated;
