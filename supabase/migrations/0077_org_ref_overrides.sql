-- 0077 — Adaptations LOCALES du référentiel par organisation (P4.3, PLAN-ORG-REFERENTIEL §6).
--
-- Deuxième moitié de la promesse du briefing SaaS : « la donnée officielle SE PROPOSE, la donnée
-- locale SE RESPECTE ». 0071 publie le contenu, 0072 le fait consentir, 0073/0074 l'épinglent —
-- ici l'org adapte ce qui lui est propre, et une publication ultérieure NE L'ÉCRASE JAMAIS.
--
-- Décision CEO 2026-07-24 (c) : adaptables v1 = **contacts / destinataire / adresse + notes
-- internes**. Les **MONTANTS OFFICIELS NE SONT PAS ADAPTABLES** — un barème est opposable, il se
-- cite (provenance) et se publie, il ne se bricole pas par client. Cette frontière est donc gravée
-- ici en CONTRAINTE : l'UI peut mentir, la base non (`org_ref_overrides_path_chk`).
--
-- Table TENANT ÉCRIVABLE PAR LE CLIENT (contrairement à `org_ref_adoptions`, écrite par RPC) :
-- l'app est offline-first et l'outbox pousse en `upsert` PostgREST. Les gardes sont donc :
--   1) RLS écriture = **admin d'org** (même décision que l'adoption : c'est de la configuration
--      opposable, pas de la saisie opérationnelle) ;
--   2) whitelist de `field_path` en CHECK (défense en profondeur : un POST direct ne peut pas
--      inventer un chemin, ni toucher un montant) ;
--   3) trigger d'estampille : `updated_by`/`updated_by_email`/`updated_at` sont posés PAR LE
--      SERVEUR — un client hors ligne ne peut pas signer une adaptation au nom d'un autre.
--
-- Extension future (P4.5 `ctd_structure`) : `value` est du jsonb (toute forme future passe) et
-- `field_path` est du texte libre BORNÉ par le CHECK — élargir la whitelist est un acte
-- délibéré (une migration), jamais un effet de bord.

create table if not exists public.org_ref_overrides (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id) on delete cascade,
  country text not null,
  field_path text not null,
  -- Valeur locale. jsonb : une chaîne pour un contact, un objet {fr,en} pour une note, une forme
  -- plus riche demain (nœuds CTD) — sans migration de type.
  value jsonb not null,
  updated_by uuid references auth.users (id) on delete set null,
  updated_by_email text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Une seule adaptation par (org, pays, champ) : l'outbox rejoue en upsert, jamais en doublon.
  unique (org_id, country, field_path),
  constraint org_ref_overrides_country_chk check (country ~ '^[A-Z]{2}$'),
  -- Une note interne reste une note : bornée, sinon 10 Mo se répliquent dans l'IndexedDB de tous
  -- les membres de l'org et se rendent dans la fiche.
  constraint org_ref_overrides_size_chk check (pg_column_size(value) < 8192)
);

-- ── LA frontière produit, en contrainte ───────────────────────────────────────────────────────
-- Adaptables : le DESTINATAIRE (qui signe, comment on l'appelle), les COORDONNÉES, et une NOTE
-- INTERNE par pays. JAMAIS : `agency.name`/`agency.full` (l'identité officielle de l'agence),
-- ni aucun montant/délai/échantillon (contenu opposable, publié et sourcé).
alter table public.org_ref_overrides drop constraint if exists org_ref_overrides_path_chk;
alter table public.org_ref_overrides add constraint org_ref_overrides_path_chk check (
  field_path in (
    'agency.directeur',
    'agency.sexe',
    'agency.adresse',
    'agency.telephone',
    'agency.email',
    'notes.internal'
  )
);

alter table public.org_ref_overrides enable row level security;

-- Lecture : membres de l'org (le résolveur en a besoin pour toute la couche suivi).
drop policy if exists org_ref_overrides_select on public.org_ref_overrides;
create policy org_ref_overrides_select on public.org_ref_overrides
  for select to authenticated
  using (org_id in (select public.current_user_org_ids()));

-- Écriture : ADMIN d'org seul (insert/update/delete). Un éditeur ne redéfinit pas le destinataire
-- officiel des courriers de l'organisation.
drop policy if exists org_ref_overrides_insert on public.org_ref_overrides;
create policy org_ref_overrides_insert on public.org_ref_overrides
  for insert to authenticated
  with check (public.is_org_admin(org_id));

drop policy if exists org_ref_overrides_update on public.org_ref_overrides;
create policy org_ref_overrides_update on public.org_ref_overrides
  for update to authenticated
  using (public.is_org_admin(org_id))
  with check (public.is_org_admin(org_id));

drop policy if exists org_ref_overrides_delete on public.org_ref_overrides;
create policy org_ref_overrides_delete on public.org_ref_overrides
  for delete to authenticated
  using (public.is_org_admin(org_id));

-- CS1 (0048) fail-safe, calqué sur 0072 : un membre SCOPÉ (agence invitée sur des dossiers
-- précis) ne lit ni n'écrit la configuration de l'org. Sans override lisible, son résolveur
-- retombe sur le contenu officiel — dégradation propre, aucun blocage.
drop policy if exists cs1_org_ref_overrides_all on public.org_ref_overrides;
create policy cs1_org_ref_overrides_all on public.org_ref_overrides
  as restrictive for all to authenticated
  using (org_id in (select public.current_user_unscoped_org_ids()));

-- ── Estampille SERVEUR : qui a adapté, et quand ───────────────────────────────────────────────
-- Le client (hors ligne compris) n'écrit PAS ces trois colonnes : elles sont la trace de
-- responsabilité de l'adaptation (« votre valeur, posée par X le J »), affichée dans la fiche
-- Autorité et dans le signalement de conflit à l'adoption d'une nouvelle version.
create or replace function public.stamp_ref_override()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
begin
  select email into v_email from auth.users where id = auth.uid();
  new.updated_by := auth.uid();
  new.updated_by_email := coalesce(v_email, '');
  new.updated_at := now();
  if tg_op = 'INSERT' then
    new.created_at := now();
  else
    new.created_at := old.created_at; -- immuable : la date de PREMIÈRE adaptation
  end if;
  return new;
end;
$$;

-- Durcissement 0031 (advisors Supabase 0028/0029), comme `enforce_dossier_ref_version` en 0074 :
-- une fonction `security definer` ne garde pas l'EXECUTE public.
revoke all on function public.stamp_ref_override() from public, anon, authenticated;

drop trigger if exists org_ref_overrides_stamp on public.org_ref_overrides;
create trigger org_ref_overrides_stamp
  before insert or update on public.org_ref_overrides
  for each row execute function public.stamp_ref_override();

-- Le pull incrémental filtre sur (org_id, updated_at) — l'unique porte déjà org_id en tête, mais
-- pas `updated_at` : cet index sert la requête réelle du client.
create index if not exists org_ref_overrides_pull_idx
  on public.org_ref_overrides (org_id, updated_at);
