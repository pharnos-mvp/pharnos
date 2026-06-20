# PLAN — Bibliothèque de Templates multilingue (RIM) · Tranche 1

> **Cadrage CTO (2026-06-18).** Fusionne le backlog **#2 (Bibliothèque Templates RIM)** et **#7
> (multilingue du document)**. Ne remplace PAS [PLAN.md](PLAN.md) (vision immuable). Chaîne :
> PLAN.md → ROADMAP-MVP → PLAN-RESTANT → **ce doc**. Décisions CEO (2026-06-18) intégrées.

## Décisions CEO verrouillées
- **Page « Bibliothèque »** dans le **menu latéral gauche**, regroupant **5 templates** : RCP, Notice,
  Étiquetage, **Lettre de demande (1.1.1)**, **PGHT (1.1.2)**.
- **Bilingue FR/EN**, traduction EN **suivant le référentiel MedDRA** + référence aux gabarits EN
  de `RA-source/Template/RCP/` (WHO SmPC 2016, Nigeria, Rwanda).
- **Accès ILLIMITÉ pour TOUS les plans (Free inclus)** — la bibliothèque et le remplissage des
  templates ne sont **jamais** derrière un gate ni un quota. _(La **compilation** reste métrée — c'est
  le livrable ; les templates = la rédaction, gratuite, levier d'acquisition/moat.)_
- **Par étapes** : l'anglais comme **langue de soumission** (livrable EN) + **marchés anglophones**
  CEDEAO + **versions org réutilisables** = **phases ultérieures** (pas Tranche 1).

## 1. Objectif & métrique
- **Objectif** : une **Bibliothèque de templates** (5 documents officiels) accessible à tous, où
  chaque template se consulte et se remplit en **FR ou EN** (EN aligné MedDRA), le français restant
  la langue de soumission UEMOA (nudge avant compile). = la 1ʳᵉ brique du **moat RIM**.
- **Succès (MVP livré)** : depuis le menu gauche, n'importe quel plan ouvre la Bibliothèque, prévisualise
  les 5 templates, en bascule un (ex. RCP) **FR↔EN** et le remplit **sans perte de saisie** ni titre EN
  inventé (porté verbatim du SmPC officiel) ; export DOCX/PDF + compile corrects dans la langue choisie.

## 2. Scope (Tranche 1)
1. **Infra bilingue mono-modèle** : `Localized = string | {fr,en}` + résolveur `locText(v, lang)` (repli FR) ;
   `FormBlock.text/ph/label/options/items/before/suffix` deviennent `Localized`. **Clés (`key`) inchangées**.
2. **5 templates dans le système de form-models** : RCP/Notice/Étiquetage (existants → ajout EN) +
   **Lettre de demande + PGHT** (portés des modèles actuels `templates.ts`/`template-fill.ts`, + EN). Auto-
   remplissage dynamique des lettres (destinataire/ville/date/formule par pays) **préservé**.
3. **Contenu EN MedDRA** : titres/mentions/placeholders EN **portés verbatim** des SmPC EN officiels
   (`RA-source/Template/RCP/`) ; terminologie médicale verrouillée sur le référentiel **MedDRA** déjà
   présent (`_shared/pharma-glossary.ts` : 27 SOC EN↔FR, fréquences CIOMS).
4. **Page « Bibliothèque »** (nav latérale gauche, **ungated**) : liste les 5 templates + **aperçu**
   read-only de chacun avec **bascule FR/EN** (référence réglementaire, zéro hallucination).
5. **Langue du document** : état du formulaire, **défaut = langue de soumission du pays**
   (`officialLanguage`, FR UEMOA), **persistée** dans le `content` TipTap (attrs, comme `formGlobals`) ;
   honorée par rendu compilé + exports DOCX/PDF.
6. **Nudge soumission** : constat **Monitor déterministe** « langue du document ≠ langue de soumission
   du <pays> → fournir la version <FR> avant compilation » (non bloquant, pattern existant).

## 3. Non-goals (PAS maintenant)
- L'anglais comme **langue de soumission / livrable** + **pays anglophones** CEDEAO (agences/CTD/
  lettres/couvertures EN) → phase (b).
- **Versions org réutilisables** (table `org_templates`, l'org sauvegarde ses variantes) → phase RIM 2.
- **Traduction IA des VALEURS saisies** FR↔EN (réutilisation `translate`) → phase 2.
- Gating/quota sur les templates (décision : **illimité tous plans**). Migration DB (**aucune** en T1).
- Templates hors des 5 (le reste du CTD reste inchangé).

## 4. Architecture & stack
- **Bilingue mono-modèle** (≠ fichiers EN parallèles) — rationale : **clés partagées** ⇒ données
  indépendantes de la langue (zéro perte au basculement) et **zéro drift** structurel entre FR et EN.
- **MedDRA = `_shared/pharma-glossary.ts`** (déjà EN↔FR) comme **autorité terminologique** ; le contenu EN
  est **baké verbatim** dans les form-models (sourcé des SmPC EN de `RA-source/`), pas un import runtime
  côté front — rationale : zéro hallucination, validable par le CEO (expert RA), pas de couplage Deno→front.
- **Bibliothèque** = nouvelle route + entrée nav `app-shell` + page qui rend les form-models en **aperçu
  read-only** (réutilise le moteur `TemplateFillForm` en mode lecture) avec toggle FR/EN — rationale :
  une seule source de rendu (form-models), cohérence garantie avec la saisie réelle.
- **Langue du doc** : `officialLanguage(country)` (roadmap-data) = langue de soumission ; défaut du toggle.
- **Stack inchangé** : React 19 / TS strict / TipTap / pdf-lib / docx. **0 nouvelle dépendance, 0 migration
  (T1), 0 Edge** — rationale : time-to-MVP, boring tech, réversible.
- _Design contenu (front + form-models) → pas de `solution-architect` (aucune décision système non triviale)._

## 5. Milestones (tranches verticales, chacune livrable)
| # | Tranche | Contenu | Effort |
|---|---------|---------|--------|
| **M1 ✅** | **Infra bilingue + page Bibliothèque + RCP EN** | `Localized`+résolveur ; toggle FR/EN + persistance ; **page « Bibliothèque » (ungated)** listant les 5 + aperçu ; **RCP bilingue** (EN verbatim SmPC, MedDRA) ; exports/compile honorent la langue ; **test : toggle préserve la saisie**. | ~1–1,5 s |
| **M2 ✅** | **Notice + Étiquetage EN** | M2a Étiquetage (#194) + **M2b Notice/PIL** (EMA QRD : prose patient dynamique EN — take/use, HCP, subSelect mappé FR→EN par index ; 3 surfaces preview/print/docx) livrés → **3 templates produit bilingues** (RCP + Notice + Étiquetage). FR (langue de soumission) inchangé. | ~0,5–1 s |
| **M3 ✅** | **Lettre de demande + PGHT bilingues (éditeur dédié)** | Lettres 1.1.1/1.1.2 bilingues FR/EN (additif, **FR dossier/pilote inchangé**) + **éditeur standalone Bibliothèque** : sélecteur pays (8 UEMOA) → destinataire/agence/civilité/ville **auto** ; aperçu A4 + PDF/DOCX (lazy) + Enregistrer. Renderers génériques (zéro duplication de contenu). **Bibliothèque 5/5.** **Redesign M3.1 (inline)** : A4 à **cases remplissables directement** (comme RCP/Notice) + barre d'en-tête hors-template (pays · **désignation autorité** modifiable · **produit catalogue→auto-sync OU manuel**) + **nom/poste auto du profil** + **devise PGHT** (FCFA/Naira/Cedi/Dirham/Euro/USD/GBP/AUD). **Reste Tranche 2** : insertion **1-clic en-tête/pied + signature** (images branding). | ~1 s |
| **M4** | **Nudge langue de soumission** | `submissionLanguage` par pays + constat Monitor « langue doc ≠ soumission » + nudge avant compile. | ~0,3 s |
| **(Différé)** | **RIM avancé** | `org_templates` (versions org réutilisables) ; **traduction IA des valeurs** FR↔EN ; **virage (b)** EN-livrable + pays anglophones. | phase 2 |

## 6. Risques & mitigations (top 3)
1. **Fidélité EN / zéro hallucination** → port **verbatim** des SmPC EN de `RA-source/` + verrou MedDRA
   (`pharma-glossary`) ; **validation CEO** ; templates **read-only**. (En-têtes SmPC EN = standard EMA/OMS,
   risque faible — le RCP KV lu était déjà en EN avec ces titres.)
2. **Perte de saisie au basculement de langue** → mono-modèle à **clés partagées** + **test dédié**
   (toggle FR↔EN préserve `values/checks/selects`).
3. **Régression des lettres** (auto-remplissage destinataire/ville/formule par pays, 8 pays) au portage
   1.1.1/1.1.2 vers form-models bilingues → préserver la logique de génération + **recette 8 pays FR & EN**.

## 7. Definition of Done
- Page **« Bibliothèque »** en nav gauche, **ungated (tous plans, illimité, offline)**, liste + aperçu des **5** templates.
- 5 templates **bilingues FR/EN** (EN verbatim SmPC, **MedDRA**-verrouillé, **validé CEO**), toggle, **0 perte de
  données** (test), défaut = langue de soumission (FR UEMOA).
- Lettre de demande + PGHT portées, **auto-remplissage par pays intact** (FR & EN).
- Exports DOCX/PDF + compile corrects FR & EN ; **nudge Monitor** « langue ≠ soumission ».
- **0 migration** (T1) ; `typecheck`·`lint`·`format`·**tests**·`build`·`budget` verts ; **recette navigateur prod** ;
  revue `cto:code-reviewer` = **SHIP**.

## 8. Prochaine étape recommandée
**M1 + M2 + M3 livrés** (RCP, Étiquetage, Notice/PIL bilingues + lettres Cover/PGHT bilingues avec
éditeur standalone inline & destinataire auto par pays). **Bibliothèque 5/5.** **Reste : Tranche 2 lettres**
(insertion 1-clic en-tête/pied + signature, images branding) **puis M4** : `submissionLanguage`
par pays + constat Monitor « langue du document ≠ langue de soumission du pays » + nudge avant compilation.
