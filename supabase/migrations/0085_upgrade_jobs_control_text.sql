-- 0085 — Le corpus de contrôle survit à l'invocation qui l'a reçu (U4).
--
-- `order-gate` reçoit le corpus produit par le navigateur (`prepareUpgradeSource`) pour juger la
-- recevabilité… puis le jetait. Or le worker en a besoin à CHAQUE vague : c'est lui qui vérifie en
-- code les citations et l'ancrage des chiffres de chaque rubrique. Sans lui, le contrôle
-- zéro-invention n'aurait tout simplement pas de corpus, et `verifyEvidence` rendrait
-- `unverifiable` sur les 34 rubriques.
--
-- ⚠️ Il est stocké en base et non re-dérivé du PDF : le re-lire coûterait pdf.js et, sur un scan,
-- une reconnaissance de caractères complète (~4 s par page) — à chaque vague, côté serveur, là où
-- le navigateur l'a déjà fait une fois pour toutes. C'est le sens même de la coupure : le
-- navigateur fait le calculant, le serveur fait l'attendant.
alter table public.upgrade_jobs
  add column if not exists control_text text
    check (control_text is null or char_length(control_text) <= 400000);

comment on column public.upgrade_jobs.control_text is
  'Corpus de CONTROLE produit par le navigateur (prepareUpgradeSource). Ce n''est PAS l''entree du modele : le modele lit la PIECE (le PDF), ce corpus ne sert qu''a verifier EN CODE ses citations et ses chiffres. Son merite est son INDEPENDANCE — un controle produit par ce qu''il controle n''est pas un controle.';
