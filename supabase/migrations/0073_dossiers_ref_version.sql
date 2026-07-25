-- 0073 — Épinglage du dossier sur une version du référentiel (P4.2b, PLAN-ORG-REFERENTIEL §6).
--
-- « Un dossier déposé est une photographie opposable » : il garde le barème et les exigences de la
-- version avec laquelle il a été monté, même si l'org adopte plus récent ensuite (exigence d'audit
-- GxP, modèle MedDRA du briefing). Épinglé à la CRÉATION = dernière version adoptée par l'org
-- (0072) ; la mise à jour d'un dossier existant est une action VOLONTAIRE et tracée, jamais
-- automatique.
--
-- Additif et nullable : les dossiers existants restent à null = « aucune version épinglée » →
-- le client retombe sur la version appliquée par l'org (comportement d'avant P4.2b, zéro backfill,
-- zéro churn de sync). ON DELETE SET NULL : purger une version du référentiel ne casse aucun
-- dossier (le client retombe alors sur le socle code, jamais sur une valeur fausse).

alter table public.dossiers
  add column if not exists ref_version_id uuid references public.ref_versions (id) on delete set null;

-- Index FK : sans lui, la suppression d'une version (action SET NULL) ferait un seq scan sur les
-- dossiers, et le futur écran « dossiers épinglés sous vX » du God dashboard (P4.4) aussi.
create index if not exists dossiers_ref_version_idx on public.dossiers (ref_version_id);
