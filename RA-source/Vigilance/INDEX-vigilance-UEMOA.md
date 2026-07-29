# Vigilance UEMOA — mention imposée en rubrique 4.8 du RCP

Index de ce que les sources de ce dossier établissent **de manière vérifiable**. Destiné à alimenter
`supabase/functions/_shared/conformity-specs.ts` (mentions par pays).

> ⚠️ Aucun contact n'est reporté ici s'il ne figure pas explicitement dans la source citée.
> Une adresse de vigilance inventée serait recopiée dans des dossiers d'AMM réels.

## Mention à produire, par pays — arbitrage CEO du 29/07/2026

**Décision : l'adresse électronique seule suffit.** Téléphones, sites et canaux annexes sont
documentés plus bas pour le rapport d'upgrade, mais n'entrent pas dans la rubrique 4.8 — une mention
réglementaire courte vieillit mieux qu'une liste de canaux.

| Pays | Mention en rubrique 4.8 | Source |
|---|---|---|
| **Bénin** (BJ) | Agence béninoise du Médicament et des autres produits de Santé – e-mail : `vigilances.abmed@gouv.bj` | `Template/RCP/ABMed_Maquette RCP_2026.pdf` |
| **Côte d'Ivoire** (CI) | Autorité Ivoirienne de Régulation Pharmaceutique – e-mail : `pharmacovigilance@airp.ci` | `AIRP LIGNES DIRECTRICES - VIGILANCES 2025.pdf` |
| **Sénégal** (SN) | Agence sénégalaise de Réglementation pharmaceutique – e-mail : `vigilances@arp.sn` | `SENEGAL_GUIDE-DE-BONNES-PRATIQUES-DE-PHARMACOVIGILANCE-1.pdf` § II.3.2 |
| **Burkina Faso** (BF) | Formule neutre, **complétée de l'application nationale Med Safety** | organisme sourcé ; aucun contact publié |
| **Mali** (ML) · **Niger** (NE) · **Togo** (TG) · **Guinée-Bissau** (GW) | Formule neutre | aucun contact publié dans les sources déposées |

## Organismes et canaux — pour le rapport d'upgrade, pas pour le RCP

| Pays | Organisme | Canaux documentés | Source |
|---|---|---|---|
| Bénin | ABMed | — | maquette RCP 2026 |
| Côte d'Ivoire | AIRP | standard +225 27 22 22 01 55 · `www.airp.ci` · applications **MedSafety, Vigimobil, DHIS2** | lignes directrices AIRP 2025 |
| Sénégal | ARP | téléphone (appel ou **SMS**) · de vive voix au siège · `www.arp.sn` · plateformes agréées par le Ministère · **effet grave ou inattendu : ARP saisie sous 24 h** · quatre fiches distinctes (médicament · post-vaccinale · défaut qualité · grand public) | guide BPPV § II.3.2 |
| Burkina Faso | **Agence Nationale de Régulation Pharmaceutique (ANRP)** | application **Med Safety** (indication CEO) | `Burkina_Pharmacovigilance.pdf` — **relevé par OCR**, le fichier étant un scan |
| Mali | Centre National de Référence de la Pharmacovigilance (**CNRP**), au sein du CNAM | aucun canal publié | `Mali_LES_MODALITES_DE_MISE_EN_OEUVRE...pdf` |
| Niger | Direction de la Pharmacie et de la Médecine Traditionnelle (**DPH/MT**), division pharmacovigilance | aucun canal publié | `NIGER_Pharmacovigilance_Arrete-340-MAPI.pdf` (sous-comité MAPI) |
| Togo | — | — | `Togo_Vigilance.pdf` est un **article de presse** (ATOP, atelier régional de Kara), pas un texte réglementaire |

## Ce que ce tableau démontre

**Trois pays sur huit publient une adresse de vigilance.** La mention nominative de la maquette
ABMed reste minoritaire : le repli neutre est un cas courant, pas un cas dégradé.

## Libellé de repli — validé CEO le 29/07/2026

Employé dès qu'aucun contact national n'est établi par une source. Les deux phrases obligatoires du
gabarit sont conservées ; seul le contact nommé disparaît.

> **Déclaration des effets indésirables suspectés**
>
> La déclaration des effets indésirables suspectés après autorisation du médicament est importante.
> Elle permet une surveillance continue du rapport bénéfice/risque du médicament. Les professionnels
> de santé déclarent tout effet indésirable suspecté via le système national de pharmacovigilance.

## Note sur Med Safety

L'application **Med Safety n'est pas propre au Burkina Faso** : les lignes directrices AIRP 2025 la
citent parmi les canaux ivoiriens, aux côtés de Vigimobil et DHIS2. C'est un **canal de
notification**, pas un contact national. Pour le Burkina elle vient en complément de la formule
neutre, jamais à la place d'un organisme.

## Reste à obtenir

- Adresses de vigilance : Burkina Faso, Mali, Niger, Togo, Guinée-Bissau
- Un texte réglementaire togolais (le fichier déposé est un article de presse)

## ⚠️ Plusieurs sources sont des scans — et la leçon vaut pour le produit

`SENEGAL_GUIDE-…`, `Burkina_Pharmacovigilance`, `Arrete-2020-275-MS-CAB-…` ne contiennent **aucun
objet de police** : ce sont des images. Le texte y est pourtant sélectionnable dans Edge et Acrobat,
qui océrisent à l'affichage — **l'OCR appartient au lecteur, jamais au fichier**.

**Conséquence produit** : un client verra du texte dans son PDF et se le fera refuser par Pharnos.
Le message doit nommer la cause — « ce PDF est un scan, aucun texte n'y est enregistré ; l'aperçu de
votre lecteur provient de sa propre reconnaissance de caractères » — et proposer la sortie. Un
simple « texte source requis » ferait passer un défaut de fichier pour une panne de notre service.

**Une OCR côté navigateur devient donc une piste produit sérieuse** (§8.6 interdit le calcul lourd
côté Edge, pas côté client).

### Chaîne d'analyse interne (hors produit)

```bash
pdftoppm -png -r 200 -f <page> -l <page> source.pdf sortie   # poppler 25.07
```
puis reconnaissance par le moteur natif Windows (`Windows.Media.Ocr`, langues `fr-FR` et `en-US`).
Validée sur le guide sénégalais (`vigilances@arp.sn` restitué exactement) et sur le texte burkinabè.

## Les PDF sources ne sont pas versionnés

Ce dossier pèse **120 Mo**. Seul cet index est suivi par git : versionner les sources ferait grossir
le dépôt de façon irréversible pour un contenu que le CEO détient déjà. À reconsidérer si l'équipe
grandit — une archive externe serait alors préférable au dépôt.
