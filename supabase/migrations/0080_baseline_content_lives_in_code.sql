-- ════════════════════════════════════════════════════════════════════════════════════════════
--  0080 — PHASE DE CONSTRUCTION : le socle réglementaire vit dans le CODE, pas dans une version
-- ════════════════════════════════════════════════════════════════════════════════════════════
--
--  DÉCISION CEO (2026-07-27). Le protocole de référentiel versionné — publier, faire adopter,
--  épingler — est bâti à l'instar des grands RIM et RESTE INTÉGRALEMENT EN PLACE. Mais il ne
--  prend effet qu'AU GO-LIVE, avec de vrais utilisateurs pilotes. Aujourd'hui il n'y a qu'un
--  seul utilisateur (le CEO), aucun pilote, et le socle n'est même pas finalisé pour plusieurs
--  pays : s'imposer une procédure de publication pour corriger une redevance en cours de
--  construction est un frottement pur, sans le bénéfice qui la justifie (l'opposabilité).
--
--  PROBLÈME QUE CETTE MIGRATION RÉSOUT. Le résolveur sert, champ par champ,
--      adaptation locale → version publiée → SOCLE DU CODE
--  Or la migration 0071 a publié 17 entrées GÉNÉRÉES depuis `roadmap-data.ts` dans la version
--  socle v2026.1 (agences des 10 pays · redevances+échantillons BJ/CI/SN · dépôt CI). Tant
--  qu'elles existent, corriger ces valeurs DANS LE CODE ne change RIEN à l'écran : la version
--  publiée masque le code. Le CEO croirait avoir modifié le Bénin sans que rien ne bouge —
--  précisément le genre de divergence silencieuse que ce chantier existe pour empêcher.
--
--  CE QU'ON FAIT. On vide les entrées de la version socle. On NE TOUCHE PAS à la ligne de
--  version elle-même, et c'est essentiel :
--    · `ref_versions.is_baseline` est le PLAFOND D'ADOPTION (sans adoption, une org ne voit que
--      le socle) — supprimer la ligne ferait disparaître ce plafond ;
--    · `dossiers.ref_version_id` y est épinglé pour 137 dossiers avec `on delete restrict`.
--  Une version sans entrée est parfaitement légitime : le résolveur ne trouve rien et retombe
--  sur le code, pays par pays et section par section. Le compteur d'entrées affichera 0 dans la
--  console god — c'est la vérité, pas un défaut.
--
--  RÉVERSIBLE. Les 17 entrées se régénèrent à l'identique depuis le code par
--  `buildRefSeedStatements()` (`web/src/features/catalogue/ref-seed.ts`), qui reste maintenu et
--  testé pour ça. C'EST L'OUTIL DU JOUR J : au signal du CEO, on publie le socle du code comme
--  version de référence et le protocole s'allume, sans rien réécrire.
--  Procédure complète : `docs/PLAN-ORG-REFERENTIEL.md` § « Bascule GO-LIVE du référentiel ».
--
--  CE QUI RESTE INTACT — rien n'est démonté : RLS et zéro écriture client, RPC d'adoption
--  admin-only, journal append-only, épinglage des dossiers et son trigger, auto-adoption à la
--  création d'org, publication god sourcée avec interdiction de rétro-datation, adaptations
--  locales par org, bannières, fusion d'arborescence. Seul le CONTENU du socle change de
--  domicile : la base → le code.
-- ════════════════════════════════════════════════════════════════════════════════════════════

-- Idempotent (une base neuve rejoue 0071 puis celle-ci ; un rejeu ne trouve plus rien à faire).
-- Ciblé par `is_baseline` et non par un uuid en dur : c'est la PROPRIÉTÉ qui compte, et une base
-- reconstruite autrement garde le même comportement.
delete from public.ref_entries e
using public.ref_versions v
where e.version_id = v.id
  and v.is_baseline;

-- Les versions publiées PENDANT la recette de production (traces conservées à la demande du CEO)
-- ne sont PAS touchées : elles ne portent que des deltas `ctd_structure` du Togo, et la plus
-- récente est l'abrogation `{"reset": true}` — l'arborescence togolaise est donc déjà celle du
-- code. Effacer une version publiée n'est de toute façon jamais la réponse : on publie
-- l'abrogation. C'est vrai en construction comme après le GO-LIVE.

do $$
declare
  v_left int;
begin
  select count(*) into v_left
  from public.ref_entries e
  join public.ref_versions v on v.id = e.version_id
  where v.is_baseline;

  if v_left <> 0 then
    raise exception 'socle non vidé : % entrée(s) subsistent', v_left;
  end if;

  -- Garde-fou de la garde-fou : la ligne de version socle DOIT survivre, sinon le plafond
  -- d'adoption et l'épinglage des dossiers tombent en silence.
  if not exists (select 1 from public.ref_versions where is_baseline) then
    raise exception 'la version socle a disparu — plafond d''adoption et épinglage cassés';
  end if;
end $$;
