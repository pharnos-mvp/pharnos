-- 0042_storage_bucket_msword.sql — Autorise l'ancien format Word `.doc` (application/msword) au
-- backstop serveur du bucket `documents` (cf. 0036).
--
-- Contexte (retour recette CEO) : la fiche produit ET le CTD builder acceptent désormais doc/docx.
-- Le `.docx` est converti en document ÉDITABLE NATIVEMENT (mammoth → TipTap) côté front et ne touche
-- donc pas le Storage ; mais l'ANCIEN `.doc` binaire (non convertible) est ajouté en pièce jointe →
-- son MIME `application/msword` doit passer l'allowlist serveur (sinon refus, alors que le front
-- l'accepte). On l'ajoute à la liste existante (= ALLOWED_MIMES du front). ADDITIF, ne touche aucune
-- donnée (les objets existants restent valides).

update storage.buckets
set allowed_mime_types = array[
      'application/pdf',
      'image/png',
      'image/jpeg',
      'image/webp',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ]
where id = 'documents';
