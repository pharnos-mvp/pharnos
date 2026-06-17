-- 0040_drop_dossier_creation_quota.sql — P1/M2 : le quota n'est plus à la CRÉATION (c'est la COMPILATION, 0039).
--
-- La création de dossiers/brouillons devient ILLIMITÉE. La garde vit désormais au COMPILE
-- (`record_compilation`, fail-closed serveur) + au pré-check client. On retire UNIQUEMENT le trigger ;
-- la fonction `enforce_dossier_quota` et la colonne `max_dossiers` sont laissées inertes (rétro-compat de
-- la jauge historique `dossiers_used`). À appliquer EN MÊME TEMPS que le déploiement du garde-compile front.

drop trigger if exists enforce_dossier_quota_trg on public.dossiers;
