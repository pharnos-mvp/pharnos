-- membership_scopes_rls.test.sql — CS1 : périmètre par membre scopé au dossier (migration 0048).
--
-- Prouve le modèle FAIL-SAFE (policies RESTRICTIVE en AND, jamais de perçage) :
--   1. membre NON scopé = comportement historique STRICTEMENT intact ;
--   2. membre scopé = voit UNIQUEMENT ses dossiers grantés sur la couche SUIVI
--      (dossiers, lifecycle_events, correspondances + messages) — 0 ligne hors périmètre ;
--   3. couche ÉDITION (products, documents, dossier_attachments, generated_docs, parties,
--      pro_settings) + audit_log + annuaire memberships = 0 ligne pour le membre scopé ;
--   4. écritures : l'agent scopé FAIT AVANCER ses dossiers (lifecycle INSERT, décision
--      correspondance UPDATE, message INSERT) mais n'édite JAMAIS (dossiers INSERT/UPDATE,
--      correspondence INSERT refusés) ;
--   5. Storage : pièces suivi (events/, correspondence/) des dossiers grantés seulement ;
--   6. team_set_scope : admin only, cible non-admin, dossiers de l'org only, journalisé
--      (audit GxP), scope vide = ne voit rien, révocation = retour plein accès ;
--   7. team_set_role : promotion admin purge le périmètre (anti « admin scopé »).

begin;
select plan(49);

-- ── Seeding (superuser : contourne la RLS) ───────────────────────────────────
insert into auth.users (instance_id, id, aud, role, email)
values
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000aa', 'authenticated', 'authenticated', 'admin-a@pharnos.test'),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000a2', 'authenticated', 'authenticated', 'editeur-a@pharnos.test'),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000a5', 'authenticated', 'authenticated', 'agent-scope@pharnos.test'),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000bb', 'authenticated', 'authenticated', 'admin-b@pharnos.test');

insert into public.orgs (id, name)
values
  ('00000000-0000-0000-0000-0000000000a1', 'Org A'),
  ('00000000-0000-0000-0000-0000000000b2', 'Org B');

-- Org A : admin + éditeur (non scopés) + agent local (sera scopé). Org B : admin.
insert into public.memberships (org_id, user_id, role)
values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000aa', 'admin'),
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a2', 'ra_officer'),
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a5', 'agence_locale'),
  ('00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000000bb', 'admin');

-- 2 dossiers org A (D1 granté, D2 hors périmètre) + 1 dossier org B.
insert into public.dossiers (id, org_id, product_name, format, activity, country)
values
  ('d0000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000a1', 'Amoxi 500', 'ctd', 'enregistrement', 'CI'),
  ('d0000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-0000000000a1', 'Para 1g', 'ctd', 'enregistrement', 'SN'),
  ('d0000000-0000-0000-0000-0000000000d3', '00000000-0000-0000-0000-0000000000b2', 'Ibu 400', 'ctd', 'enregistrement', 'BJ');

insert into public.lifecycle_events (id, org_id, dossier_id, type, actor_id)
values
  ('e0000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000a1', 'd0000000-0000-0000-0000-0000000000d1', 'deposited', 'u-aa'),
  ('e0000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000a1', 'd0000000-0000-0000-0000-0000000000d2', 'deposited', 'u-aa');

insert into public.correspondences (id, org_id, dossier_id, product_name, country, activity, sender_email, recipient_email, pdf_path, token_hash)
values
  ('c0000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000a1', 'd0000000-0000-0000-0000-0000000000d1', 'Amoxi 500', 'CI', 'enregistrement', 's@a.test', 'r@x.test', '00000000-0000-0000-0000-0000000000a1/correspondence/c0000000-0000-0000-0000-0000000000c1/review.pdf', 'hash-c1'),
  ('c0000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000a1', 'd0000000-0000-0000-0000-0000000000d2', 'Para 1g', 'SN', 'enregistrement', 's@a.test', 'r@y.test', '00000000-0000-0000-0000-0000000000a1/correspondence/c0000000-0000-0000-0000-0000000000c2/review.pdf', 'hash-c2');

insert into public.correspondence_messages (id, org_id, correspondence_id, author, author_label, kind, body)
values
  ('a0000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000a1', 'c0000000-0000-0000-0000-0000000000c1', 'sender', 's@a.test', 'note', 'envoi D1'),
  ('a0000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-0000000000a1', 'c0000000-0000-0000-0000-0000000000c2', 'sender', 's@a.test', 'note', 'envoi D2');

-- Couche ÉDITION org A : un produit + un document + une pièce CTD.
insert into public.products (id, org_id, nom_commercial, dci)
values ('b0000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000a1', 'Amoxi 500', 'amoxicilline');
insert into public.documents (id, org_id, product_id, category, doc_type)
values ('b0000000-0000-0000-0000-0000000000dc', '00000000-0000-0000-0000-0000000000a1', 'b0000000-0000-0000-0000-0000000000b1', 'info', 'rcp');
insert into public.dossier_attachments (id, org_id, dossier_id, node_number)
values ('b0000000-0000-0000-0000-0000000000a7', '00000000-0000-0000-0000-0000000000a1', 'd0000000-0000-0000-0000-0000000000d1', '1.2');

-- Storage : pièces suivi (events/, correspondence/) vs pièce CTD (builder) du MÊME dossier D1.
insert into storage.buckets (id, name)
values ('documents', 'documents')
on conflict (id) do nothing;
insert into storage.objects (bucket_id, name)
values
  ('documents', '00000000-0000-0000-0000-0000000000a1/dossiers/d0000000-0000-0000-0000-0000000000d1/events/e0000000-0000-0000-0000-0000000000e1/recepisse.pdf'),
  ('documents', '00000000-0000-0000-0000-0000000000a1/dossiers/d0000000-0000-0000-0000-0000000000d2/events/e0000000-0000-0000-0000-0000000000e2/recepisse.pdf'),
  ('documents', '00000000-0000-0000-0000-0000000000a1/dossiers/d0000000-0000-0000-0000-0000000000d1/b0000000-0000-0000-0000-0000000000a7/piece-ctd.pdf'),
  ('documents', '00000000-0000-0000-0000-0000000000a1/correspondence/c0000000-0000-0000-0000-0000000000c1/review.pdf'),
  ('documents', '00000000-0000-0000-0000-0000000000a1/correspondence/c0000000-0000-0000-0000-0000000000c2/review.pdf'),
  ('documents', '00000000-0000-0000-0000-0000000000a1/products/b0000000-0000-0000-0000-0000000000b1/rcp.pdf');

-- ── 1) team_set_scope : gardes d'accès ───────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a2"}', true);

select throws_ok(
  $$ select public.team_set_scope('00000000-0000-0000-0000-0000000000a1'::uuid,
       '00000000-0000-0000-0000-0000000000a5'::uuid,
       array['d0000000-0000-0000-0000-0000000000d1']::uuid[]) $$,
  '42501',
  null,
  'team_set_scope : refusé pour un non-admin'
);

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000aa"}', true);

select throws_ok(
  $$ select public.team_set_scope('00000000-0000-0000-0000-0000000000a1'::uuid,
       '00000000-0000-0000-0000-0000000000aa'::uuid,
       array['d0000000-0000-0000-0000-0000000000d1']::uuid[]) $$,
  '42501',
  null,
  'team_set_scope : un admin n''est pas scopable (anti-lockout)'
);

select throws_ok(
  $$ select public.team_set_scope('00000000-0000-0000-0000-0000000000a1'::uuid,
       '00000000-0000-0000-0000-0000000000a5'::uuid,
       array['d0000000-0000-0000-0000-0000000000d3']::uuid[]) $$,
  '22023',
  null,
  'team_set_scope : un dossier d''une AUTRE org est refusé (fail-safe)'
);

-- Grant valide : agent scopé sur D1 seulement.
select lives_ok(
  $$ select public.team_set_scope('00000000-0000-0000-0000-0000000000a1'::uuid,
       '00000000-0000-0000-0000-0000000000a5'::uuid,
       array['d0000000-0000-0000-0000-0000000000d1']::uuid[]) $$,
  'team_set_scope : grant D1 par l''admin accepté'
);

select is(
  (select count(*)::int from public.audit_log
    where entity = 'membership_scope' and action = 'scope_set'
      and entity_id = '00000000-0000-0000-0000-0000000000a5'),
  1,
  'team_set_scope : grant journalisé dans audit_log (GxP)'
);

-- ── 2) Membre NON scopé : comportement historique intact ─────────────────────
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a2"}', true);

select is((select count(*)::int from public.dossiers), 2, 'non scopé : voit les 2 dossiers de l''org');
select is((select count(*)::int from public.lifecycle_events), 2, 'non scopé : voit tout le journal');
select is((select count(*)::int from public.correspondences), 2, 'non scopé : voit toutes les correspondances');
select is((select count(*)::int from public.products), 1, 'non scopé : voit le catalogue');
select is((select count(*)::int from public.memberships), 3, 'non scopé : voit l''équipe');
select is(
  (select count(*)::int from storage.objects where bucket_id = 'documents'),
  6,
  'non scopé : voit tous les fichiers Storage de l''org'
);

-- ── 3) Membre SCOPÉ : couche SUIVI limitée aux dossiers grantés ──────────────
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a5"}', true);

select is((select count(*)::int from public.dossiers), 1, 'scopé : voit UNIQUEMENT le dossier granté');
select is(
  (select count(*)::int from public.dossiers where id = 'd0000000-0000-0000-0000-0000000000d2'),
  0,
  'scopé : 0 ligne pour le dossier hors périmètre'
);
select is(
  (select count(*)::int from public.lifecycle_events
    where dossier_id = 'd0000000-0000-0000-0000-0000000000d2'),
  0,
  'scopé : 0 événement hors périmètre'
);
select is((select count(*)::int from public.lifecycle_events), 1, 'scopé : journal du dossier granté seulement');
select is((select count(*)::int from public.correspondences), 1, 'scopé : correspondance du dossier granté seulement');
select is((select count(*)::int from public.correspondence_messages), 1, 'scopé : messages du dossier granté seulement');

-- ── 4) Membre SCOPÉ : couche ÉDITION + données org = 0 ligne ─────────────────
select is((select count(*)::int from public.products), 0, 'scopé : catalogue produits INVISIBLE');
select is((select count(*)::int from public.documents), 0, 'scopé : documents de travail INVISIBLES');
select is((select count(*)::int from public.dossier_attachments), 0, 'scopé : pièces du CTD builder INVISIBLES (même dossier granté)');
select is((select count(*)::int from public.generated_docs), 0, 'scopé : docs générés INVISIBLES');
select is((select count(*)::int from public.pro_settings), 0, 'scopé : branding/signatures INVISIBLES');
select is((select count(*)::int from public.audit_log), 0, 'scopé : journal d''audit org INVISIBLE');
select is((select count(*)::int from public.memberships), 1, 'scopé : annuaire réduit à SA propre ligne');
select is(
  (select count(*)::int from public.membership_scopes
    where user_id = '00000000-0000-0000-0000-0000000000a5'),
  1,
  'scopé : lit SON périmètre (l''UI s''y adapte)'
);

-- ── 5) Membre SCOPÉ : écritures suivi OK, écritures édition REFUSÉES ─────────
-- Fait avancer SON dossier (agence_locale = gestionnaire de soumission).
insert into public.lifecycle_events (id, org_id, dossier_id, type, actor_id)
values ('e0000000-0000-0000-0000-0000000000e5', '00000000-0000-0000-0000-0000000000a1',
        'd0000000-0000-0000-0000-0000000000d1', 'submitted', 'u-a5');
select is(
  (select count(*)::int from public.lifecycle_events where id = 'e0000000-0000-0000-0000-0000000000e5'),
  1,
  'scopé : INSERT lifecycle_events sur le dossier granté accepté'
);
select throws_ok(
  $$ insert into public.lifecycle_events (id, org_id, dossier_id, type, actor_id)
     values ('e0000000-0000-0000-0000-0000000000e6', '00000000-0000-0000-0000-0000000000a1',
             'd0000000-0000-0000-0000-0000000000d2', 'submitted', 'u-a5') $$,
  '42501',
  null,
  'scopé : INSERT lifecycle_events hors périmètre REJETÉ'
);

-- Décision in-app (M4) sur SA correspondance ; hors périmètre = 0 ligne.
update public.correspondences set status = 'accepted'
  where id = 'c0000000-0000-0000-0000-0000000000c1';
select is(
  (select status from public.correspondences where id = 'c0000000-0000-0000-0000-0000000000c1'),
  'accepted',
  'scopé : décision (UPDATE) sur la correspondance du dossier granté acceptée'
);
update public.correspondences set status = 'accepted'
  where id = 'c0000000-0000-0000-0000-0000000000c2';
select is(
  (select count(*)::int from public.correspondences where status = 'accepted'),
  1,
  'scopé : UPDATE hors périmètre sans effet (0 ligne)'
);

-- Participe au fil de SON dossier ; hors périmètre rejeté.
insert into public.correspondence_messages (id, org_id, correspondence_id, author, author_label, body)
values ('a0000000-0000-0000-0000-0000000000f5', '00000000-0000-0000-0000-0000000000a1',
        'c0000000-0000-0000-0000-0000000000c1', 'sender', 'agent-scope@pharnos.test', 'reçu par l''agence');
select is(
  (select count(*)::int from public.correspondence_messages where id = 'a0000000-0000-0000-0000-0000000000f5'),
  1,
  'scopé : message sur le fil du dossier granté accepté'
);
select throws_ok(
  $$ insert into public.correspondence_messages (id, org_id, correspondence_id, author, author_label, body)
     values ('a0000000-0000-0000-0000-0000000000f6', '00000000-0000-0000-0000-0000000000a1',
             'c0000000-0000-0000-0000-0000000000c2', 'sender', 'agent-scope@pharnos.test', 'hors périmètre') $$,
  '42501',
  null,
  'scopé : message hors périmètre REJETÉ'
);

-- Jamais d'édition : création/modification de dossier, nouvelle correspondance.
select throws_ok(
  $$ insert into public.dossiers (id, org_id, product_name, format, activity, country)
     values ('d0000000-0000-0000-0000-0000000000d9', '00000000-0000-0000-0000-0000000000a1',
             'Pirate', 'ctd', 'enregistrement', 'CI') $$,
  '42501',
  null,
  'scopé : CRÉATION de dossier REJETÉE'
);
update public.dossiers set product_name = 'Modifié'
  where id = 'd0000000-0000-0000-0000-0000000000d1';
select is(
  (select product_name from public.dossiers where id = 'd0000000-0000-0000-0000-0000000000d1'),
  'Amoxi 500',
  'scopé : UPDATE du dossier granté sans effet (suivi ≠ édition)'
);
select throws_ok(
  $$ insert into public.correspondences (id, org_id, dossier_id, product_name, country, activity, sender_email, recipient_email, pdf_path, token_hash)
     values ('c0000000-0000-0000-0000-0000000000c9', '00000000-0000-0000-0000-0000000000a1',
             'd0000000-0000-0000-0000-0000000000d1', 'Amoxi 500', 'CI', 'enregistrement',
             'agent-scope@pharnos.test', 'r@x.test', 'p.pdf', 'hash-c9') $$,
  '42501',
  null,
  'scopé : CRÉATION de correspondance REJETÉE (compiler = couche édition)'
);

-- ── 6) Membre SCOPÉ : Storage — pièces suivi du périmètre seulement ──────────
select is(
  (select count(*)::int from storage.objects where bucket_id = 'documents'),
  2,
  'scopé Storage : voit UNIQUEMENT les pièces suivi du dossier granté (event D1 + PDF C1)'
);
select is(
  (select count(*)::int from storage.objects
    where bucket_id = 'documents' and name like '%piece-ctd%'),
  0,
  'scopé Storage : pièce du CTD builder INVISIBLE (même dossier granté)'
);
select is(
  (select count(*)::int from storage.objects
    where bucket_id = 'documents' and name like '%products%'),
  0,
  'scopé Storage : documents du catalogue INVISIBLES'
);

-- Dépose une preuve sous events/ de SON dossier ; hors périmètre rejeté ; delete sans effet.
insert into storage.objects (bucket_id, name)
values ('documents', '00000000-0000-0000-0000-0000000000a1/dossiers/d0000000-0000-0000-0000-0000000000d1/events/e0000000-0000-0000-0000-0000000000e5/preuve.pdf');
select is(
  (select count(*)::int from storage.objects
    where bucket_id = 'documents' and name like '%preuve.pdf'),
  1,
  'scopé Storage : dépôt d''une preuve sous events/ du dossier granté accepté'
);
select throws_ok(
  $$ insert into storage.objects (bucket_id, name)
     values ('documents', '00000000-0000-0000-0000-0000000000a1/dossiers/d0000000-0000-0000-0000-0000000000d2/events/e0000000-0000-0000-0000-0000000000e2/pirate.pdf') $$,
  '42501',
  null,
  'scopé Storage : dépôt hors périmètre REJETÉ'
);
-- NB : le DELETE direct sur storage.objects est interdit par le moteur Storage lui-même
-- (« Use the Storage API instead ») — impossible à exercer en SQL. On prouve à la place que la
-- policy RESTRICTIVE DELETE (unscoped only) est bien en place : c'est elle que l'API Storage
-- applique via RLS.
select is(
  (select count(*)::int from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'cs1_documents_storage_delete'
      and permissive = 'RESTRICTIVE'
      and cmd = 'DELETE'),
  1,
  'scopé Storage : policy restrictive DELETE en place (le journal reste intègre via l''API)'
);

-- ── 7) Scope vide = ne voit RIEN (fail-safe) ─────────────────────────────────
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000aa"}', true);
select lives_ok(
  $$ select public.team_set_scope('00000000-0000-0000-0000-0000000000a1'::uuid,
       '00000000-0000-0000-0000-0000000000a5'::uuid, '{}'::uuid[]) $$,
  'team_set_scope : scope vide accepté (suspension fail-safe)'
);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a5"}', true);
select is((select count(*)::int from public.dossiers), 0, 'scope vide : 0 dossier visible');
select is((select count(*)::int from public.lifecycle_events), 0, 'scope vide : 0 événement visible');

-- ── 8) Révocation du périmètre = retour au plein accès org ───────────────────
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000aa"}', true);
select lives_ok(
  $$ select public.team_set_scope('00000000-0000-0000-0000-0000000000a1'::uuid,
       '00000000-0000-0000-0000-0000000000a5'::uuid, null) $$,
  'team_set_scope : révocation (null = toute l''org) acceptée'
);
select is(
  (select count(*)::int from public.audit_log
    where entity = 'membership_scope' and action = 'scope_cleared'),
  1,
  'team_set_scope : révocation journalisée dans audit_log (GxP)'
);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a5"}', true);
select is((select count(*)::int from public.dossiers), 2, 'périmètre révoqué : plein accès org restauré');

-- ── 9) Promotion admin : le périmètre est purgé (anti « admin scopé ») ───────
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000aa"}', true);
select lives_ok(
  $$ select public.team_set_scope('00000000-0000-0000-0000-0000000000a1'::uuid,
       '00000000-0000-0000-0000-0000000000a5'::uuid,
       array['d0000000-0000-0000-0000-0000000000d1']::uuid[]) $$,
  're-scope de l''agent avant promotion'
);
select is(
  (select public.team_set_role('00000000-0000-0000-0000-0000000000a1'::uuid,
     '00000000-0000-0000-0000-0000000000a5'::uuid, 'admin'::org_role) ->> 'ok'),
  'true',
  'team_set_role : promotion admin acceptée'
);
select is(
  (select count(*)::int from public.membership_scopes
    where user_id = '00000000-0000-0000-0000-0000000000a5'),
  0,
  'team_set_role : promotion admin PURGE le périmètre'
);

select * from finish();
rollback;
