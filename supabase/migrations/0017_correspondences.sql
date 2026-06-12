-- 0017_correspondences.sql — Module Correspondance (jalon H) : envoi du Module 1 compilé à un
-- correspondant externe (agence locale de représentation), review publique par lien tokenisé,
-- fil de discussion labo ⇄ reviewer.
--
-- Modèle de sécurité (ADR-0003) :
--   • Le reviewer N'A PAS de compte : AUCUNE policy anon — tout accès public passe par
--     l'Edge Function `share` (service-role) qui valide le token (SHA-256) et le mot de passe
--     (PBKDF2) AVANT toute lecture/écriture. RLS reste hermétique.
--   • `token_hash` = SHA-256 du token 256 bits — le token en clair n'est JAMAIS stocké côté
--     serveur (le lien ne vit que chez l'expéditeur). Lookup par index unique.
--   • Le statut de décision vit ICI (`correspondences.status`, écrit par l'Edge). L'Edge ne
--     touche JAMAIS `dossiers` : l'état affiché du dossier est DÉRIVÉ côté client de la
--     dernière correspondance → zéro conflit avec la sync offline-first des dossiers.

create table if not exists public.correspondences (
  id uuid primary key,
  org_id uuid not null references public.orgs (id) on delete cascade,
  -- pas de FK sur dossier_id : évite les problèmes d'ordre de synchro (pattern 0003/0005)
  dossier_id uuid not null,
  -- Dénormalisés pour la page publique (une seule lecture service-role, pas de jointures org).
  product_name text not null,
  country text not null,
  activity text not null,
  sender_email text not null,
  recipient_email text not null,
  note text,
  -- PDF compilé du Module 1 dans le bucket privé `documents` ({orgId}/shares/{id}/…).
  pdf_path text not null,
  pdf_size bigint not null default 0,
  -- SHA-256 hex du token de partage (jamais le token en clair).
  token_hash text not null,
  -- 'pbkdf2$<iter>$<salt b64url>$<hash b64url>' ; null = lien libre (sans mot de passe).
  password_hash text,
  status text not null default 'in_review'
    check (status in ('in_review', 'accepted', 'suspended', 'rejected')),
  decided_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create unique index if not exists correspondences_token_hash_idx
  on public.correspondences (token_hash);
create index if not exists correspondences_org_idx on public.correspondences (org_id, updated_at);
create index if not exists correspondences_dossier_idx on public.correspondences (dossier_id);

alter table public.correspondences enable row level security;

-- Membres de l'org : gestion complète de LEURS correspondances (création à l'envoi, révocation…).
drop policy if exists correspondences_all on public.correspondences;
create policy correspondences_all on public.correspondences
  for all using (org_id in (select public.current_user_org_ids()))
  with check (org_id in (select public.current_user_org_ids()));

-- Fil de discussion — APPEND-ONLY (ALCOA) : insert + select, jamais d'update/delete via l'API.
create table if not exists public.correspondence_messages (
  id uuid primary key,
  org_id uuid not null references public.orgs (id) on delete cascade,
  correspondence_id uuid not null references public.correspondences (id) on delete cascade,
  -- 'sender' = labo (membre org authentifié) ; 'recipient' = reviewer externe (via Edge).
  author text not null check (author in ('sender', 'recipient')),
  -- Libellé affiché (e-mail) — figé à l'écriture.
  author_label text not null,
  -- 'note' (message d'envoi) | 'decision' (Accepter/Suspendre/Rejeter) | 'comment' (chat).
  kind text not null default 'comment' check (kind in ('note', 'decision', 'comment')),
  decision text check (decision in ('accepted', 'suspended', 'rejected')),
  body text not null default '',
  -- Pièces jointes [{path,name,size,mime}] — chemins Storage contrôlés par l'app/l'Edge.
  attachments jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists correspondence_messages_org_idx
  on public.correspondence_messages (org_id, created_at);
create index if not exists correspondence_messages_corr_idx
  on public.correspondence_messages (correspondence_id, created_at);

alter table public.correspondence_messages enable row level security;

-- Lecture : membres de l'org. Écriture : membres de l'org, UNIQUEMENT en tant que 'sender'
-- (les messages 'recipient' n'arrivent que par l'Edge service-role). Pas de policy
-- UPDATE/DELETE → append-only pour l'API authentifiée.
drop policy if exists correspondence_messages_select on public.correspondence_messages;
create policy correspondence_messages_select on public.correspondence_messages
  for select using (org_id in (select public.current_user_org_ids()));

drop policy if exists correspondence_messages_insert on public.correspondence_messages;
create policy correspondence_messages_insert on public.correspondence_messages
  for insert with check (
    org_id in (select public.current_user_org_ids()) and author = 'sender'
  );

-- Temps réel (accélérateur UX — la sync pull reste la source de vérité) : INSERTs du fil
-- poussés aux clients de l'org via Realtime (RLS respectée par les canaux postgres_changes).
do $$
begin
  alter publication supabase_realtime add table public.correspondence_messages;
exception
  when duplicate_object then null; -- déjà publiée (replay)
  when undefined_object then null; -- publication absente (stack locale minimale)
end $$;

-- Anti-abus de la surface publique (brute-force token/mot de passe, scraping) : compteurs par
-- fenêtre fixe. AUCUNE policy → invisible pour anon/authenticated ; seul le service-role
-- (Edge `share`) y accède, via la fonction dédiée ci-dessous.
create table if not exists public.share_hits (
  bucket text not null,
  window_start timestamptz not null,
  hits int not null default 1,
  primary key (bucket, window_start)
);
-- La purge opportuniste filtre sur window_start seul (pas un préfixe de la PK) : index dédié
-- pour que le DELETE du chemin chaud public ne séquence-scanne jamais.
create index if not exists share_hits_window_idx on public.share_hits (window_start);

alter table public.share_hits enable row level security;

-- Incrémente et renvoie le compteur de la fenêtre courante pour `p_bucket`
-- (ex. 'ip:1.2.3.4' ou 'pwd:<token_hash>'). Purge opportuniste des fenêtres > 24 h.
create or replace function public.share_hit(p_bucket text, p_window_seconds int)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_window timestamptz;
  v_hits int;
begin
  v_window := to_timestamp(
    floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds
  );
  insert into share_hits (bucket, window_start, hits)
  values (p_bucket, v_window, 1)
  on conflict (bucket, window_start) do update set hits = share_hits.hits + 1
  returning hits into v_hits;

  -- Purge opportuniste (table minuscule : un delete indexé par PK, pas de cron à gérer).
  delete from share_hits where window_start < now() - interval '24 hours';

  return v_hits;
end;
$$;

revoke all on function public.share_hit(text, int) from public, anon, authenticated;
grant execute on function public.share_hit(text, int) to service_role;
