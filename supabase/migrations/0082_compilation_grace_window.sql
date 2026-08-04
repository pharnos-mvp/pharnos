-- 0082_compilation_grace_window.sql — Le compteur de compilations dit la vérité.
--
-- Contexte : le CEO a tranché (2026-08-03) que les offres CTD Builder 49 € (3) et 249 € (20)
-- comptent des **COMPILATIONS**, alignées sur la plateforme (`docs/PLAN-CTD-BUILDER.md` §5.2.5) ;
-- le 490 €/an est illimité, donc sans compteur. Compter chaque clic n'est vivable QUE si corriger
-- une coquille et recompiler ne coûte rien : sur un pack de 3, trois allers-retours de relecture
-- épuisaient l'offre sans qu'un seul dossier soit déposé.
--
-- Trois correctifs validés au même audit, dont deux sont ici :
--   (a) **fenêtre de grâce de 24 h par dossier** — recompiler LE MÊME dossier ne consomme rien ;
--   (b) consommer le crédit APRÈS la fabrication (côté client, même livraison) ;
--   (c) commentaire honnête sur le hors-ligne (côté client).
--
-- Choix structurant : une gratuité n'est PAS un « non-enregistrement ». Chaque compilation entre au
-- registre ; trois colonnes disent ce qu'elle a coûté et pourquoi — `billable`, `free_reason`
-- (`recovery` | `grace`) et `content_sha256`. Le registre reste donc complet ET lisible : « je
-- récupère un paquet déjà payé » et « je corrige une coquille » ne se confondent pas, et trente
-- lignes portant trente empreintes distinctes ne sont pas trente corrections.
--
-- Reste une borne nécessaire : `p_dossier_id` vient du client, n'a pas de clé étrangère (un dossier
-- local-only n'existe pas côté serveur, migration 0039) et n'est donc pas vérifiable. Sans
-- **plafond de gratuités**, réémettre le même identifiant achèterait 24 h de compilations
-- illimitées pour un crédit. Le plafond ne rend pas la triche impossible — il la rend **bornée**,
-- ce qui est le maximum atteignable tant qu'on ne transmet pas les documents.

-- ── 1. Ligne facturable ou non ───────────────────────────────────────────────────────────────
-- Défaut `true` : l'historique existant reste facturé à l'identique, aucun quota ne se relâche
-- rétroactivement.
alter table public.compilations add column if not exists billable boolean not null default true;

comment on column public.compilations.billable is
  'false = compilation offerte (récupération d''un paquet déjà payé, ou fenêtre de grâce). Toujours enregistrée, jamais décomptée.';

-- ── 1 ter. L'empreinte du paquet — pour ne jamais faire payer deux fois la MÊME chose ────────
-- Règle du plan qu'on ne défait pas (§5.2.3) : « la licence ne garde jamais les données en otage —
-- on limite la CRÉATION, jamais la RÉCUPÉRATION ». Sans identité de contenu, fermer la sortie du
-- paquet (téléchargement, envoi) rendait un dossier payé la veille irrécupérable le lendemain :
-- la fenêtre de grâce avait expiré, et le client repayait pour retélécharger ce qu'il avait déjà.
--
-- Le SHA-256 des octets tranche, et c'est la SEULE chose qui le peut : mêmes octets = même paquet
-- = récupération, gratuite pour toujours ; octets différents = nouvelle compilation, facturée
-- (sauf grâce). C'est aussi ce qui redonne au registre son pouvoir de témoin : trente lignes sur
-- un dossier avec trente empreintes DISTINCTES, ce ne sont pas trente corrections.
--
-- ⚠️ **Elle est calculée par le client, donc forgeable** : rejouer une empreinte déjà facturée
-- donne des compilations gratuites, autant qu'on veut et sans expiration. Ce n'est pas un
-- affaiblissement — un client déterminé bloque déjà l'appel RPC lui-même, que le fail-open traite
-- comme un succès — mais il faut le dire net : **tout le métrage est honnête-client jusqu'aux bons
-- signés Ed25519 du lot licence** (§5.2.2). Ce fichier réduit la sur-facturation d'un client de
-- bonne foi ; il ne prétend pas résister à un client de mauvaise foi.
alter table public.compilations add column if not exists content_sha256 text;

comment on column public.compilations.content_sha256 is
  'SHA-256 hex des octets du paquet livré. Mêmes octets déjà facturés = récupération gratuite. Calculé par le client : ne sert qu''à ne pas sur-facturer.';

create index if not exists compilations_org_sha_idx
  on public.compilations (org_id, content_sha256)
  where content_sha256 is not null and billable;

-- ── 1 quater. POURQUOI c'était gratuit ───────────────────────────────────────────────────────
-- Deux gratuités très différentes cohabitent (récupération, correction) et le plafond ne borne
-- que la seconde. Sans les distinguer, un cycle normal — compiler, télécharger, envoyer — brûlerait
-- deux des dix gratuités de correction en récupérations, et l'utilisateur n'en aurait plus que
-- huit là où le code lui en promet dix. C'est aussi ce qui rend le registre lisible après coup :
-- « je corrige » et « je récupère » ne se confondent plus.
alter table public.compilations add column if not exists free_reason text
  check (free_reason in ('recovery', 'grace'));

comment on column public.compilations.free_reason is
  'Pourquoi la ligne n''a rien coûté : ''recovery'' (mêmes octets déjà payés) ou ''grace'' (correction dans les 24 h). NULL quand la ligne est facturée.';

-- Recherche de grâce : (org, dossier) le plus récent d'abord. Index partiel — un dossier_id NULL
-- n'ouvre jamais la grâce (cf. ci-dessous), donc ces lignes n'ont rien à faire dans l'index.
create index if not exists compilations_org_dossier_recent_idx
  on public.compilations (org_id, dossier_id, created_at desc)
  where dossier_id is not null;

-- ── 1 bis. Un PACK n'est pas un abonnement ───────────────────────────────────────────────────
-- Le cap se dérogeait déjà par org (`org_quota_override.max_compilations`), mais la PÉRIODE se
-- lisait uniquement sur le plan — et le seed 0039 met `'month'` sur tous les plans. Accorder
-- « 3 compilations » à l'acheteur du pack 49 € revenait donc à lui donner 3 compilations **par
-- mois, à vie**, pour un paiement unique. Le cap savait s'exprimer, la durée non.
alter table public.org_quota_override
  add column if not exists compilations_period text
  check (compilations_period in ('lifetime', 'month'));

comment on column public.org_quota_override.compilations_period is
  'Période du cap de compilations pour CETTE org. NULL = celle du plan. ''lifetime'' = pack one-shot (49 € / 249 €).';

-- ── 2. L'état du quota — LECTURE SEULE, source unique de la décision ─────────────────────────
-- Existe pour deux raisons :
--   1. le client doit pouvoir demander « est-ce que je peux compiler, et est-ce que ça coûte ? »
--      AVANT de fabriquer un PDF de plusieurs dizaines de Mo (préflight) ;
--   2. `record_compilation` s'appuie dessus, donc la règle n'est écrite qu'UNE fois. Deux copies
--      d'une règle de facturation finissent toujours par diverger.
-- ⚠️ `drop` avant le `create`, pour la même raison que plus bas : cette fonction a porté une
-- signature à deux paramètres pendant sa mise au point. Sur une base où cette version-là aurait
-- été appliquée, `create or replace` laisserait la 2-arg en place et créerait une SURCHARGE —
-- `compilation_quota(null, null)` deviendrait ambigu (42725), et PostgREST répondrait
-- « 300 Multiple Choices » sur tous les préflights. Un `drop` coûte une ligne.
drop function if exists public.compilation_quota(uuid, uuid);
create or replace function public.compilation_quota(p_dossier_id uuid default null,
                                                    p_org uuid default null,
                                                    p_sha text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  -- Combien de recompilations gratuites du même dossier par fenêtre. Dix couvre très largement la
  -- relecture d'un Module 1 (deux à cinq allers-retours en pratique) et borne l'abus décrit plus
  -- haut : un crédit n'achète pas 24 h illimitées, il achète onze compilations.
  v_grace_cap constant int := 10;
  v_org uuid := public.caller_org_id(p_org);
  v_disabled timestamptz;
  v_plan public.plan_tier;
  v_cap int;
  v_period text;
  v_used int := 0;
  v_free int;
  v_billable boolean := true;
  v_free_reason text;
begin
  if v_org is null then
    return jsonb_build_object('allowed', false, 'reason', 'no_org');
  end if;
  select plan, disabled_at into v_plan, v_disabled from public.orgs where id = v_org;
  if v_disabled is not null then
    return jsonb_build_object('allowed', false, 'reason', 'org_disabled');
  end if;

  -- Deux gratuités, dans cet ordre, et elles ne répondent pas à la même question.
  --
  -- 1. RÉCUPÉRATION — ces octets exacts ont déjà été facturés à cette org. Gratuit, **sans limite
  --    de temps** : on ne fait pas payer deux fois le même paquet, et on ne garde jamais en otage
  --    un livrable déjà acheté (§5.2.3). Volontairement à l'échelle de l'ORG et non du dossier :
  --    mêmes octets = même paquet, quel que soit l'identifiant sous lequel on le redemande.
  if p_sha is not null and exists (
    select 1 from public.compilations
    where org_id = v_org and billable and content_sha256 = p_sha
  ) then
    v_billable := false;
    v_free_reason := 'recovery';

  -- 2. CORRECTION — le contenu a changé, mais on est dans les 24 h qui suivent une compilation
  --    FACTURÉE du même dossier. C'est le cas « je corrige trois coquilles ».
  --
  -- ⚠️ Trois gardes, chacune ferme une faille :
  --   · `p_dossier_id is not null` — sinon la 1re compilation sans dossier (aperçu, outil) rendrait
  --     gratuites toutes les suivantes de l'org ;
  --   · `billable` — la grâce doit naître d'une compilation PAYÉE. Ancrée sur n'importe quelle
  --     ligne, une compilation gratuite à t+23 h en ouvrirait une autre jusqu'à t+47 h, et ainsi
  --     de suite : la fenêtre glisserait indéfiniment et le dossier ne serait plus jamais facturé ;
  --   · le plafond de gratuités — la seule borne possible sur un `dossier_id` que le client choisit.
  --
  -- Cas de bord assumé : la fenêtre chevauche la frontière comptable du mois. Une compilation
  -- facturée le 31 à 23 h 50 offre les recompilations du 1er, sans rien débiter au mois suivant.
  -- C'est le prix d'une fenêtre glissante ; la borner au mois punirait qui compile en fin de mois.
  elsif p_dossier_id is not null and exists (
    select 1 from public.compilations
    where org_id = v_org
      and dossier_id = p_dossier_id
      and billable
      and created_at >= now() - interval '24 hours'
  ) then
    -- On ne compte QUE les corrections : une récupération n'a pas à manger le budget de la
    -- fenêtre, sinon un cycle normal (compiler → télécharger → envoyer) en aurait déjà consommé
    -- deux avant la moindre correction.
    select count(*) into v_free from public.compilations
    where org_id = v_org
      and dossier_id = p_dossier_id
      and free_reason = 'grace'
      and created_at >= now() - interval '24 hours';
    if v_free < v_grace_cap then
      v_billable := false;
      v_free_reason := 'grace';
    end if;
  end if;

  select coalesce(o.max_compilations, pl.max_compilations),
         coalesce(o.compilations_period, pl.compilations_period)
    into v_cap, v_period
  from public.plan_limits pl
  left join public.org_quota_override o on o.org_id = v_org
  where pl.plan = v_plan;

  -- cap NULL = illimité (enterprise, licence annuelle 490 €) : aucun compteur à tenir.
  if v_cap is null then
    return jsonb_build_object('allowed', true, 'billed', v_billable, 'free_reason', v_free_reason,
                              'remaining', null, 'cap', null);
  end if;

  if v_period = 'lifetime' then
    select count(*) into v_used from public.compilations
    where org_id = v_org and billable;
  else
    select count(*) into v_used from public.compilations
    where org_id = v_org and billable and created_at >= date_trunc('month', now());
  end if;

  -- Au plafond, une recompilation sous grâce reste autorisée : elle ne consomme rien, donc rien
  -- ne justifie de la refuser. C'est exactement le cas « je corrige une coquille » de l'audit.
  if v_billable and v_used >= v_cap then
    return jsonb_build_object('allowed', false, 'reason', 'quota_exceeded', 'billed', true,
                              'remaining', 0, 'cap', v_cap, 'used', v_used);
  end if;

  return jsonb_build_object('allowed', true, 'billed', v_billable, 'free_reason', v_free_reason,
                            'remaining', greatest(v_cap - v_used, 0), 'cap', v_cap, 'used', v_used);
end;
$$;
revoke all on function public.compilation_quota(uuid, uuid, text) from public, anon;
grant execute on function public.compilation_quota(uuid, uuid, text) to authenticated, service_role;

comment on function public.compilation_quota(uuid, uuid, text) is
  'Préflight LECTURE SEULE du quota de compilation : { allowed, reason, billed, cap, used, remaining }. Source unique de la décision — record_compilation s''appuie dessus.';

-- ── 3. record_compilation : décide via la fonction ci-dessus, puis enregistre ────────────────
-- Deux changements par rapport à 0049 : la grâce, et un verrou consultatif par org.
--
-- ⚠️ Le verrou n'est pas une précaution de style. La version 0039/0049 se décrivait comme une
-- « garde ATOMIQUE », mais un `count(*)` suivi d'un `insert` ne l'est pas sous READ COMMITTED :
-- deux onglets qui compilent en même temps lisaient tous les deux `used = cap - 1` et inséraient
-- tous les deux. Sur un plan Free à 1/mois, c'était 2. `pg_advisory_xact_lock` sérialise le
-- couple lecture/écriture par org et se relâche à la fin de la transaction.
--
-- Il est pris avant de connaître le cap, donc **même pour une org illimitée** qui n'a rien à
-- sérialiser. C'est délibéré : le savoir coûterait une lecture de plus, et la transaction tient en
-- une insertion. À revoir seulement si une agence multi-postes compile réellement en parallèle.
--
-- ⚠️ `drop` obligatoire avant le `create` : la signature GAGNE un paramètre (`p_sha`), et
-- `create or replace` créerait une SURCHARGE au lieu de remplacer. Deux fonctions de même nom dont
-- l'une ignore l'empreinte, c'est la garantie qu'un appel tombera un jour sur la mauvaise.
drop function if exists public.record_compilation(uuid, text, uuid);
create or replace function public.record_compilation(p_dossier_id uuid, p_kind text,
                                                     p_org uuid default null,
                                                     p_sha text default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_org uuid := public.caller_org_id(p_org);
  v_state jsonb;
  v_billable boolean;
  v_cap int;
  v_used int;
begin
  if v_org is null then
    return jsonb_build_object('allowed', false, 'reason', 'no_org');
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_org::text, 0));

  -- `v_org` et non `p_org` : l'org est déjà résolue et son appartenance vérifiée. Repasser
  -- `p_org` ferait re-résoudre `caller_org_id` et ferait porter le verrou et la décision sur deux
  -- résolutions distinctes — identiques aujourd'hui, rien ne le garantit demain.
  v_state := public.compilation_quota(p_dossier_id, v_org, p_sha);
  if not coalesce((v_state ->> 'allowed')::boolean, false) then
    return v_state;
  end if;

  v_billable := coalesce((v_state ->> 'billed')::boolean, true);
  insert into public.compilations (org_id, dossier_id, kind, billable, content_sha256, free_reason)
  values (v_org, p_dossier_id, coalesce(nullif(p_kind, ''), 'm1_pdf'), v_billable,
          nullif(p_sha, ''), v_state ->> 'free_reason');

  v_cap := nullif(v_state ->> 'cap', '')::int;
  if v_cap is null then
    return jsonb_build_object('allowed', true, 'billed', v_billable,
                              'free_reason', v_state ->> 'free_reason', 'remaining', null, 'cap', null);
  end if;
  v_used := coalesce((v_state ->> 'used')::int, 0) + (case when v_billable then 1 else 0 end);
  return jsonb_build_object('allowed', true, 'billed', v_billable,
                            'free_reason', v_state ->> 'free_reason',
                            'remaining', greatest(v_cap - v_used, 0), 'cap', v_cap, 'used', v_used);
end;
$$;
revoke all on function public.record_compilation(uuid, text, uuid, text) from public, anon;
grant execute on function public.record_compilation(uuid, text, uuid, text) to authenticated, service_role;

-- ── 4. my_org_plan : le compteur AFFICHÉ dit la même chose que le compteur qui décide ────────
-- Recréée à l'identique de 0066, avec deux corrections :
--   · `and billable` sur `compilations_used` — sans quoi l'écran Compte annoncerait « 3/3 dépôts »
--     à quelqu'un qui n'en a payé qu'un ;
--   · la PÉRIODE passe par l'override, comme dans `compilation_quota`. Oublier ce coalesce ici
--     aurait suffi à ruiner le correctif du pack : l'acheteur du 49 € aurait vu son compteur
--     repartir à zéro le 1er du mois pendant que le serveur, lui, refusait — et le libellé client
--     (`use-compilation-credit.ts`) lui aurait promis « ce mois », donc un renouvellement qui
--     n'arrive jamais. Un compteur d'affichage qui contredit le compteur de décision est pire
--     qu'une absence de compteur.
create or replace function public.my_org_plan(p_org uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_org uuid := public.caller_org_id(p_org);
  v_period text;
  v_cperiod text;
begin
  if v_org is null then
    return null;
  end if;
  select pl.dossiers_period, coalesce(ov.compilations_period, pl.compilations_period)
    into v_period, v_cperiod
  from public.orgs o
  join public.plan_limits pl on pl.plan = o.plan
  left join public.org_quota_override ov on ov.org_id = o.id
  where o.id = v_org;
  return (
    select jsonb_build_object(
      'plan', o.plan,
      'billing_period', o.billing_period,
      'is_paying', o.is_paying,
      'disabled', o.disabled_at is not null,
      'sync_enabled', o.sync_enabled,
      'max_dossiers', coalesce(ov.max_dossiers, pl.max_dossiers),
      'dossiers_period', pl.dossiers_period,
      'max_compilations', coalesce(ov.max_compilations, pl.max_compilations),
      'compilations_period', coalesce(ov.compilations_period, pl.compilations_period),
      'monthly_ai_tokens', coalesce(ov.monthly_ai_tokens, pl.monthly_ai_tokens),
      'max_seats', coalesce(ov.max_seats, pl.max_seats),
      'max_storage_bytes', coalesce(ov.max_storage_bytes, pl.max_storage_bytes),
      'features', coalesce(ov.features, pl.features),
      'tokens_used', (select coalesce(sum(input_tokens + output_tokens), 0) from public.ai_usage
                      where org_id = v_org and period_month = date_trunc('month', now())::date),
      'dossiers_used', (select count(*) from public.dossiers
                        where org_id = v_org and deleted_at is null
                          and (v_period = 'lifetime' or created_at >= date_trunc('month', now()))),
      'compilations_used', (select count(*) from public.compilations
                            where org_id = v_org and billable
                              and (v_cperiod = 'lifetime' or created_at >= date_trunc('month', now()))),
      'storage_used', (select coalesce(sum((so.metadata->>'size')::bigint), 0) from storage.objects so
                       where so.bucket_id = 'documents' and so.name like (v_org::text || '/%'))
    )
    from public.orgs o
    join public.plan_limits pl on pl.plan = o.plan
    left join public.org_quota_override ov on ov.org_id = o.id
    where o.id = v_org
  );
end;
$$;
revoke all on function public.my_org_plan(uuid) from public, anon;
grant execute on function public.my_org_plan(uuid) to authenticated, service_role;
