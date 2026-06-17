-- ai_rate_limit.test.sql — Jalon N1-d : rate-limit RAFALE des appels IA (migration 0032).
-- Prouve que consume_ai_quota autorise sous la rafale et refuse (reason `rate_limited`) au-delà,
-- indépendamment du cap mensuel de tokens.

begin;
select plan(2);

insert into auth.users (instance_id, id, aud, role, email) values
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000c1', 'authenticated', 'authenticated', 'rl@n1d.test');
insert into public.orgs (id, name) values ('00000000-0000-0000-0000-0000000000d1', 'Org RL');
-- Plan 'pro' : IA active + cap 10M tokens → on isole le rate-limit du cap mensuel.
update public.orgs set plan = 'pro' where id = '00000000-0000-0000-0000-0000000000d1';
insert into public.memberships (org_id, user_id, role) values
  ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000c1', 'admin');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c1"}', true);

-- 1) 1er appel (compteur de rafale frais) → autorisé
select is(
  (public.consume_ai_quota('regafy') ->> 'allowed')::boolean,
  true,
  'sous la rafale max : autorisé'
);

-- 2) on force le compteur de rafale très au-dessus du plafond (10^6 > tout seuil raisonnable,
--    test indépendant de la valeur exacte de v_rl_per_min) → l'appel suivant est rate-limité.
reset role;
update public.share_hits set hits = 1000000
  where bucket = 'ai:00000000-0000-0000-0000-0000000000c1';

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c1"}', true);
select is(
  public.consume_ai_quota('regafy') ->> 'reason',
  'rate_limited',
  'rafale dépassée → reason rate_limited (mappé en HTTP 429 côté Edge)'
);

select * from finish();
rollback;
