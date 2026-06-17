-- 0036_storage_bucket_backstop.sql — Jalon N3 (D1) : backstop SERVEUR sur le bucket `documents`.
--
-- Le garde-fou CLIENT existait déjà (web/src/lib/files.ts : 25 Mo + allowlist PDF/images/office,
-- appliqué par addDocument ET addAttachment), mais le bucket n'avait AUCUNE limite serveur
-- (file_size_limit / allowed_mime_types = NULL) → un client contournant le front (ou un bug)
-- pouvait téléverser n'importe quel type / n'importe quelle taille. On pose un backstop aligné :
--   • file_size_limit = 50 Mo : au-dessus du cap utilisateur (25 Mo) ET couvre les PDF COMPILÉS
--     (partage de dossier ; max constaté ~11 Mo) ; borne un client abusif.
--   • allowed_mime_types = PDF + images + DOCX/XLSX (= ALLOWED_MIMES du front). Rendu SÛR par le
--     correctif front `contentTypeFor` (même PR) qui pose un Content-Type CANONIQUE même quand le
--     navigateur renvoie un MIME vide/octet-stream (fréquent sous Windows) — sinon un PDF stocké en
--     `application/octet-stream` serait refusé par l'allowlist.
--
-- D1 = garde-fous + visibilité (PAS de quota dur par org : c'est D2, à la bascule Pro). Ne touche
-- aucune donnée existante (les 83 objets sont déjà application/pdf ≤ 11 Mo).

update storage.buckets
set file_size_limit = 52428800,  -- 50 Mo
    allowed_mime_types = array[
      'application/pdf',
      'image/png',
      'image/jpeg',
      'image/webp',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ]
where id = 'documents';
