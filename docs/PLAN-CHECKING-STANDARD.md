# PLAN — Checking Standard public (pharnos.com)

> Statut : **LOT 1 LIVRÉ (2026-07-27)** — page réelle FR/EN dans `landing/`, barème versionné testé, prévisualiseur de modèles, Edge `checking-report` + `checking_leads` (0081). Reste : déploiement + recette CEO. Prix et agrégateur de paiement **en attente CEO**.
> Mockups : `docs/mockups/checking-standard-v3.html` (référence de la page livrée) · v2/v1 dépréciés.
> Mémoire liée : `diagnostic-conformite-module1` · sources : fiches ABMed HO-PC 0002-FO 0021 (enreg, 15 items) & HO-FO 0042 (renouv, 14 items) + Annexe règlement 04/2020/UEMOA (`RA-source/eCTD_UEMOA-ECOWAS/`).

## 1. La thèse

Le **checking standard** est l'acte fondateur de Pharnos (les dossiers qui le passaient décrochaient l'AMM ~50 % plus vite). On le rend **public, gratuit, sans connexion et sans upload** : le MAH répond à ~15 questions et obtient exactement ce que produit l'examinateur de l'agence — une **fiche de complétude simulée** (OUI/NON + annotations), une **note /100**, un **verdict de recevabilité** et la **liste numérotée des manquants** (« 1- Fournir… », le format ABMed mot pour mot).

Trois faits réglementaires portent tout le funnel (Annexe IV, Règl. 04/2020) :
1. **Un dossier incomplet n'est pas réceptionné** — 4 critères : format CTD, composition conforme, échantillons + certificat, récépissé de paiement.
2. **Passé le délai de mise en conformité, la demande est clôturée** sur la plateforme — nouvelle soumission = **redevances repayées**.
3. Le modèle terrain est **présence ≠ conformité** (4 états : conforme / présent-non-conforme / absent / NA) — les fiches réelles cochent OUI puis annotent « non conforme au format CTD », « format Word non fourni ».

Un seul modèle pour toute l'UEMOA (socle 04/2020 ; les fiches Bénin en sont l'instanciation la plus documentée) ; le pays choisi personnalise l'autorité citée et, plus tard, l'overlay national.

## 2. Tranché : pharnos.com (l'outil) × Regafy (la distribution et le vivier)

**L'outil vit sur pharnos.com.** Décision maintenue (déjà actée le 2026-07-22) et renforcée :
- **L'acheteur est un MAH**, pas un expert individuel. L'audience Regafy (quiz, Pulse, classement) = des experts RA — c'est le **vivier de prestataires** des offres 2 et 3, pas la cible d'achat.
- **La marque produit doit encaisser la confiance** : celui qui audite son dossier chez Pharnos achète ensuite Pharnos (essai 30 j, Pro/Team/Business). Sur regafy.com, le lead mourrait dans une marque média.
- **Toute l'infra existe côté pharnos.com** : CSP stricte `landing/_headers`, i18n `data-en`, Edge + Resend (patron `demo-request`), déploiement Pages `pharnos-landing`, Turnstile maîtrisé.
- **Jonctions Regafy** (conformes au cadrage « plans séparés ») : le quiz et Pulse **pointent vers le Checking Standard** ; les meilleurs profils du classement sont **recrutés comme auditeurs** (attribution via codes d'invitation = base de rémunération existante) ; le tier 1 s'appelle **« Audit Regafy AI »** — pont de marque assumé avec l'audit du CTD Builder.

## 3. La page (mockup v2 — ce qui change vs v1)

| v1 (rejetée) | v2 (livrée) |
|---|---|
| Checklist monobloc, 15 items sur un écran | **Une question à la fois** (patron quiz premium) : réponse clavier 1-4, auto-avance, retour, points de navigation |
| Score final sec | **HUD vivant** : progression, **3 verrous de réception** (Format CTD / Échantillons / Paiement) qui se verrouillent en vert/rouge en direct |
| Verdict générique | **Fiche de complétude simulée** identique au formulaire de l'examinateur + avis Complet ☑ / Incomplet ☒ + axes (admin / technique / sécurité / recevabilité) |
| 1 offre expert | **3 offres** + garantie recevabilité + « Voir un exemple de résultat » (préréglage = un dossier industriel réel anonymisé) |
| Email seulement | **Email (Resend) + WhatsApp (wa.me)** + PDF client |

Chaque question porte son « pourquoi » + la source (fiche officielle / annexe du règlement) : la page **enseigne** en évaluant — c'est ce qui la rend partageable entre RA.

## 4. Les 3 offres & pricing proposé (à valider CEO)

Ancrage : l'échec en réception coûte les redevances (non remboursées) + 3-6 mois ; l'abonnement Pro = 100 000 FCFA/mois.

| Offre | Prix / dossier / pays | Délai | Contenu | Économie |
|---|---|---|---|---|
| **Audit Regafy AI** | **75 000 FCFA** (lancement : 50 000) | 48 h | Upload chiffré du M1 → +200 points de contrôle (moteur d'audit CTD Builder renforcé), rapport annoté, re-scan gratuit après corrections | Marge ~95 % ; produit d'appel sous le prix du Pro mensuel |
| **Audit Expert RA** ★ le plus choisi | **250 000 FCFA** | 5 j ouvrés | AI + revue humaine ligne à ligne, rapport d'expertise, plan d'action priorisé, restitution visio 45 min, Q&R 7 j | Rev-share expert ~60 % (150 000) — au-dessus du taux jour marché → attire les bons profils Regafy |
| **Audit Expert Senior** | **à partir de 750 000 FCFA** (multi-pays sur devis) | 10 j ouvrés | Dr en pharmacie / ancien cadre d'agence : audit M1 + cohérence M2–M5, stratégie multi-pays, **masterclass privée 2 h**, hotline 30 j, lettre signée | Rev-share 60/40 ; ancre le pipeline Entreprise (sur devis) |

- **Garantie recevabilité** (offres 2-3) : dossier corrigé selon l'audit non réceptionné → ré-audit gratuit jusqu'à recevabilité. Coût marginal quasi nul, différenciateur massif. **À valider CEO.**
- MVP opérationnel = file traitée à la main (CEO + premiers experts), pas de marketplace.
- Les documents ne sont demandés qu'**après paiement** (espace chiffré, NDA sur demande) — cohérent avec la promesse « zéro document » du diagnostic.

## 5. En tirer profit — les 5 boucles

1. **Lead magnet** : rapport par email/WhatsApp → nurture → démo / essai 30 j (funnel invitations).
2. **Revenu direct** one-shot (3 offres) à CAC ≈ 0.
3. **Pont produit** : après audit, « montez ce Module 1 en un clic dans le CTD Builder » → conversion SaaS.
4. **Vivier Regafy** : classement/Pulse → recrutement d'auditeurs vérifiés, rémunérés via attribution.
5. **Contenu** : stats agrégées anonymes (« 62 % des dossiers butent sur le Word du RCP ») → Pulse, LinkedIn, PR — qui re-nourrissent le SEO de la page.

## 6. Architecture & lots

- **Lot 1 — Diagnostic — ✅ LIVRÉ** : `landing/checking-standard.html` + miroir `/en/` généré ; barème versionné `landing/checking/{referentiel,scoring,templates}.js` (`BAREME_VERSION = uemoa-2026.1`, 24 tests Vitest) ; Edge `checking-report` + `_shared/checking-report-core.ts` (27 tests Deno) ; migration `0081_checking_leads`.
  - **Anti-abus retenu : honeypot + rate-limit `share_hit` fail-closed (IP / destinataire / global), PAS Turnstile.** Écart assumé au plan initial : Turnstile impose `challenges.cloudflare.com` dans `script-src` et `frame-src`, ce qui affaiblit la CSP de toute la landing (aujourd'hui `'self'` strict, zéro script tiers) pour un gain marginal sur une surface déjà bornée par trois plafonds. À rebrancher si l'abus se matérialise — le point de branchement est isolé dans `index.ts`.
  - **Barème dupliqué par génération** : `supabase/functions/_shared/checking/` est une copie de `landing/checking/` produite par `npm run build:checking-bareme`, avec garde zéro-diff en CI. Raison : `supabase functions deploy` enracine son bundle sur `supabase/functions` — un import remontant vers `landing/` type-checke en local sans garantie d'entrer dans l'eszip déployé.
  - **Score recalculé côté serveur** ; `na` n'est honoré que sur les items qui l'offrent (sinon un « 100/100 · prêt » se forgeait en trois réponses) ; consentement prouvé côté serveur (`consent` + `consent_at` en base).
  - **Différé au Lot 2** : PDF client `pdf-lib` (le rapport part par e-mail, le PDF suivra) ; lien `wa.me` direct (le numéro officiel Pharnos manque — aujourd'hui le lead est enregistré et l'équipe rappelle).
- **Lot 2 — Paiement & dépôt** : agrégateur UEMOA (Kkiapay/CinetPay/PayDunya/FedaPay — **décision CEO**), webhook serveur → déblocage espace de dépôt (bucket `documents`, liens signés, `storageObjectKey()`), file d'audit dans la console admin.
- **Lot 3 — Regafy AI** : upgrade du moteur `audit-report.ts`/`audit-print.ts` en service d'audit sur dossier déposé ; stats anonymisées.

## 7. Garde-fous

- **Jamais** de promesse de décision d'autorité ; disclaimer permanent (outil d'auto-évaluation ≠ avis réglementaire).
- Le « +50 % plus vite » reste formulé comme constat fondateur (« sur nos dossiers »), pas comme garantie.
- Barème versionné **dans le code** (même doctrine que le référentiel : en construction, le socle vit dans le code).
- Prix affichés display-only tant qu'aucun agrégateur n'est branché ; jamais de credentials de paiement manipulés.
- Noms d'agences à sécuriser avant prod (ABMed/ARP/AIRP sûrs ; Niger/Guinée-Bissau → « autorité nationale »).

## 8. KPIs

Complétion du diagnostic (> 60 %) · taux de capture email/WhatsApp (> 35 %) · conversion diagnostic → audit payant (2-5 %) · conversion audit → essai SaaS (> 25 %) · NPS des audités.

## 9. En attente CEO

1. Valider les 3 prix (et le prix de lancement AI à 50 000).
2. Choisir l'agrégateur de paiement.
3. Oui/non sur la garantie recevabilité.
4. Numéro WhatsApp officiel Pharnos.
5. Les 2-3 experts fondateurs des offres Expert/Senior (+ modalités de rev-share).
