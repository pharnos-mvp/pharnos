-- 0083 — La commande payée, et le travail qu'elle déclenche (PLAN-UPGRADE-PROD §2.4).
--
-- Trois tables, une seule idée : **la commande naît du SERVEUR, jamais du navigateur.**
-- Aujourd'hui `landing/modele.js` traite `?paiement=ok` comme une preuve de règlement. C'est sans
-- effet tant que la confirmation n'ouvre qu'un `mailto:` — mais le jour où elle déclenche le
-- moteur, c'est le moteur offert au prix d'un paramètre d'URL. Ces tables sont écrites par le
-- webhook re-vérifié (`chariow-pulse`), et par lui seul.
--
-- ⚠️ RLS ACTIVÉE SANS AUCUNE POLICY sur les trois — même posture que `demo_requests` (0061) et
-- `checking_leads` (0081). Aucun rôle client ne lit ni ne forge une commande : tout passe par des
-- Edge Functions en service-role qui authentifient par le JETON DE LIVRAISON. Un acheteur n'a pas
-- de compte, donc pas d'org, donc rien à quoi rattacher une policy — la seule autorisation qui
-- existe ici est la possession du jeton.

-- ─────────────────────────────────────── orders ────────────────────────────────────────────────
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),

  -- La référence tirée par le navigateur AVANT le paiement, relayée par Chariow dans
  -- `custom_metadata.ref`. Elle ne prouve RIEN à elle seule : elle sert au pont (`order-claim`) à
  -- retrouver la commande que le webhook vient de créer. `unique` empêche deux commandes de
  -- revendiquer la même référence.
  ref uuid not null unique,

  -- Idempotence des rejeux Pulse. Chariow rejoue 5 fois (1 min → 24 h) et ses Pulses ne portent
  -- AUCUN secret de signature (vérifié en console) : c'est cette contrainte, et la re-vérification
  -- par `GET /v1/sales/{id}`, qui tiennent lieu d'authenticité. Un rejeu ne crée rien.
  chariow_sale_id text not null unique check (char_length(chariow_sale_id) between 1 and 120),

  offre text not null check (offre in ('up1', 'up3')),

  -- Montant TEL QUE CHARIOW L'A ENCAISSÉ, en plus petite unité. Recopié pour la trace comptable,
  -- jamais pour décider quoi que ce soit : le droit au service vient de l'existence de la ligne.
  amount_minor int check (amount_minor is null or amount_minor >= 0),
  currency text check (currency is null or char_length(currency) between 3 and 8),

  -- Commande de RECETTE (`custom_metadata.essai = '1'`, offres à 570/575 F CFA). Elle exécute la
  -- chaîne COMPLÈTE — c'est tout l'intérêt — mais doit rester reconnaissable dans les statistiques
  -- de vente et dans les coûts IA, sans quoi une journée de recette passerait pour du chiffre.
  essai boolean not null default false,

  email text not null check (char_length(email) between 3 and 254),
  first_name text check (first_name is null or char_length(first_name) <= 120),
  last_name text check (last_name is null or char_length(last_name) <= 120),

  -- Langue de l'acheteur, relayée par `custom_metadata.lang`. Le webhook n'a AUCUN autre moyen de
  -- la connaître : il ne voit ni la page d'origine ni l'en-tête `Accept-Language`. Elle commande
  -- les deux e-mails et, plus tard, la langue du rapport.
  lang text not null default 'fr' check (lang in ('fr', 'en')),

  country text check (country is null or char_length(country) <= 8),
  activity text check (activity is null or char_length(activity) <= 40),
  doc_type text check (doc_type is null or char_length(doc_type) <= 40),

  -- Fin de validité du lien de livraison (§2.3, étape 10). Les jetons vivent dans `order_tokens`.
  delivery_expires_at timestamptz not null,

  -- Dépôts consommés : un refus de recevabilité ne consomme AUCUN crédit, mais il ne doit pas non
  -- plus ouvrir un téléversement infini. La borne est ici, dans la donnée, pas seulement dans
  -- l'écran qui la présente.
  deposits_used smallint not null default 0 check (deposits_used between 0 and 3),

  status text not null default 'paid' check (
    status in ('paid', 'source_uploaded', 'gated_out', 'running', 'done', 'failed')
  ),

  -- Trace du premier e-mail (« commande enregistrée »). `null` = jamais envoyé : c'est ce qui rend
  -- un renvoi sûr et vérifiable, plutôt que deviné depuis `created_at`.
  notified_at timestamptz,
  delivered_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Le pont interroge par `ref` en boucle courte, le temps que le webhook arrive : c'est l'index le
-- plus chaud de la table.
create index if not exists orders_ref_idx on public.orders (ref);
-- Purge à 30 jours du document source (§2.6) et relance des commandes restées en carafe.
create index if not exists orders_status_created_idx on public.orders (status, created_at desc);

alter table public.orders enable row level security;

-- ───────────────────────────────────── order_tokens ────────────────────────────────────────────
-- Les jetons de livraison d'une commande. **PLUSIEURS par commande, et c'est le point.**
--
-- ⚠️ Le plan posait un `orders.delivery_token_hash` unique. Ce modèle ne peut pas marcher, et le
-- défaut n'apparaît qu'en écrivant le pont : `order-claim` doit REMETTRE un jeton à l'acheteur qui
-- revient du paiement, or on ne remonte pas un SHA-256. Les trois issues étaient :
--   • rendre le jeton en clair depuis la base → une fuite en lecture livrerait tous les dossiers ;
--   • faire tourner le jeton à chaque revendication → invalide le lien DÉJÀ envoyé par e-mail ;
--   • en émettre PLUSIEURS, chacun haché. C'est celle-ci.
--
-- L'e-mail n°1 en porte un, le pont en frappe un autre, les deux fonctionnent, aucun n'est
-- stockable en clair. Le hash est la CLÉ PRIMAIRE : la recherche par jeton est un accès index à
-- une ligne — ce qui compte, puisque `order-status` est interrogé toutes les 2 s pendant toute la
-- génération.
create table if not exists public.order_tokens (
  -- SHA-256 hexadécimal du jeton (64 caractères), PAS un PBKDF2 : un PBKDF2 porte un sel par
  -- ligne, donc retrouver la commande depuis son jeton exigerait de re-dériver le hash pour
  -- CHAQUE ligne. Le PBKDF2 protège les secrets à faible entropie ; celui-ci en porte 256 bits
  -- tirés par le générateur du système. Même choix, même raison, que `_shared/share-auth.ts`.
  token_hash text primary key check (char_length(token_hash) = 64),
  order_id uuid not null references public.orders (id) on delete cascade,
  -- Recopiée depuis la commande à l'émission : la vérification d'expiration se fait alors sur la
  -- LIGNE trouvée, sans seconde lecture.
  expires_at timestamptz not null,
  -- D'où vient ce jeton. `email` = e-mail n°1 · `claim` = pont au retour de paiement. Sert au
  -- diagnostic (« l'acheteur est-il passé par le lien ou par la redirection ? »), jamais au droit.
  source text not null check (source in ('email', 'claim')),
  created_at timestamptz not null default now()
);

create index if not exists order_tokens_order_idx on public.order_tokens (order_id);

alter table public.order_tokens enable row level security;

-- ───────────────────────────────────── upgrade_jobs ────────────────────────────────────────────
-- Un DOCUMENT à traiter. Une commande `up1` en porte un, une `up3` en porte trois — la mécanique
-- est identique, c'est pourquoi la table existe séparément dès maintenant même si `up3` n'est pas
-- ouvert (PLAN-UPGRADE-PROD §4).
create table if not exists public.upgrade_jobs (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,

  doc_type text not null check (char_length(doc_type) between 1 and 40),
  -- Chemin Storage du document déposé. ⚠️ ASCII uniquement (`storageObjectKey()`) : Supabase
  -- refuse les clés accentuées, et un nom de fichier client en porte très souvent.
  source_path text check (source_path is null or char_length(source_path) <= 400),
  -- Provenance de la lecture : décidée par `prepareUpgradeSource` dans le navigateur, jamais
  -- devinée ici. Elle commande la tolérance du contrôle d'ancrage ET l'encart du rapport.
  source_kind text check (source_kind is null or source_kind in ('text', 'ocr')),

  phase text not null default 'conformity' check (
    phase in ('conformity', 'translation', 'report', 'done')
  ),
  sections_total smallint not null default 0 check (sections_total >= 0),
  sections_done smallint not null default 0 check (sections_done >= 0),

  started_at timestamptz,
  finished_at timestamptz,
  error text check (error is null or char_length(error) <= 2000),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists upgrade_jobs_order_idx on public.upgrade_jobs (order_id);
-- L'ÉQUITÉ du tick se lit ici : les jobs sont servis du plus ancien au plus récent, pour qu'une
-- grosse commande ne fasse pas attendre indéfiniment une petite (§2.6).
create index if not exists upgrade_jobs_pending_idx on public.upgrade_jobs (phase, created_at)
  where phase <> 'done';

alter table public.upgrade_jobs enable row level security;

-- ─────────────────────────────────── upgrade_sections ──────────────────────────────────────────
-- UNE ligne = UN appel au modèle. C'est l'unité de reprise, et elle est délibérément fine : le
-- premier run du banc a perdu 59 appels PAYÉS sur un dépassement en passe 3, faute d'un état
-- écrit à la granularité de la DÉPENSE.
--
-- ⚠️ La passe de REVUE occupe QUATRE lignes, pas une : depuis son découpage, `section_id` y vaut
-- le nom du tableau (`terminology`, `relocations`, `findings`, `recommendations`) et chacun est
-- rejouable seul. Rejouer la revue entière pour un seul tableau expiré repaierait les trois autres.
create table if not exists public.upgrade_sections (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.upgrade_jobs (id) on delete cascade,

  section_id text not null check (char_length(section_id) between 1 and 60),
  phase text not null check (phase in ('conformity', 'translation', 'report')),

  status text not null default 'queued' check (
    status in ('queued', 'running', 'done', 'failed')
  ),
  -- Borne les reprises. ⚠️ Rappel de l'invariant moteur : **un timeout ne se rejoue JAMAIS** —
  -- sous le mur de 150 s une seconde tentative ne peut pas aboutir. Seules les erreurs non
  -- déterministes ouvrent une seconde chance.
  attempts smallint not null default 0 check (attempts between 0 and 3),

  content jsonb,
  verdict text check (verdict is null or char_length(verdict) <= 40),
  evidence jsonb,
  tokens jsonb,
  error text check (error is null or char_length(error) <= 2000),

  -- Posé par le tick au moment du `select … for update skip locked`. Sert au FILET `pg_cron` :
  -- un job qui a des rubriques `running` mais aucune réclamation fraîche depuis 60 s est relancé.
  claimed_at timestamptz,
  finished_at timestamptz,

  created_at timestamptz not null default now(),

  unique (job_id, phase, section_id)
);

-- La réclamation du tick : « les `queued` de cette phase, les plus anciennes d'abord ».
create index if not exists upgrade_sections_claim_idx
  on public.upgrade_sections (job_id, phase, status, created_at)
  where status = 'queued';
-- Le filet : retrouver les réclamations mortes sans balayer la table.
create index if not exists upgrade_sections_running_idx
  on public.upgrade_sections (claimed_at)
  where status = 'running';

alter table public.upgrade_sections enable row level security;

-- ──────────────────────────────────── Horodatage ───────────────────────────────────────────────
-- `updated_at` posé par la BASE, jamais par l'appelant : un worker qui oublie de le mettre à jour
-- rendrait le filet `pg_cron` aveugle exactement quand il sert.
-- `search_path` FIGÉ : sans lui, un schéma placé en tête du chemin par un appelant pourrait
-- détourner la résolution des noms à l'intérieur de la fonction. C'est aussi ce que l'advisor
-- Supabase signale (`function_search_path_mutable`) — on le pose à l'écriture, pas après coup.
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists orders_touch_updated_at on public.orders;
create trigger orders_touch_updated_at
  before update on public.orders
  for each row execute function public.touch_updated_at();

drop trigger if exists upgrade_jobs_touch_updated_at on public.upgrade_jobs;
create trigger upgrade_jobs_touch_updated_at
  before update on public.upgrade_jobs
  for each row execute function public.touch_updated_at();
