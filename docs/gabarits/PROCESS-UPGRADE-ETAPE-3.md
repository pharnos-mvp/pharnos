# Upgrade — Étape 3 : la mise en page

> **Statut : VERROUILLÉ** par le CEO le 29 juillet 2026, sur la référence RCP Gynoril.
> Prérequis : étapes 1 et 2 validées. Générateur de référence :
> `docs/gabarits/tools/render-deliverables.mjs`.

---

## 1. Le livrable

| Fichier | DOCX | PDF | Pourquoi |
|---|:--:|:--:|---|
| Document, langue source | ✅ | ✅ | le client complète les rubriques manquantes, puis dépose |
| Document, langue cible | ✅ | ✅ | idem |
| **Rapport** | ❌ | ✅ | il constate, il ne se complète pas — un seul format suffit |

Cinq fichiers, livrés en archive. Le rapport est dans **la langue du document téléversé**
(§ étape 1).

## 2. Réglages relevés sur le gabarit officiel, pas choisis

Mesurés sur `RA-source/Template/RCP/ABMed_Maquette RCP_2026.pdf` :

| Attribut | Valeur | Relevé par |
|---|---|---|
| Police | **Arial** | `pdffonts` |
| Format | **A4** (595,28 × 841,89 pt) | `pdfinfo` |
| Marges | **2,5 cm** (2 cm en pied) | mesure de la zone de texte |
| Titres de rubrique | gras **#0B3D92** | échantillonnage du pixel |
| Sous-titres | gras **soulignés** noirs | rendu visuel |
| Corps | 11 pt | défaut Word du gabarit |

## 3. En-tête, pied, signature

- **En-tête** — nom du produit, **en haut à droite**, gris 9,5 pt. **Absent de la première page**,
  qui porte déjà le titre. Deviendra « PRODUIT — PAYS » quand le module pays sera en place.
- **Pied** — pagination `n / N`, **en bas à droite**. Convention du compilateur CTD
  (`web/src/features/workspace/pdf/compile-dossier.ts`).
- **Signature — RAPPORT UNIQUEMENT** : « Regafy AI by **Pharnos** » centrée au pied, « Pharnos » en
  navy souligné et **cliquable** (annotation URI vers `pharnos.com`). Même forme que le filigrane
  des dossiers CTD compilés.

> ⚠️ **Le document ne porte AUCUNE marque de fournisseur.** Il part à l'agence : un RCP siglé pose à
> l'évaluateur une question qu'il n'a pas à se poser. La signature vit sur le rapport, qui ne se
> dépose jamais.

## 4. Conventions de composition

**Ligne de substance active** — puce, libellé, conduit de points s'arrêtant à **56 % de la largeur**,
valeur numérique calée à droite sur ce point, unité repartant à gauche juste après. C'est ce double
taquet qui aligne verticalement « UI » et « mg ».

```
•  Sulfate de néomycine .............  35 000  UI
•  Nystatine .........................  100 000  UI
```

En DOCX ce sont de **vrais taquets Word** (`TabStopType.RIGHT` + `LeaderType.DOT`, puis
`TabStopType.LEFT`) : l'alignement survit à l'édition du client. La puce est écrite **en dur** dans
les deux formats plutôt que confiée au moteur de listes — c'est la seule façon de garantir que DOCX
et PDF sont identiques.

**Mention de lacune** — `[Non fourni, à compléter]` / `[Not provided, to be completed]`, **9,5 pt
gris, sans gras**. Elle signale, elle ne crie pas.

**Blocs d'adresse** — les retours à la ligne portent du sens (NOM / ADRESSE / contacts). Ils sont
marqués par un `\` final (saut dur CommonMark) et rendus sans espacement de paragraphe.

## 5. Deux contraintes techniques à connaître

**Le PDF trace une chaîne entière par groupe de style, jamais mot à mot.** Positionner chaque mot
produit un PDF dont les extracteurs recollent le texte (« QUALITATIVEET » observé). Sur un document
réglementaire, **l'extractibilité fait partie de la conformité** : un évaluateur qui copie une
rubrique doit obtenir la rubrique.

**Les polices standard de `pdf-lib` ne codent que le WinAnsi** — un caractère hors jeu fait *échouer*
la génération, pas seulement mal rendre. Un filtre traduit ce qui a un équivalent (`→` → `->`,
`●` → `•`) et **journalise ce qu'il retire** : un caractère disparu en silence est un défaut.

> **Décision en attente avant le portage dans `web/`** : le PDF utilise Helvetica, proche d'Arial en
> métrique mais pas Arial. Embarquer **Liberation Sans** — métriquement compatible et librement
> redistribuable, contrairement à Arial — réglerait d'un coup la fidélité au gabarit et le jeu de
> caractères.

## 6. Recette de l'étape 3

- [ ] Cinq fichiers : deux documents en DOCX + PDF, un rapport en PDF
- [ ] A4, marges 2,5 cm, Arial, titres #0B3D92
- [ ] Aucun en-tête sur la première page ; nom du produit à droite sur les suivantes
- [ ] Pagination `n / N` en bas à droite
- [ ] Signature Regafy/Pharnos sur le rapport **et nulle part ailleurs**, lien cliquable actif
- [ ] Unités des substances actives alignées verticalement, dans les DEUX formats
- [ ] Mentions de lacune en 9,5 pt gris, sans gras, entre crochets
- [ ] Texte du PDF extractible sans recollement de mots
- [ ] Aucun caractère retiré à la génération (le journal du générateur doit rester muet)
