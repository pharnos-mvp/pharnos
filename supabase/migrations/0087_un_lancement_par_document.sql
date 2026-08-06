-- Un seul traitement EN VOL par (commande, document) — la garantie passe en base.
--
-- LE DÉFAUT. `order-gate` gardait le double lancement par une LECTURE (`dejaLance(commande.status)`)
-- suivie d'un compare-and-swap sur le JOB (`started_at is null`). Le CAS empêche bien de relancer
-- deux fois le MÊME job, mais rien n'empêchait deux jobs DIFFÉRENTS de la même commande de partir
-- ensemble : l'acheteur qui redépose crée un second job, et deux appels concurrents à la porte —
-- deux onglets suffisent — passaient tous les deux la lecture, puis chacun sa propre CAS. Deux fois
-- 34 rubriques, ~4 $ de moteur sur une commande à 29 €, et `order-status` ne lisant que le job le
-- plus récent, la moitié de cette dépense n'apparaissait nulle part.
--
-- POURQUOI PAS UN VERROU SUR LA COMMANDE. C'est la correction évidente, et elle casserait l'offre
-- « les trois documents » : une commande `up3` porte TROIS jobs qui doivent tourner, chacun jugé
-- contre son propre gabarit officiel. Le verrou ne doit être ni par job (trop fin : il laisse
-- passer deux dépôts du même document) ni par commande (trop grossier : il interdit le bundle).
-- La bonne granularité est le COUPLE (commande, document) — et `upgrade_jobs.doc_type` la porte
-- déjà, posé par `order-upload-url` au moment du dépôt.
--
-- POURQUOI `phase <> 'done'`. L'index borne les traitements EN VOL, pas l'historique. Un job
-- terminé — abouti ou en échec, les deux posent désormais `phase = 'done'` — doit laisser la place
-- à un nouveau dépôt du même document, sans quoi une panne de notre côté confisquerait au client
-- les tentatives qu'il a payées.
--
-- L'index rend la garantie ATOMIQUE : deux portes concurrentes ne peuvent plus toutes deux poser
-- `started_at`, Postgres en refuse une. Le code n'a plus à espérer avoir bien lu avant d'écrire.
create unique index if not exists upgrade_jobs_un_en_vol_par_document
  on public.upgrade_jobs (order_id, doc_type)
  where started_at is not null and phase <> 'done';

comment on index public.upgrade_jobs_un_en_vol_par_document is
  'Un seul traitement en vol par (commande, document). Borne le double lancement concurrent sans '
  'interdire le bundle up3, dont les trois jobs portent trois doc_type distincts.';

-- L'index unique de `ref` existe déjà via la contrainte UNIQUE de la colonne : celui-ci ne servait
-- aucune lecture et doublait le coût d'écriture de chaque commande.
drop index if exists public.orders_ref_idx;
