# Référentiel eCTD / eSubmission CEDEAO-OOAS — ce qui est exploitable pour Pharnos

Source : portail officiel **https://ectdportal.wahooas.org/** (OOAS/WAHO), dépouillé le 2026-07-30.
Sources archivées dans `RA-source/eCTD-CEDEAO/` (spécifications FR, critères de validation, Q&A, listes définies XML, JAP).

> **Statut de version.** Le portail ne publie que la **v1.0 (août 2023)**. La spécification annonçait
> une v2.0 pour novembre 2024 : elle n'est pas en ligne. Les dates du calendrier de transition sont
> par ailleurs **contradictoires dans le texte officiel** (v2.0 « seule version acceptée après le
> 1er mai 2024 » alors qu'elle est publiée en novembre 2024). À vérifier auprès de `eCTD@wahooas.org`
> avant toute promesse commerciale datée.

---

## 1. Ce que c'est, et pourquoi ça compte

L'OOAS a publié le **Module 1 régional officiel de la CEDEAO** — pas une recommandation, une
spécification avec DTD, listes définies XML, matrice de documents et **critères de validation
exécutables**. Deux formats coexistent :

| Format | Ce que c'est | Outillage requis |
| --- | --- | --- |
| **eCTD** | Backbone XML ICH 3.2 + backbone régional `wa-regional.xml`, checksums MD5, cycle de vie par opérations (`new`/`replace`/`delete`/`append`) | Logiciel de publication eCTD (LORENZ, Vector) |
| **eSubmission** | Arborescence de dossiers + **nomenclature de fichiers imposée** + `envelope.xml`. Format transitoire. | « Rien de plus qu'une suite bureautique » — c'est le pitch officiel |

Calendrier annoncé (v1.0) : eCTD et eSubmission acceptés à partir du **1er novembre 2023** ;
eSubmission **plus accepté à compter du 1er mai 2026** → à date d'aujourd'hui (juillet 2026),
la CEDEAO est officiellement **eCTD-only** en procédure centralisée.

**Conséquence directe pour Pharnos** : il existe, maintenant, un écart de conformité de marché.
Les industriels d'Afrique de l'Ouest francophone qui déposaient en PDF/papier n'ont ni l'outillage
ni la compétence eCTD, et l'unique utilitaire gratuit officiel s'obtient **par mail** auprès d'un
prestataire (`ECOWAS@VectorTech.africa`).

---

## 2. Les 16 destinataires officiels (`recipient.xml`) — codes canoniques

| Code | Valeur officielle | Code | Valeur officielle |
| --- | --- | --- | --- |
| `wa` | ECOWAS-WAHO | `lr` | Liberia–LMHRA |
| `bj` | Benin-ABRP | `ml` | Mali–DPM |
| `bf` | Burkina Faso-ANRP | `ne` | Niger–ARP |
| `cv` | Cabo Verde–ERIS | `ng` | Nigeria–NAFDAC |
| `ci` | Côte d'Ivoire–AIRP | `sn` | Senegal-ARP |
| `gm` | The Gambia–MCA | `sl` | Sierra Leone–PBSL |
| `gh` | Ghana–FDA | `tg` | Togo–DPM |
| `gn` | Guinea–DNPM | `common` | Common |
| `gw` | Guinea Bissau–DGFDSL | | |

Règles : code ISO-2 minuscule ; `wa` pour ce qui est commun/centralisé ; **`common` interdit dans
l'enveloppe**, réservé aux attributs de rubrique. Trois langues officielles validées : `en`, `fr`, `pt`.
Statut de traduction : `trans-type-orig` / `trans-type-trans`.

Autres listes : `application-type` (`app-type-cp` centralisée / `app-type-np` nationale /
`app-type-rp` reliance) · `sequence-type` (Initial, Supplementary Information, Response, Closing
Information, Submission Withdrawal) · `submission-lead` (8 valeurs, préfixe du n° de soumission —
`pm` pharmaceutique, `pv` pharmacovigilance…) · `contact-type` (6 valeurs) · `submission-type`
(**33 types d'activité réglementaire**, de `sub-type-na-nce` à `sub-type-app-withdrawal`).

---

## 3. La Document Matrix — le barème officiel, machine-lisible

`document-matrix.xml` croise **96 sections × 33 types de soumission** et attribue à chaque case
un niveau d'exigence. C'est exactement la structure d'un barème de checking, publié par l'autorité :

| Code | Sens | Effet si le document manque |
| --- | --- | --- |
| `E` | **Error / requis** | Erreur de validation → **rejet de la séquence** |
| `W` | **Warning / attendu** | Avertissement, peut mener au rejet |
| `P` | **Possible** | Requis dans certaines circonstances ; listé pour le screening |
| `XE` / `XW` | Exclu (erreur / avertissement) | Le document **ne doit pas** être fourni |
| `NV` | Not Validated | Présence/absence non contrôlée |

Répartition observée : 364 `E`, 77 `W`, 396 `P`, 1 177 `NV`.

Corollaires opérationnels tirés des spécifications :
- Une justification est **exigée dans la lettre d'accompagnement** pour tout contenu `W` ou `P` absent.
- Il est **interdit** de justifier l'absence d'un contenu marqué `NV`.
- Les documents « sans contenu substantiel » (page « not applicable ») sont **interdits** : un
  nombre excessif peut faire rejeter la séquence même si la validation passe.

`submission-type-matrix.xml` complète le tableau : des **regex de compatibilité** disent quelles
variations mineures peuvent être regroupées dans une même soumission (ex. changement de
formulation + nouveau type de conditionnement + changement de nom commercial + PV sont
groupables ; toute activité majeure ou nouvelle AMM ne se groupe avec rien). En eSubmission le
groupage est **interdit** — une séquence par soumission.

---

## 4. Les 200+ critères de validation — dont une trentaine que Pharnos peut exécuter

`ECOWAS-WAHO eApplications Validation Criteria v1.0.xlsx` : critères numérotés, trilingues,
avec gravité (`Error` = rejet, `Warning` = à justifier, `Info`) et applicabilité (eCTD / eSub).

### 4.1 Contrôles PDF (§6) — directement exécutables côté navigateur avec pdf.js

| Critère | Gravité | Exigence |
| --- | --- | --- |
| 6.4.2 / 6.4.3 | **Error** / Warning | Version PDF **1.4 à 1.7**. Toute version < 1.4 → rejet de **toute** la séquence |
| 6.4.4 | **Error** | Aucune protection par mot de passe |
| 6.4.1 | Warning | Aucun paramètre de sécurité (restriction de copie incluse) |
| 6.4.5 | Warning | Pas de pièces jointes dans le PDF |
| 6.4.8 | Info | Aucune annotation autre que signets et hyperliens |
| 6.4.6 | Warning | Vue initiale : volet des signets ouvert, zoom et mise en page par défaut |
| 6.4.7 | Warning | **Fast Web View** (linéarisation) activé |
| 6.2.9 | Warning | Signets présents dans tout document > 5 pages à sections multiples (hors références biblio) |
| 6.2.8 / 6.3.7 | Warning | Signets **et** hyperliens en `Inherit Zoom` |
| 6.2.1–6.2.7 / 6.3.1–6.3.6 | Warning | Liens relatifs, actifs, non rompus, action unique, aucune destination web/e-mail |
| 6.1.1 | **Error** | PDF lisible |

Hyperliens **obligatoires** (recherchés par le validateur) dans : **1.3.1 RCP**, **1.0.5 Réponse**,
**1.2.3 Certificats (COA, CEP…)**.

### 4.2 Fichiers, dossiers, chemins (§2)

- Noms de dossiers et de fichiers : **`a-z` et `0-9` minuscules uniquement**, tiret `-` seul
  caractère spécial toléré, **aucun espace, aucune majuscule, aucun accent**.
- **Longueur de chemin ≤ 180 caractères** à compter du numéro de séquence (plus strict que l'ICH).
- Dossiers d'attribut ≤ 64 caractères.
- **Dossiers vides interdits** (Error). Structures de dossiers supplémentaires **interdites** en eSubmission.
- Dossier de séquence sur **4 chiffres** ; première séquence `0001` ; baseline `0000`.
- **`validation-report.*` obligatoire** dans `NNNN-workingdocuments` — son absence est une **Error
  entraînant rejet** (critère 2.2.5).

### 4.3 Existence de contenu (§4.6) — quelles que soient les circonstances

| Critère | Gravité | Exigence |
| --- | --- | --- |
| 4.6.1 | **Error** | 1.0.1 Lettre d'accompagnement doit exister |
| 4.6.2 | **Error** | 1.0.3 Tableau de suivi du cycle de vie doit exister |
| 4.6.3 / 4.6.4 | **Error** | 1.0.4 et 1.0.5 doivent exister si le type de séquence est « Response » |
| 4.6.5 | **Error** | 1.2.6 Déclaration électronique doit exister |
| 4.6.6 / 4.6.7 | Warning | **Fichiers sources** (Word/RTF) fournis pour les informations produit |
| 4.6.eSub1 | **Error** | 1.1 Table des matières des opérations de cycle de vie (eSubmission seulement) |

**4.6.6/4.6.7 valide la stratégie de livrable actuelle du module Upgrade RCP** : les
spécifications exigent le **fichier Word en plus du PDF** pour 1.3.1 RCP, 1.3.2 Notice et
1.3.3 Étiquetage. Les hyperliens doivent être dans les PDF, pas dans les Word.

### 4.4 Cycle de vie (§4.5) — attributs d'opération imposés par rubrique

La lettre d'accompagnement (4.5.9), la note à l'évaluateur (4.5.10), le tableau de suivi (4.5.11/4.5.12),
les formulaires de frais (4.5.14), le RCP (4.5.15), la notice (4.5.16), l'étiquetage (4.5.17),
l'étiquetage étranger (4.5.18), le produit de référence (4.5.19) et le statut réglementaire (4.5.20)
ont chacun un attribut d'opération **contraint** (typiquement : `new` à la première occurrence puis
`replace` obligatoire). Toute opération de branchement (`append` / `delete` / `replace` créant une
branche) est une **Error**.

---

## 5. Nomenclature eSubmission — l'arborescence complète est publiée

L'onglet **« eSubmission Folder-File Names »** des critères de validation donne, ligne par ligne
et pour tout le CTD (m1 → m5), le nom exact de chaque dossier et de chaque fichier. Extrait Module 1 :

```
f-wa-22-99991/                     ← dossier Application = numéro de demande
  0001/                            ← dossier de séquence, 4 chiffres
    m1/
      wa/                          ← dossier régional Afrique de l'Ouest
        envelope.xml
        100-correspondence/
          1001-cover/<cc>/cover-letter-<lc>-<var>.pdf
          1002-rev-note/reviewer-note-<var>.pdf
          1003-tracking-table/tracking-table-<var>.pdf
          1004-auth-corr/<cc>/authority-correspondence-<var>.pdf
          1005-response/<cc>/response-<lc>-<var>.pdf
          1006-meeting-info/…  1007-appeal/…
        101-toc-lco/toc-life-cycle-operations.pdf
        102-admin-info/1021-app-form/<cc>/application-form-<var>.pdf … 102a-additional-admin-info/
        103-prod-info/1031-smpc/<cc>/10311-smpc-appr/103111-smpc-appr-en/smpc-approved-en-<var>.pdf
                      1032-pil/… 1033-labels/… 1034-foreign-label/… 1035-ref-prod-label/… 1036-artwork/
        104-info-experts/  105-specific-requirements/  106-environ-risk-assess/
        107-gmp/  108-info-relating-to-pv/  109-ind-pat-data/  110-info-experts/  10a-add-data/
      m2/ m3/ m4/ m5/ util/
  0001-workingdocuments/validation-report.pdf
```

Règles de nommage à retenir :
- Un **`0` est inséré** devant le numéro de section de 2e niveau pour que l'explorateur Windows trie
  correctement : la section 1.2 devient le dossier `102`.
- Le préfixe du numéro de demande distingue les formats : **`e-`** pour eCTD, **`f-`** pour eSubmission
  (ex. `e-wa-23-12345` / `f-wa-22-99991`). Format : `<préfixe>-<pays>-<AA>-<numéro>`.
- Le **composant variable `<var>` du nom de fichier est validé** : une numérotation ICH
  (`analytical-procedure-1.pdf`) déclenche un **avertissement**, parce qu'en eSubmission l'évaluateur
  ne voit que le nom du fichier — il n'y a pas de `leaf title`. Le composant variable **peut être en
  français**.
- Modules 4 et 5 : les rapports d'étude se nomment par **identifiant d'étude + description courte**,
  pas `study-report-1`. Les références bibliographiques par **auteur + année**, pas `reference-1`.
- Granularité Module 1 : **le niveau le plus bas défini**. Jamais un document multilingue —
  un fichier par langue.

`envelope.xml` (eSubmission : placé dans `m1/wa/`) porte : `application` (+ type, uuid, recipient,
lead-nmra, application-number(s), applicant-id, applicant-name, inn(s), proprietary-name(s)),
`submission` (+ submission-lead, submission-number(s)), `sequence` (+ description, date, numéro,
numéro de séquence liée), `contact` (n occurrences typées).

---

## 6. Écart avec le référentiel Pharnos actuel

`web/src/features/workspace/module1-tree.ts` (`MODULE1_ECTD_CEDEAO`) dérive déjà de cette
spécification, mais c'est un **sous-ensemble**. Manquent, par rapport aux Heading Elements officiels :

| Section officielle | État dans Pharnos |
| --- | --- |
| 1.1 Comprehensive TOC of Life Cycle Operations | absente (eSubmission uniquement, mais **Error** dans ce format) |
| 1.2.A Additional Administrative Information | absente |
| 1.3.1.1→1.3.1.3, 1.3.2.1→1.3.2.3, 1.3.3.1→1.3.3.3 (Approved / Clean / Annotated × en/fr/pt) | absentes — Pharnos s'arrête à 1.3.1 / 1.3.2 / 1.3.3 |
| 1.3.4 Foreign Labelling (4 sous-nœuds) | absente |
| 1.3.5 Reference Product Labelling (4 sous-nœuds) | absente |
| 1.3.6 Artwork and Samples (2 sous-nœuds) | absente |
| 1.4.1 Quality / 1.4.2 Nonclinical / 1.4.3 Clinical | absents (1.4 sans enfants) |
| 1.5 + 1.5.1 Bioequivalence Trial Information | absentes |
| 1.6 + 1.6.1 Non-GMO / 1.6.2 GMO | absentes |
| 1.7.1 Date d'inspection / 1.7.2 Rapports d'inspection | absents |
| 1.A + 1.A.1 Additional Data | absentes |

Codes à corriger : `m1-4-experts` → **`m1-4-info-experts`** ; `m1-7-3-gmp-certs` →
**`m1-7-3-gmp-certificates`**.

Absent du modèle de données : les **trois attributs de rubrique** exigés par la DTD —
`Country` (1.0.1, 1.0.4, 1.0.5, 1.2.1, 1.2.2, 1.3.1, 1.3.2, 1.3.3, 1.A),
`Translation Status` (tous les nœuds feuille de langue de 1.3.1 à 1.3.5),
`Language` (1.A.1 et, en pratique, tout leaf du Module 1 — critère 4.4.5, Warning si absent).

---

## 6bis. `util.zip` — la DTD est la source normative, et elle est complète

`util.zip` (14 Ko, archivé dans `RA-source/eCTD-CEDEAO/util/`) contient les six fichiers qui doivent
être **livrés verbatim dans le dossier `util/` de chaque séquence eCTD** :

```
util/dtd/wa-regional.dtd     ← Module 1 régional CEDEAO (100 éléments)
util/dtd/wa-envelope.mod     ← structure de l'enveloppe
util/dtd/wa-leaf.mod         ← élément leaf + node-extension
util/dtd/ich-ectd-3-2.dtd    ← modules 2 à 5 (ICH 3.2)
util/style/wa-regional.xsl   ← feuille de style du backbone régional
util/style/ectd-2-0.xsl      ← feuille de style ICH
```

**`wa-regional.dtd` est la source la plus fiable du référentiel** — plus que le tableau du PDF et
bien plus que `document-matrix.xml`. Elle donne, de façon normative et machine-lisible :

- les **100 noms d'éléments** du Module 1 régional ;
- la **cardinalité** de chaque nœud (`?` optionnel, `*` répétable, absence de suffixe = obligatoire).
  Exemple : sous `m1-wa`, seul `m1-0-correspondence` est **obligatoire**, tout le reste est `?` ;
  `m1-0-1-cover-letter`, `m1-0-4-authority-correspondence` et `m1-0-5-response` sont `*` (répétables) ;
- les **attributs requis** par nœud : `country CDATA #REQUIRED` sur 1.0.1, 1.0.4, 1.0.5, 1.2.1, 1.2.2,
  1.3.1, 1.3.2, 1.3.3, 1.A — et `translation-status CDATA #REQUIRED` sur chaque nœud feuille de langue
  de 1.3.1 à 1.3.5 (les valeurs ne sont **pas** énumérées dans la DTD : elles viennent de la liste
  définie, `trans-type-orig` / `trans-type-trans`) ;
- la racine : `wa:ecowas-ectd` (`xmlns:wa="http://ecowas.wa"`, `dtd-version="1.0"` fixé) contenant
  `wa-envelope` puis `m1-wa` ;
- les attributs obligatoires d'un `leaf` : `ID`, `operation` (`new`|`append`|`replace`|`delete`),
  `checksum`, `checksum-type` — plus `modified-file`, `xlink:href`, `xml:lang` optionnels.

Deux enseignements décisifs :

1. **`m1-1` n'existe pas dans `m1-wa`** : la section 1.1 (table des matières des opérations de cycle
   de vie) est bien **exclusive à l'eSubmission**, ce qui confirme le critère 4.6.eSub1.
2. La DTD écrit **`m1-2-8-screening-details`** : le `m1-2.8-screening-details` du PDF de spécification
   est donc une coquille du PDF, et la matrice a raison. Le conflit est tranché.

## 7. Défauts des fichiers officiels — ne jamais les ingérer automatiquement

Le référentiel publié contient des erreurs vérifiables. Toute génération automatique d'un arbre
depuis `document-matrix.xml` produirait donc un arbre faux. Relevé :

- `sub-type-na-gen` apparaît **deux fois** dans chaque section de la matrice (libellé « New-OTC »
  puis « New-Generic ») et **`sub-type-na-otc` n'apparaît nulle part** : le type « New OTC » est
  absent de la matrice alors qu'il existe dans la liste définie.
- `sub-type-mn-ch-app-r` porte le libellé « Change-of-Proprietary-Name » (au lieu de
  « Change of Applicant-Relinquishing ») ; `sub-type-mn-ch-app-a` porte « Additional-Propietary-Name » (sic).
- Sections **absentes de la matrice** alors qu'elles existent dans les Heading Elements :
  1.1, 1.3.1.3 (Annotated SmPC + ses 3 langues), 1.3.2 et 1.3.2.1, 1.7.3.
- Section **1.9 dupliquée** dans la matrice.
- Libellés faux : 1.3.5.3 annoncé « English » alors que le code est `-pt` ; 1.3.2.3.2 annoncé
  « Clean - PIL - French » au lieu d'« Annotated » ; 1.3.3.3.2 « Annotated - Annotated - … ».
- Codes XML divergents entre la spécification et la matrice : **`m1-2.8-screening-details`** (avec un
  point) dans la spécification PDF contre `m1-2-8-screening-details` dans la matrice — **la DTD tranche
  en faveur de la matrice** (§6bis) ; 1.3.5.4 réutilise `m1-3-5-3-ref-prod-origin` (indice 3 pour la
  section 4).
- Onglet nomenclature eSubmission : 1.4.2 et 1.4.3 sont tous deux numérotés « 1.4.1 » ; le dossier
  de la section 1.10 est nommé **`110-info-experts`** (copie du libellé de 1.4).
- Coquilles de liste définie : `New-Strenth`, `Complimentary`, `New-Tissue-Master-File(TMPF)`.
- Critères de validation : les cellules anglaises de 4.5.11, 4.7.10c et 4.7.16a contiennent du
  **portugais** non traduit ; la définition de gravité « Warning » mentionne encore la **TGA**
  australienne (copier-coller de la spécification source).

---

## 8. Écosystème, tarifs, concurrence

**Portail de dépôt** : `ectd.wahooas.org` (login requis). L'`Applicant ID` et l'`Application Number`
s'y obtiennent ; l'Applicant ID est valable à vie, y compris après changement de nom de société.

**Procédure conjointe (JAP)** — 15 agences, autorité coordinatrice tournante (Nigeria/NAFDAC en
mars 2023), 10 étapes :

| Poste | Montant (mars 2023) |
| --- | --- |
| Screening | **500 USD** |
| Évaluation — demandeur d'Afrique de l'Ouest | **8 000 USD** |
| Évaluation — autre région d'Afrique | **10 000 USD** |
| Évaluation — hors Afrique | **12 000 USD** |
| Re-soumission après rejet à l'étape A2 | **+50 %** des frais d'évaluation |

Délais : **196 jours** en procédure standard, **60 jours** pour les produits préqualifiés OMS ou
approuvés par une SRA. Après notification d'approbation OOAS, le demandeur a **2 ans** pour
solliciter les 15 États membres, qui délivrent l'AMM en **60 jours maximum**.
Périmètre : liste OMS des médicaments essentiels, médicaments de programme, urgences de santé
publique, produits préqualifiés OMS / approuvés SRA, biologiques et produits sanguins (vaccins
inclus), dispositifs médicaux listés OOAS, produits vitaux, fournitures prioritaires OOAS.

**Concurrence outillage** : LORENZ Life Sciences et Vector Life Sciences sont les deux fournisseurs
listés par l'OOAS. Vector distribue l'**eSubmission Utility gratuit** (structure de dossiers +
`envelope.xml`), obtenu **par e-mail** à `ECOWAS@VectorTech.africa`. L'OOAS publie aussi un modèle
de cahier des charges (URS) pour l'achat d'un système eCTD.

Lecture : le terrain de l'outil de publication eCTD pur est occupé par des éditeurs installés et
coûteux. Le terrain **vide** est celui du contenu — Module 1 par pays, en français, avec le contrôle
de conformité avant dépôt. C'est déjà le positionnement de Pharnos ; ce référentiel lui donne
une base officielle citable.

---

## 9. Ce qu'il faut en faire — recommandations

1. **Compléter `MODULE1_ECTD_CEDEAO` aux 100 éléments officiels** et corriger les deux codes
   divergents. Source de vérité : **`wa-regional.dtd`** (§6bis) pour les noms d'éléments, la
   cardinalité et les attributs requis ; le tableau du PDF §4.4.1 pour les libellés ; **jamais**
   `document-matrix.xml` (§7). Ajouter au type `CtdNodeDef` : les trois attributs de rubrique
   (`country`, `language`, `translationStatus`) et la **cardinalité** (obligatoire / optionnel /
   répétable) — cette dernière est absente du modèle actuel et conditionne toute génération de backbone.
2. **Ingérer la Document Matrix comme barème** du Checking Standard, avec sa graduation
   `E`/`W`/`P`/`XE`/`XW`/`NV` par type de soumission. C'est le seul barème de la région qui soit
   officiel et publié : il transforme le score Pharnos en « conformité aux critères CEDEAO-OOAS
   v1.0 » plutôt qu'en jugement maison. Conserver la provenance de chaque case (règle déjà posée
   par le chantier référentiel : la provenance entre dans le verdict).
3. **Implémenter les contrôles PDF §6 dans le Checking Standard** : version PDF, chiffrement,
   annotations, vue initiale, linéarisation, signets > 5 pages, `Inherit Zoom`, liens rompus ou
   externes. pdf.js est déjà dans la stack. C'est mesurable, vérifiable, non falsifiable — l'exact
   opposé d'un score déclaratif, et l'argument le plus difficile à copier.
4. **Auditer nos propres PDF générés contre ces critères avant de les vendre** : version ≥ 1.4,
   absence de chiffrement, vue initiale, et surtout **Fast Web View** — la linéarisation n'est
   probablement pas activée par notre chaîne d'export. Un PDF Pharnos qui échoue aux critères
   CEDEAO serait un défaut produit majeur.
5. **Le CTD Builder doit produire une arborescence eSubmission conforme** : nomenclature exacte de
   l'onglet officiel, `envelope.xml`, suppression des dossiers vides, chemins ≤ 180 caractères,
   minuscules ASCII sans accent (la règle `storageObjectKey()` existante couvre déjà l'ASCII, il
   faut y ajouter la contrainte **minuscules** et la longueur de chemin), et le dossier
   `NNNN-workingdocuments` avec `validation-report.*`. C'est un livrable complet et vendable, face
   à un utilitaire officiel qu'on obtient par e-mail.
6. **Générer le rapport de validation** : son absence est une Error de rejet. Produire un
   `validation-report.pdf` qui liste les critères contrôlés et leur résultat est un livrable à part
   entière, et le complément naturel du Checking Standard.
7. **Aligner la nomenclature des agences** sur `recipient.xml` (codes + libellés officiels) partout
   où Pharnos nomme un pays ou une autorité, et ajouter `wa` (régional) et `common`.
8. **Exploiter `submission-type-matrix.xml` dans le moteur de variations** : les regex de
   compatibilité disent quelles variations mineures sont groupables. « Ces deux variations peuvent
   être déposées ensemble » est un conseil d'expert que le fichier officiel nous donne gratuitement.
9. **Argumentaire commercial** : les frais JAP (500 + 8 000 USD, +50 % en cas de re-soumission après
   l'étape A2) et le rejet automatique sur une seule Error de validation chiffrent le coût d'un
   dossier non conforme. Le prix de Pharnos se compare à ce coût, pas au temps passé.
10. **À vérifier auprès de `eCTD@wahooas.org`** avant toute communication datée : existence d'une
    v2.0, statut réel du basculement eCTD-only du 1er mai 2026, et calendriers nationaux de chaque
    État membre (la spécification renvoie aux plans nationaux, non publiés sur le portail).

---

## 10. Inventaire pour le moteur builder — ce qui est en main, ce qui manque

### 10.1 Builder eSubmission : intégralement spécifié, rien ne manque

| Besoin | Source en main |
| --- | --- |
| Arborescence complète m1 → m5 | onglet « eSubmission Folder-File Names », **498 lignes**, m1/m2/m3/m4/m5 + `NNNN-workingdocuments` |
| Nom de chaque fichier, composants fixes et variables | idem, avec la légende (gras = fixe, jaune = répétable unique, rouge = variable, bleu = optionnel) |
| Conventions m4/m5 | dossier `studynumber` obligatoire par étude ; fichiers `studynumber-iche3section-description.pdf` ; `5.3.5` sous-dossier `[indication]` ; `5.4` en `author-year.pdf` |
| `envelope.xml` | exemple officiel + structure normative `wa-envelope.mod` |
| Listes définies (destinataires, types, contacts, séquences, leads) | 8 fichiers XML |
| Règles de nommage et de chemin | §2.1/§2.2 des critères de validation + §4.1/§4.2 de la spéc eSubmission |
| Barème d'exigence par activité | `document-matrix.xml` + `submission-type-matrix.xml` |
| Contrôles à exécuter avant livraison | 200+ critères, dont §6 PDF |

**Aucun blocage.** Le format eSubmission n'exige ni backbone XML ICH, ni MD5, ni gestion
d'opérations de cycle de vie.

### 10.1bis Les Sample eCTDs officiels — golden master récupéré

`RA-source/eCTD-CEDEAO/samples/` (233 fichiers) contient les deux applications d'exemple publiées par
l'OOAS : `e-wa-23-99991` (séquences **0001 et 0002**) et `e-wa-23-99992` (0001). C'est la référence de
conformité la plus utile du corpus, parce qu'elle montre ce que la documentation ne dit pas.

**Ce que le sample enseigne, et qui n'est écrit nulle part :**

1. **Le dossier « pays » n'est pas le code ISO seul.** La feuille de nomenclature note « `cc` : ISO 2
   letter country code should be used ». Le sample écrit **`ecowas-waho-wa`** — le libellé de
   `recipient.xml` slugifié, **suffixé** du code. Pour le Bénin cela donnerait donc `benin-abrp-bj`.
2. **Le composant variable `-var` est omis** quand la section ne contient qu'un fichier :
   `cover-letter-en.pdf`, `reviewer-note.pdf`, `tracking-table.pdf`.
3. **DOCX et PDF cohabitent dans le même dossier feuille** pour le RCP :
   `.../10311-smpc-appr/103111-smpc-appr-en/smpc-approved-en.pdf` **et** `.docx`. C'est la mise en
   œuvre exacte des critères 4.6.6/4.6.7 — et exactement ce que produit le module Upgrade RCP.
4. **`index.xml` est minimal** : tout le Module 1 tient en **un seul leaf** ICH pointant vers
   `m1/wa/wa-regional.xml`, sous `m1-administrative-information-and-prescribing-information`.
   `index-md5.txt` ne contient que les 32 caractères du MD5 d'`index.xml`, sans nom de fichier.
5. **Réutilisation de fichiers par chemin relatif, y compris hors de la séquence et hors de
   l'application.** Dans la séquence 0002 :
   - `xlink:href="../../../0001/m1/wa/104-info-experts/1042-nonclinical/nonclinical.pdf"` → séquence
     antérieure de la même application ;
   - `xlink:href="../../../../e-wa-23-99992/0001/m1/wa/.../clinical.pdf"` → **une autre application**.

   C'est ce que mesurent les critères 3.3.4/3.3.5 et 4.3.4/4.3.5. Conséquence pour le builder : il
   doit savoir référencer un fichier déjà déposé ailleurs et calculer le chemin relatif — pas
   seulement empaqueter ses propres fichiers.
6. **Un même fichier peut être référencé par deux leaves distincts** (même `checksum`, `ID` et
   `title` différents) : `quality.pdf` sert à la fois en 1.4.1 et en 1.4.3.
7. **Le rapport de validation est bien préfixé** : `0001-workingdocuments/0001-validation-report.txt`.
   Le sample tranche l'ambiguïté relevée en §10.3 **en faveur de la feuille de nomenclature**. Son
   contenu est d'ailleurs explicite : « If no real report is provided, the sequence will be rejected. »
8. **Les opérations du cycle de vie du sample sont conformes** : en procédure centralisée, la lettre
   d'accompagnement (4.5.9) **et** le tableau de suivi (4.5.12) doivent être `new` à chaque séquence —
   c'est bien ce que fait la séquence 0002. Seule la procédure **nationale** exige `replace` sur le
   tableau de suivi (4.5.11).

**Deux réserves.** Le titre du leaf d'`index.xml` porte « ECOWAS v1.0 **(DRAFT)** » : ce sont des
exemples de travail. Et surtout, le sample **contredit la feuille de nomenclature** sur un nom de
dossier : il écrit **`103-med-info`** là où la feuille impose **`103-prod-info`**. Or les critères
2.eSub.1/2.eSub.2 font du nom de dossier une **Error**. À faire trancher par l'OOAS ; en attendant,
suivre la feuille de nomenclature, qui est le document normatif cité par les critères de validation.

### 10.2 Builder eCTD réel : il manque les spécifications ICH, qui sont hors de ce portail

En main : `wa-regional.dtd` (structure, cardinalité, attributs), `wa-leaf.mod` (attributs de leaf,
`operation` obligatoire), `wa-envelope.mod`, les deux XSL, les contraintes d'opération par rubrique
(critères 4.5.9 → 4.5.20), l'obligation de MD5 et sa portée (critères 3.2.1–3.2.3, 4.2.1–4.2.2).

À obtenir ailleurs :

1. ~~**ICH eCTD Specification v3.2.2**~~ — **récupérée**, `RA-source/eCTD-ICH-v3.2.2/` (ICH M2 EWG,
   16 juillet 2008). Les 8 annexes sont dans le même PDF : **A1** architecture, **A2** la soumission,
   **A3** considérations par module, **A4** organisation des fichiers (noms de dossiers m2→m5),
   **A5** informations régionales, **A6** la soumission XML (`index.xml`), **A7** formats de
   soumission — celle que la spéc CEDEAO cite pour les hyperliens — et **A8** la DTD eCTD.
   *Note : le serveur `estri.ich.org` sert une chaîne de certificats non approuvée ; le fichier a été
   récupéré en HTTP simple puis vérifié par son en-tête (« ICH eCTD Specification V 3.2.2 »).*
2. ~~**ICH M4(R4)**~~ — **récupérée**, `RA-source/eCTD-ICH-M4/M4_R4__Guideline.pdf` (Step 4, annexe
   Granularité adoptée le 15 juin 2016, codification M4(R4)). Récupérée avec la famille : **M4Q(R1)**
   qualité, **M4S(R2)** sécurité, **M4E(R2)** efficacité.

   **Point décisif** : l'annexe Granularité contient **deux jeux de tableaux**, et il faut prendre
   les bons — **Tables 1, 2, 5 et 6 pour eCTD v3.2.2** (donc pour la CEDEAO) ; Tables 3, 4, 5 et 6
   pour eCTD v4. Table 1 = Module 2, Table 2 = Module 3, Table 5 = Module 4, Table 6 = Module 5.

   **Invariant à porter dans le modèle de données** : « Once a granularity option is chosen, continue
   with that option during the application's lifecycle. » Le niveau de granularité retenu pour 3.2.S
   et 3.2.P se décide **une fois par Application** et doit être **persisté**, pas rejoué à chaque
   séquence. Trois cas à représenter par niveau : granularité interdite (« documents rolled up to
   this level are not considered appropriate »), autorisée (« one or multiple documents can be
   submitted at this level »), et **interdite en eCTD mais rédigeable** (« documents may not be
   submitted at this level for eCTD submissions … but must be submitted at the higher level »).
3. ~~**Sample eCTDs de la CEDEAO**~~ — **récupérés**, voir §10.1bis.
4. **Portal Process Guide** (PDF sur `ectd.wahooas.org`) — obtention de l'Applicant ID et de
   l'Application Number, procédure d'upload. *Nécessaire pour le parcours utilisateur, pas pour le
   moteur.*
5. **ICH Specifications for Study Tagging Files** — *optionnel* : l'OOAS déclare explicitement ne pas
   exiger de STF (§3.5).
6. **Directives nationales de chaque État membre** — référencées partout dans la spécification
   (formulaires de demande, frais, exigences linguistiques par pays) mais **non publiées sur le
   portail**. C'est le seul manque que Pharnos ne peut pas combler par téléchargement : il faut le
   corpus pays, que `RA-source/` construit déjà.

**Bilan : il ne manque plus aucune spécification technique.** Le corpus `RA-source/` couvre désormais
la chaîne complète — CEDEAO (spécifications, critères, listes, DTD, samples), ICH v3.2.2, ICH M4 et sa
famille, plus eCTD v4 en veille. Le seul manque restant n'est pas technique : ce sont les **directives
nationales par État membre**, non publiées, à constituer pays par pays.

Contrainte d'architecture, pas d'information manquante : le cycle de vie eCTD impose de conserver
**l'historique complet des leaves par Application** (chaque `replace`/`delete` pointe vers l'ID du
leaf modifié via `modified-file`, à travers les séquences). Un builder qui ne persiste pas cet
historique ne peut pas produire une séquence 0002 valide.

### 10.3 Défaut supplémentaire relevé — tranché par le sample

L'onglet de nomenclature nomme le rapport de validation **`0001-validation-report.*`** (préfixé du
numéro de séquence) alors que la spécification §4.6.3 exige **`validation-report.*`** sans préfixe.
Le critère 2.2.5 en fait un rejet. **Le sample officiel écrit `0001-validation-report.txt`** : c'est
la forme préfixée qui fait foi.

### 10.4 eCTD v3.2.2 et eCTD v4.0 sont deux normes différentes — ne pas les confondre

`RA-source/eCTDV4/` contient le paquet ICH **eCTD v4.0** complet (Implementation Guide v1.6,
vocabulaires contrôlés Genericode, schémas HL7, critères de validation v1.5). **Il ne sert pas au
builder CEDEAO.** eCTD v4.0 est bâti sur HL7 RPS : plus de backbone `index.xml`, plus de sémantique
portée par l'arborescence de dossiers, mais des *Context of Use* et des vocabulaires contrôlés — un
modèle de données entièrement différent.

La CEDEAO est sur **v3.2.2** : `util/dtd/ich-ectd-3-2.dtd`, `util/style/ectd-2-0.xsl`,
`dtd-version="3.2"` dans `index.xml`. Le corpus v4 reste utile comme **veille** (c'est la cible ICH à
terme, et la v2.0 des spécifications CEDEAO pourrait s'en rapprocher), pas comme source
d'implémentation aujourd'hui.

---

## 11. Éditeurs cités par l'OOAS — ce que « LORENZ » signifie exactement

Le portail se contente de nommer deux fournisseurs, sans produit ni lien, comme
« eCTD vendors common in most markets », avec un avertissement explicite : l'OOAS
**ne cautionne ni ne recommande** aucun d'eux, la due diligence appartient au demandeur. La
spécification va plus loin (§5.1) : la CEDEAO **n'impose aucun logiciel**, tout eCTD conforme
fonctionne avec toute solution d'évaluation conforme — et ajoute : « Attention aux fournisseurs de
solutions qui prétendent le contraire. » Un éditeur souhaitant être listé écrit à `eCTD@wahooas.org`
avec des références clients.

- **LORENZ Life Sciences Group** — éditeur allemand (Francfort) fondé en 1989, l'un des acteurs
  historiques de l'eCTD. Deux produits structurent le marché : **docuBridge** (publication et revue
  de soumissions sur tout le cycle de vie) et **eValidator** (validation technique, le validateur le
  plus utilisé à la fois par l'industrie et par les agences — la FDA l'utilise au CDER et au CBER).
- **Vector Life Sciences** — également listé, et c'est ce prestataire qui distribue l'**eSubmission
  Utility gratuit** de la CEDEAO (`ECOWAS@VectorTech.africa`).

Lecture concurrentielle : ce sont des **outils de publication et de validation techniques**, vendus
au grand laboratoire, pas des outils de contenu réglementaire régional. Ils ne rédigent pas un
Module 1 béninois, ne connaissent pas les barèmes PGHT, ne produisent pas un RCP en français.
Pharnos ne les affronte pas sur leur terrain — mais deux points méritent d'être notés :
son moteur de conformité doit être **cohérent avec eValidator** (c'est lui qui arbitrera en pratique
chez l'autorité), et un client équipé de docuBridge reste un client Pharnos pour le contenu.
