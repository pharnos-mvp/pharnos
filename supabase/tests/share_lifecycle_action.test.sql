-- share_lifecycle_action.test.sql — Vue Agent local (migration 0052, LOT 10b / M7).
--
-- Le CHECK de `share_access_log` accepte le verbe `lifecycle_event` (journal d'accès de la
-- nouvelle action de l'Edge `share`) et continue de REJETER un verbe inconnu. La validation des
-- payloads est testée en pur côté Edge (Deno, _shared/lifecycle-agent-actions.test.ts).

begin;
select plan(2);

-- Seeding minimal (superuser) : une org + une correspondance porteuse du journal d'accès.
insert into public.orgs (id, name) values ('00000000-0000-0000-0000-0000000000c1', 'Org C');
insert into public.correspondences
  (id, org_id, dossier_id, product_name, country, activity, sender_email, recipient_email,
   pdf_path, token_hash)
values
  ('cccc0000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000c1',
   'dddd0000-0000-0000-0000-000000000001', 'Produit', 'BJ', 'enregistrement',
   'ra@labo.test', 'agent@local.test', 'p/x.pdf', 'hash-0052-test');

select lives_ok(
  $$insert into public.share_access_log (correspondence_id, org_id, action, ip_hash)
    values ('cccc0000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000c1',
            'lifecycle_event', 'iphash')$$,
  'le verbe lifecycle_event est accepté par le CHECK'
);

select throws_ok(
  $$insert into public.share_access_log (correspondence_id, org_id, action, ip_hash)
    values ('cccc0000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000c1',
            'verbe_inconnu', 'iphash')$$,
  '23514',
  null,
  'un verbe inconnu reste rejeté (CHECK)'
);

select * from finish();
rollback;
