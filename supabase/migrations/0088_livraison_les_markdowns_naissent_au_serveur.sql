-- U5 — les trois markdowns du livrable naissent AU SERVEUR, à la complétion du job.
--
-- POURQUOI. Le plan (§2.3 étape 10) disait « la page récupère le JSON complet et fabrique les cinq
-- fichiers » — vérifié dans le code, ce JSON ne suffisait pas : `renderReportMarkdown` calcule la
-- liste des lacunes depuis les STATUTS des rubriques, que l'assembleur du livrable ne rend pas, et
-- il n'avait de toute façon AUCUN appelant en production. Faire recalculer ce squelette au
-- navigateur recréerait le défaut de `d224665` — un rapport dont le décompte contredit son propre
-- document. Le serveur assemble donc les trois markdowns (autorité) ; le navigateur ne fait que la
-- mise en page DOCX/PDF (les 2 s de CPU interdites côté Edge).
--
-- Les markdowns pèsent ~30-60 Ko chacun : trois colonnes texte sur le job, pas une table de plus.
-- Ils ne sont écrits qu'UNE fois, par le tick qui termine le job, et lus par `order-status` en mode
-- livrable. RLS deny-all hérité de la table : aucun client ne les lit en direct.
alter table public.upgrade_jobs
  add column if not exists source_name text
    check (source_name is null or char_length(source_name) <= 200),
  add column if not exists deliverable_fr text,
  add column if not exists deliverable_en text,
  add column if not exists deliverable_report text;

comment on column public.upgrade_jobs.source_name is
  'Nom du fichier DÉPOSÉ, pour affichage (en-tête du livrable, rapport). Assaini côté Edge — '
  'la clé Storage, elle, ne porte JAMAIS de chaîne du client (sourceObjectKey).';
comment on column public.upgrade_jobs.deliverable_fr is
  'Markdown du document conforme FR, assemblé par job-tick à la complétion. Source de vérité du '
  'rendu navigateur ET du banc d''essai : un seul texte possible (deliverable-markdown.ts).';
comment on column public.upgrade_jobs.deliverable_en is
  'Markdown du document conforme EN — mêmes règles que deliverable_fr.';
comment on column public.upgrade_jobs.deliverable_report is
  'Markdown de la revue réglementaire — squelette déterministe inclus (renderReportMarkdown, '
  'premier appelant en production).';
