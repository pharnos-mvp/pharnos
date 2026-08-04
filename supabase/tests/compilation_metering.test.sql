-- compilation_metering.test.sql — P1/M1 (migration 0039) : quota à la COMPILATION.
--
-- Prouve record_compilation : garde fail-closed (refus au plafond, aucune insertion sur refus),
-- override d'org, plan illimité (enterprise), et que anon ne peut pas l'appeler.
--
-- Étendu par 0082, qui distingue deux gratuités qu'il ne faut jamais confondre :
--   · RÉCUPÉRATION — les mêmes octets (empreinte SHA-256) déjà facturés sont gratuits POUR
--     TOUJOURS. On ne fait pas payer deux fois le même paquet, et on ne garde pas en otage un
--     livrable déjà acheté. Des octets DIFFÉRENTS restent facturés : ce n'est pas 1 crédit = 1 dossier.
--   · CORRECTION — fenêtre de grâce de 24 h par dossier, plafonnée à 10 gratuités, autorisée même
--     au plafond. Elle ne glisse pas : elle s'ancre sur la dernière compilation FACTURÉE, sans quoi
--     un dossier deviendrait définitivement gratuit par recompilations en chaîne.
-- Et un PACK n'est pas un abonnement : `org_quota_override.compilations_period = 'lifetime'`, lu
-- par la décision ET par l'affichage.

begin;
select plan(35);

insert into auth.users (instance_id, id, aud, role, email) values
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000ca', 'authenticated', 'authenticated', 'ca@pharnos.test'),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000cb', 'authenticated', 'authenticated', 'cb@pharnos.test'),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000cc', 'authenticated', 'authenticated', 'cc@pharnos.test');

insert into public.orgs (id, name) values
  ('00000000-0000-0000-0000-0000000000c1', 'Org C1'),   -- free : 1 compilation / mois (seed 0039)
  ('00000000-0000-0000-0000-0000000000c2', 'Org C2'),
  ('00000000-0000-0000-0000-0000000000c3', 'Org C3');   -- free + override 2 (cf. §grâce)
update public.orgs set plan = 'enterprise' where id = '00000000-0000-0000-0000-0000000000c2';

insert into public.memberships (org_id, user_id, role) values
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000ca', 'admin'),
  ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000cb', 'admin'),
  ('00000000-0000-0000-0000-0000000000c3', '00000000-0000-0000-0000-0000000000cc', 'admin');

-- anon : record_compilation non appelable (execute révoqué)
set local role anon;
select set_config('request.jwt.claims', '', true);
select throws_ok(
  'select public.record_compilation(null, ''m1_pdf'')', '42501', null,
  'anon ne peut PAS appeler record_compilation');

-- free (cap 1/mois) : 1re autorisée, 2e refusée, et le refus n'insère RIEN
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000ca"}', true);
select is((public.record_compilation(null, 'm1_pdf') ->> 'allowed')::boolean, true,
  'free : 1re compilation autorisée');
select is((select count(*)::int from public.compilations where org_id = '00000000-0000-0000-0000-0000000000c1'), 1,
  'ledger : 1 compilation enregistrée');
select is(public.record_compilation(null, 'm1_pdf') ->> 'reason', 'quota_exceeded',
  'free : 2e compilation refusée (cap 1)');
select is((select count(*)::int from public.compilations where org_id = '00000000-0000-0000-0000-0000000000c1'), 1,
  'ledger : refus → AUCUNE insertion (fail-closed)');

-- override cap = 3 : 2 de plus autorisées (total 3), la 4e refusée
reset role;
insert into public.org_quota_override (org_id, max_compilations)
values ('00000000-0000-0000-0000-0000000000c1', 3);
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000ca"}', true);
select is((public.record_compilation(null, 'm1_pdf') ->> 'allowed')::boolean, true,
  'override 3 : 2e compilation autorisée');
select is((public.record_compilation(null, 'm1_pdf') ->> 'allowed')::boolean, true,
  'override 3 : 3e compilation autorisée');
select is(public.record_compilation(null, 'm1_pdf') ->> 'reason', 'quota_exceeded',
  'override 3 : 4e compilation refusée');

-- enterprise : cap NULL = illimité
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000cb"}', true);
select is((public.record_compilation(null, 'm1_pdf') ->> 'allowed')::boolean, true,
  'enterprise : illimité → autorisé');

-- ── Fenêtre de grâce de 24 h par dossier (migration 0082) ───────────────────────────────────
-- L'org C3 a un plafond de 2 : assez pour distinguer « gratuit » de « refusé », ce qu'un plafond
-- de 1 ne permet pas (tout se confondrait sur la première ligne).
reset role;
insert into public.org_quota_override (org_id, max_compilations)
values ('00000000-0000-0000-0000-0000000000c3', 2);

set local role anon;
select set_config('request.jwt.claims', '', true);
select throws_ok(
  'select public.compilation_quota(null, null)', '42501', null,
  'anon ne peut PAS appeler compilation_quota');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000cc"}', true);

select is(public.record_compilation('00000000-0000-0000-0000-0000000000d1', 'm1_pdf') ->> 'billed', 'true',
  'grâce : la 1re compilation d''un dossier est FACTURÉE');
select is(public.record_compilation('00000000-0000-0000-0000-0000000000d1', 'm1_pdf') ->> 'billed', 'false',
  'grâce : recompiler le même dossier dans les 24 h est GRATUIT');
select is((select (count(*) filter (where billable)) || '/' || count(*)
           from public.compilations
           where org_id = '00000000-0000-0000-0000-0000000000c3'
             and dossier_id = '00000000-0000-0000-0000-0000000000d1'), '1/2',
  'grâce : les DEUX compilations sont au registre, une seule est facturable');
select is((public.my_org_plan() ->> 'compilations_used')::int, 1,
  'grâce : le compteur affiché ignore la ligne non facturable');

select is(public.record_compilation('00000000-0000-0000-0000-0000000000d2', 'm1_pdf') ->> 'remaining', '0',
  'plafond 2 : un second dossier consomme le dernier crédit');
select is(public.record_compilation('00000000-0000-0000-0000-0000000000d2', 'm1_pdf') ->> 'billed', 'false',
  'grâce AU PLAFOND : recompiler un dossier déjà payé reste autorisé et gratuit');
select is(public.record_compilation('00000000-0000-0000-0000-0000000000d3', 'm1_pdf') ->> 'reason', 'quota_exceeded',
  'plafond 2 : un TROISIÈME dossier est refusé — la grâce n''ouvre pas le quota');
select is((select count(*)::int from public.compilations
           where org_id = '00000000-0000-0000-0000-0000000000c3'
             and dossier_id = '00000000-0000-0000-0000-0000000000d3'), 0,
  'plafond 2 : le refus n''insère RIEN (fail-closed)');

-- Sonde dans un bloc DO : `perform` exécute réellement la fonction sans exiger de destination
-- pour son résultat, ce qu'un `select` nu ne permet pas ici.
do $probe$ begin perform public.compilation_quota('00000000-0000-0000-0000-0000000000d1', null); end $probe$;
select is((select count(*)::int from public.compilations
           where org_id = '00000000-0000-0000-0000-0000000000c3'), 4,
  'compilation_quota est en LECTURE SEULE : la consulter n''enregistre rien');

-- La fenêtre ne glisse pas. Org C2 (enterprise, plafond NULL) : aucune arithmétique de mois ne
-- vient troubler la mesure. On vieillit la ligne FACTURÉE au-delà de 24 h en laissant la ligne
-- gratuite récente ; si la grâce s'ancrait sur n'importe quelle ligne, le dossier resterait
-- gratuit à vie.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000cb"}', true);
select is(public.record_compilation('00000000-0000-0000-0000-0000000000d1', 'm1_pdf') ->> 'billed', 'true',
  'ancrage : 1re compilation de C2 facturée');
select is(public.record_compilation('00000000-0000-0000-0000-0000000000d1', 'm1_pdf') ->> 'billed', 'false',
  'ancrage : la 2e est gratuite (grâce)');
reset role;
update public.compilations set created_at = now() - interval '25 hours'
where org_id = '00000000-0000-0000-0000-0000000000c2' and billable;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000cb"}', true);
select is(public.compilation_quota('00000000-0000-0000-0000-0000000000d1', null) ->> 'billed', 'true',
  'ancrage : la ligne GRATUITE récente n''ouvre pas de nouvelle fenêtre — le dossier redevient facturable');
select is(public.compilation_quota(null, null) ->> 'billed', 'true',
  'un dossier_id NULL n''ouvre JAMAIS la grâce');

-- ── RÉCUPÉRATION : les mêmes octets ne se paient jamais deux fois ────────────────────────────
-- La règle du plan (§5.2.3) : on limite la création, jamais la récupération. Sans elle, fermer la
-- sortie du paquet rendait un dossier payé la veille irrécupérable le lendemain — la fenêtre de
-- grâce ayant expiré, le client repayait pour retélécharger ce qu'il possédait déjà.
select is(public.record_compilation('00000000-0000-0000-0000-0000000000d5', 'm1_pdf', null, 'sha-A') ->> 'billed', 'true',
  'empreinte : la 1re livraison d''un paquet est facturée');
reset role;
update public.compilations set created_at = now() - interval '30 hours'
where org_id = '00000000-0000-0000-0000-0000000000c2' and billable;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000cb"}', true);
select is(public.compilation_quota('00000000-0000-0000-0000-0000000000d5', null, 'sha-A') ->> 'billed', 'false',
  'récupération : les MÊMES octets restent gratuits BIEN APRÈS la fenêtre de 24 h');
select is(public.compilation_quota('00000000-0000-0000-0000-0000000000d5', null, 'sha-B') ->> 'billed', 'true',
  'récupération : des octets DIFFÉRENTS hors fenêtre sont bien facturés — ce n''est pas 1 crédit = 1 dossier');
-- Une récupération ne doit pas manger le budget de correction : les deux gratuités sont bornées
-- séparément. Sans la colonne `free_reason`, un cycle normal (compiler → télécharger → envoyer)
-- brûlait deux des dix gratuités avant la moindre correction.
select is(public.record_compilation('00000000-0000-0000-0000-0000000000d5', 'm1_pdf', null, 'sha-A') ->> 'free_reason', 'recovery',
  'le registre dit POURQUOI c''était gratuit : récupération, pas correction');
select is((select count(*)::int from public.compilations
           where org_id = '00000000-0000-0000-0000-0000000000c2'
             and dossier_id = '00000000-0000-0000-0000-0000000000d5'
             and free_reason = 'recovery'), 1,
  'budgets séparés : la ligne offerte est enregistrée comme RÉCUPÉRATION…');
select is((select count(*)::int from public.compilations
           where org_id = '00000000-0000-0000-0000-0000000000c2'
             and dossier_id = '00000000-0000-0000-0000-0000000000d5'
             and free_reason = 'grace'), 0,
  '…et n''entame donc pas le budget des dix gratuités de correction');

-- ── La gratuité est BORNÉE ───────────────────────────────────────────────────────────────────
-- `p_dossier_id` vient du client et n'est pas vérifiable (pas de FK : un dossier local-only
-- n'existe pas côté serveur). Sans plafond, réémettre le même identifiant achèterait 24 h de
-- compilations illimitées pour un crédit. C4 est `enterprise` (cap NULL) pour isoler la mesure du
-- quota mensuel : seul le compteur de gratuités est en jeu.
reset role;
insert into auth.users (instance_id, id, aud, role, email) values
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000cd', 'authenticated', 'authenticated', 'cd@pharnos.test'),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000ce', 'authenticated', 'authenticated', 'ce@pharnos.test');
insert into public.orgs (id, name) values
  ('00000000-0000-0000-0000-0000000000c4', 'Org C4'),
  ('00000000-0000-0000-0000-0000000000c5', 'Org C5');
update public.orgs set plan = 'enterprise' where id = '00000000-0000-0000-0000-0000000000c4';
insert into public.memberships (org_id, user_id, role) values
  ('00000000-0000-0000-0000-0000000000c4', '00000000-0000-0000-0000-0000000000cd', 'admin'),
  ('00000000-0000-0000-0000-0000000000c5', '00000000-0000-0000-0000-0000000000ce', 'admin');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000cd"}', true);
-- 1 facturée, puis 10 gratuites (le plafond).
do $burn$
begin
  for i in 1..11 loop
    perform public.record_compilation('00000000-0000-0000-0000-0000000000d4', 'm1_pdf');
  end loop;
end
$burn$;
select is((select count(*)::int from public.compilations
           where org_id = '00000000-0000-0000-0000-0000000000c4'
             and dossier_id = '00000000-0000-0000-0000-0000000000d4' and not billable), 10,
  'plafond de gratuités : 10 recompilations offertes, pas plus');
select is(public.record_compilation('00000000-0000-0000-0000-0000000000d4', 'm1_pdf') ->> 'billed', 'true',
  'plafond de gratuités : la 12e compilation redevient FACTURÉE');

-- ── Un PACK n'est pas un abonnement ──────────────────────────────────────────────────────────
-- C5 est `free` avec un override « 3 compilations, lifetime » : c'est ainsi qu'on livre le pack
-- 49 €. Les 3 compilations datent du mois dernier — sur une période mensuelle elles seraient
-- oubliées, et le pack se rechargerait tout seul chaque mois.
reset role;
insert into public.org_quota_override (org_id, max_compilations, compilations_period)
values ('00000000-0000-0000-0000-0000000000c5', 3, 'lifetime');
insert into public.compilations (org_id, dossier_id, kind, billable, created_at)
select '00000000-0000-0000-0000-0000000000c5', null, 'm1_pdf', true, now() - interval '40 days'
from generate_series(1, 3);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000ce"}', true);
select is(public.compilation_quota(null, null) ->> 'reason', 'quota_exceeded',
  'pack lifetime : 3 compilations du mois dernier épuisent le pack — la période vient de l''override');
-- Le compteur AFFICHÉ doit dire la même chose que le compteur qui DÉCIDE. S'il lisait la période
-- du plan, l'écran Compte afficherait « 0 / 3 » le 1er du mois pendant que le serveur refuse.
select is(public.my_org_plan() ->> 'compilations_period', 'lifetime',
  'my_org_plan expose la période de l''OVERRIDE, pas celle du plan');
select is((public.my_org_plan() ->> 'compilations_used')::int, 3,
  'my_org_plan compte les 3 compilations du pack, sans les oublier au changement de mois');
reset role;
update public.org_quota_override set compilations_period = null
where org_id = '00000000-0000-0000-0000-0000000000c5';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000ce"}', true);
select is((public.compilation_quota(null, null) ->> 'allowed')::boolean, true,
  'témoin : sans période d''override, le même historique retombe sur le mois du plan et ne consomme rien');

select * from finish();
rollback;
