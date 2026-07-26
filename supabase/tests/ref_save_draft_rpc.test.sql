-- ref_save_draft_rpc.test.sql — la RPC de publication god est-elle APPELABLE ? (correctif 0079)
--
-- Pourquoi ce fichier existe : `admin_ref_save_draft` a levé « column reference "e" is ambiguous »
-- (42702) sur CHAQUE appel en production, du 2026-07-25 au 2026-07-26. Toute la voie de
-- publication du référentiel était morte, et RIEN ne l'a vu :
--   • `create function` réussit (PL/pgSQL ne compile son corps qu'au premier APPEL) ;
--   • les pgTAP du chantier prouvaient la RLS des TABLES, jamais l'exécution de la RPC ;
--   • l'Edge remonte un `query_failed` générique → l'écran god affichait « L'enregistrement a
--     échoué », sans cause.
-- Leçon : une fonction SQL non APPELÉE par un test n'est pas testée. Ce fichier appelle donc
-- chaque chemin — le nominal et les refus — au lieu de relire du SQL.

begin;
select plan(9);

-- Contexte : la RPC est `security definer` réservée au service_role ; les tests tournent en
-- superuser, ce qui reproduit l'appel de l'Edge.
insert into public.ref_versions (id, label, status, published_at, is_baseline)
values ('00000000-0000-0000-0000-0000000000b1', 'v2020.1', 'published', now(), false);

-- ── Chemin NOMINAL : c'est exactement ce qui échouait en prod ─────────────────────────────────
select lives_ok(
  $$ select public.admin_ref_save_draft(
       null, 'v2099.1', null, 'test',
       '[{"country":"TG","section":"ctd_structure",
          "payload":{"deltas":[{"kind":"remove","number":"1.1.2"}]},
          "provenance":{"texte":"Arrêté de test n° 1"}}]'::jsonb) $$,
  'la RPC s''EXÉCUTE (régression 42702 : variable PL/pgSQL homonyme d''un alias de table)'
);
select is(
  (select count(*)::int from public.ref_versions where label = 'v2099.1' and status = 'draft'),
  1,
  'un brouillon est bien créé'
);
select is(
  (select payload->'deltas'->0->>'number' from public.ref_entries e
   join public.ref_versions v on v.id = e.version_id where v.label = 'v2099.1'),
  '1.1.2',
  'le payload de la section `ctd_structure` est écrit INTACT'
);

-- ── Ré-enregistrement d'un brouillon : REMPLACE ses entrées, ne les empile pas ────────────────
select lives_ok(
  $$ select public.admin_ref_save_draft(
       (select id from public.ref_versions where label = 'v2099.1'),
       'v2099.1', null, 'test 2',
       '[{"country":"SN","section":"fees",
          "payload":{"currency":"FCFA","fees":{"new_ma":1000}},
          "provenance":{"texte":"Décret de test n° 2"}}]'::jsonb) $$,
  'ré-enregistrer un brouillon existant fonctionne'
);
select is(
  (select count(*)::int from public.ref_entries e
   join public.ref_versions v on v.id = e.version_id where v.label = 'v2099.1'),
  1,
  'les entrées sont REMPLACÉES (un payload de section chasse le précédent)'
);

-- ── Refus : chaque garde doit être ATTEINTE, pas seulement écrite ─────────────────────────────
select throws_ok(
  $$ select public.admin_ref_save_draft(null, 'brouillon', null, '',
       '[{"country":"TG","section":"fees","payload":{},"provenance":{"texte":"xxx"}}]'::jsonb) $$,
  'bad_label',
  'un libellé hors format vAAAA.N est refusé'
);
select throws_ok(
  $$ select public.admin_ref_save_draft(null, 'v2099.2', null, '', '[]'::jsonb) $$,
  'bad_entries',
  'une version VIDE est refusée'
);
select throws_ok(
  $$ select public.admin_ref_save_draft(null, 'v2099.3', null, '',
       '[{"country":"TG","section":"ctd_labels_v3","payload":{},"provenance":{"texte":"xxx"}}]'::jsonb) $$,
  'bad_entry',
  'une section hors liste blanche est refusée (miroir de `_shared/ref-payload.ts`)'
);
select throws_ok(
  $$ select public.admin_ref_save_draft(null, 'v2099.4', null, '',
       '[{"country":"TG","section":"fees","payload":{},"provenance":{}}]'::jsonb) $$,
  'bad_entry',
  'pas de source citée, pas d''entrée (provenance obligatoire, garde serveur)'
);

select * from finish();
rollback;
