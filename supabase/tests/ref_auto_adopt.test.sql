-- ref_auto_adopt.test.sql — Auto-adoption du référentiel à la création d'org (migration 0075).
--
-- Une org NEUVE naît sur la dernière version publiée APPLICABLE (état initial, pas un
-- consentement contourné) ; une version à date d'effet future ou un brouillon ne sont jamais
-- choisis. Les orgs existantes restent régies par l'adoption explicite (P4.2, non re-testé ici).

begin;
select plan(4);

-- Versions du test : une publiée ancienne, une publiée récente, une future, un brouillon.
-- (Le seed 0071 v2026.1 existe aussi — publié à now() pendant la migration du conteneur de test,
--  donc potentiellement LE plus récent : les assertions calculent la version attendue par la
--  MÊME règle d'applicabilité que le trigger, au lieu de figer un id.)
insert into public.ref_versions (id, label, status, published_at, effective_date)
values
  ('00000000-0000-0000-0000-0000000000aa', 'vtest-old', 'published', now() - interval '10 days', null),
  ('00000000-0000-0000-0000-0000000000ab', 'vtest-new', 'published', now() + interval '1 minute', null),
  ('00000000-0000-0000-0000-0000000000ac', 'vtest-futur', 'published', now() + interval '2 minutes', (current_date + 30)::date),
  ('00000000-0000-0000-0000-0000000000ad', 'vtest-draft', 'draft', null, null);

insert into public.orgs (id, name) values ('00000000-0000-0000-0000-00000000da01', 'Org Naissante');

select is(
  (select count(*)::int from public.org_ref_adoptions
   where org_id = '00000000-0000-0000-0000-00000000da01'),
  1,
  'une org neuve naît avec EXACTEMENT une adoption'
);
select is(
  (select version_id from public.org_ref_adoptions
   where org_id = '00000000-0000-0000-0000-00000000da01'),
  (select v.id from public.ref_versions v
   where v.status = 'published'
     and (v.effective_date is null or v.effective_date <= current_date)
   order by coalesce(v.effective_date::timestamptz, v.published_at, v.created_at) desc,
            v.published_at desc nulls last, v.created_at desc
   limit 1),
  'elle adopte la version publiée LA PLUS APPLICABLE (jamais une future ni un brouillon)'
);
select isnt(
  (select version_id from public.org_ref_adoptions
   where org_id = '00000000-0000-0000-0000-00000000da01'),
  '00000000-0000-0000-0000-0000000000ac'::uuid,
  'la version à date d''effet FUTURE n''est pas choisie'
);
select is(
  (select count(*)::int from public.audit_log
   where org_id = '00000000-0000-0000-0000-00000000da01'
     and entity = 'ref_version' and action = 'adopt'),
  1,
  'l''état initial est tracé à l''audit de la nouvelle org'
);

select * from finish();
rollback;
