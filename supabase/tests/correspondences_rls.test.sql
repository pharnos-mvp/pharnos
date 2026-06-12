-- correspondences_rls.test.sql — Sécurité du module Correspondance (migration 0017, jalon H).
--
-- Le reviewer externe N'A PAS de compte : AUCUNE policy anon — tout accès public passe par
-- l'Edge `share` (service-role) après validation token/mot de passe. Ces tests prouvent que :
--   1. anon ne lit RIEN et n'écrit RIEN (même avec les grants larges de la 0016 : RLS = barrière) ;
--   2. un membre d'org ne voit que SES correspondances/messages (isolation multi-tenant) ;
--   3. le fil est append-only pour l'API authentifiée (pas d'UPDATE/DELETE, author='sender' only) ;
--   4. share_hits / share_hit() sont réservés au service-role (anti-abus non contournable).

begin;
select plan(20);

-- ----------------------------------------------------------------------------
-- Seeding (superuser : contourne la RLS)
-- ----------------------------------------------------------------------------
insert into auth.users (instance_id, id, aud, role, email)
values
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000aa', 'authenticated', 'authenticated', 'labo-a@pharnos.test'),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000bb', 'authenticated', 'authenticated', 'labo-b@pharnos.test');

insert into public.orgs (id, name)
values
  ('00000000-0000-0000-0000-0000000000a1', 'Org A'),
  ('00000000-0000-0000-0000-0000000000b2', 'Org B');

insert into public.memberships (org_id, user_id, role)
values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000aa', 'admin'),
  ('00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000000bb', 'admin');

-- Une correspondance par org + un message chacun.
insert into public.correspondences
  (id, org_id, dossier_id, product_name, country, activity, sender_email, recipient_email,
   pdf_path, token_hash)
values
  ('c0000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000a1',
   'd0000000-0000-0000-0000-00000000000a', 'Produit A', 'CI', 'new_ma',
   'labo-a@pharnos.test', 'agence-a@ext.test',
   '00000000-0000-0000-0000-0000000000a1/shares/c0a/module1.pdf', repeat('a', 64)),
  ('c0000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-0000000000b2',
   'd0000000-0000-0000-0000-00000000000b', 'Produit B', 'NG', 'new_ma',
   'labo-b@pharnos.test', 'agence-b@ext.test',
   '00000000-0000-0000-0000-0000000000b2/shares/c0b/module1.pdf', repeat('b', 64));

insert into public.correspondence_messages
  (id, org_id, correspondence_id, author, author_label, kind, body)
values
  ('e0000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000a1',
   'c0000000-0000-0000-0000-00000000000a', 'sender', 'labo-a@pharnos.test', 'note', 'Note A'),
  ('e0000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-0000000000b2',
   'c0000000-0000-0000-0000-00000000000b', 'sender', 'labo-b@pharnos.test', 'note', 'Note B');

-- Journal d'accès (L1, migration 0018) : une entrée par org — écrite par l'Edge (service-role).
insert into public.share_access_log (correspondence_id, org_id, action, ip_hash)
values
  ('c0000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000a1', 'open', 'aaaa'),
  ('c0000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-0000000000b2', 'open', 'bbbb');

-- ----------------------------------------------------------------------------
-- 1) ANON : zéro lecture, zéro écriture (la page publique ne touche JAMAIS la DB en direct)
-- ----------------------------------------------------------------------------
set local role anon;
select set_config('request.jwt.claims', '{}', true);

select is(
  (select count(*)::int from public.correspondences),
  0,
  'anon : aucune correspondance visible (pas de policy anon)'
);
select is(
  (select count(*)::int from public.correspondence_messages),
  0,
  'anon : aucun message visible'
);
select is(
  (select count(*)::int from public.share_hits),
  0,
  'anon : share_hits invisible'
);
select throws_ok(
  $$ insert into public.correspondence_messages
       (id, org_id, correspondence_id, author, author_label, kind, body)
     values ('e0000000-0000-0000-0000-0000000000ff', '00000000-0000-0000-0000-0000000000a1',
             'c0000000-0000-0000-0000-00000000000a', 'recipient', 'pirate@ext.test', 'comment', 'pwn') $$,
  '42501',
  null,
  'anon : INSERT message rejeté par la RLS'
);
select throws_ok(
  $$ select public.share_hit('ip:test', 600) $$,
  '42501',
  null,
  'anon : share_hit() interdit (execute service_role only)'
);
select is(
  (select count(*)::int from public.share_access_log),
  0,
  'anon : journal d''accès invisible'
);

-- ----------------------------------------------------------------------------
-- 2) MEMBRE ORG A : isolation multi-tenant + append-only
-- ----------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000aa"}', true);

select is(
  (select count(*)::int from public.correspondences),
  1,
  'org A : voit uniquement SA correspondance'
);
select is(
  (select count(*)::int from public.correspondence_messages
    where org_id = '00000000-0000-0000-0000-0000000000b2'),
  0,
  'org A : ne voit aucun message de l''org B'
);

-- Réponse du labo (author=sender) : autorisée.
insert into public.correspondence_messages
  (id, org_id, correspondence_id, author, author_label, kind, body)
values
  ('e0000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000a1',
   'c0000000-0000-0000-0000-00000000000a', 'sender', 'labo-a@pharnos.test', 'comment', 'Réponse');
select is(
  (select count(*)::int from public.correspondence_messages),
  2,
  'org A : réponse du labo (author=sender) insérée'
);

-- Usurper le reviewer (author=recipient) : rejeté (seul l'Edge service-role écrit côté reviewer).
select throws_ok(
  $$ insert into public.correspondence_messages
       (id, org_id, correspondence_id, author, author_label, kind, body)
     values ('e0000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-0000000000a1',
             'c0000000-0000-0000-0000-00000000000a', 'recipient', 'fake@ext.test', 'decision', 'x') $$,
  '42501',
  null,
  'org A : impossible d''écrire en tant que recipient (anti-usurpation)'
);

-- Append-only : pas de policy UPDATE/DELETE → 0 ligne affectée, le fil reste intègre.
update public.correspondence_messages set body = 'altéré'
  where id = 'e0000000-0000-0000-0000-00000000000a';
select is(
  (select body from public.correspondence_messages
    where id = 'e0000000-0000-0000-0000-00000000000a'),
  'Note A',
  'org A : UPDATE d''un message sans effet (append-only)'
);
delete from public.correspondence_messages
  where id = 'e0000000-0000-0000-0000-00000000000a';
select is(
  (select count(*)::int from public.correspondence_messages
    where id = 'e0000000-0000-0000-0000-00000000000a'),
  1,
  'org A : DELETE d''un message sans effet (append-only)'
);

-- Journal d'accès : l'org A voit le SIEN uniquement (lecture seule, écrit par l'Edge).
select is(
  (select count(*)::int from public.share_access_log),
  1,
  'org A : voit uniquement SON journal d''accès'
);
select is(
  (select ip_hash from public.share_access_log limit 1),
  'aaaa',
  'org A : le journal visible est bien celui de sa correspondance'
);
select throws_ok(
  $$ insert into public.share_access_log (correspondence_id, org_id, action, ip_hash)
     values ('c0000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000a1',
             'open', 'forged') $$,
  '42501',
  null,
  'org A : journal d''accès infalsifiable (INSERT réservé au service-role)'
);

-- Écrire une correspondance dans l'org B : rejeté (with check).
select throws_ok(
  $$ insert into public.correspondences
       (id, org_id, dossier_id, product_name, country, activity, sender_email, recipient_email,
        pdf_path, token_hash)
     values ('c0000000-0000-0000-0000-0000000000ff', '00000000-0000-0000-0000-0000000000b2',
             'd0000000-0000-0000-0000-00000000000b', 'X', 'CI', 'new_ma', 'a@a.test', 'b@b.test',
             'x/y.pdf', repeat('f', 64)) $$,
  '42501',
  null,
  'org A : INSERT d''une correspondance dans l''org B rejeté'
);

-- ----------------------------------------------------------------------------
-- 3) SERVICE-ROLE (Edge `share`) : décision + rate-limit fonctionnels
-- ----------------------------------------------------------------------------
reset role;
set local role service_role;
select set_config('request.jwt.claims', '{}', true);

update public.correspondences
  set status = 'accepted', decided_at = now(), updated_at = now()
  where id = 'c0000000-0000-0000-0000-00000000000a';
select is(
  (select status from public.correspondences where id = 'c0000000-0000-0000-0000-00000000000a'),
  'accepted',
  'service-role : décision écrite (statut correspondance)'
);

select is(public.share_hit('ip:test', 600), 1, 'share_hit : première frappe = 1');
select is(public.share_hit('ip:test', 600), 2, 'share_hit : compteur incrémenté = 2');

-- Unicité du hash de token (lookup public sans ambiguïté possible).
reset role;
select throws_ok(
  $$ insert into public.correspondences
       (id, org_id, dossier_id, product_name, country, activity, sender_email, recipient_email,
        pdf_path, token_hash)
     values ('c0000000-0000-0000-0000-0000000000fe', '00000000-0000-0000-0000-0000000000a1',
             'd0000000-0000-0000-0000-00000000000a', 'X', 'CI', 'new_ma', 'a@a.test', 'b@b.test',
             'x/z.pdf', repeat('a', 64)) $$,
  '23505',
  null,
  'token_hash : unique (index) — pas deux liens pour un même hash'
);

select * from finish();
rollback;
