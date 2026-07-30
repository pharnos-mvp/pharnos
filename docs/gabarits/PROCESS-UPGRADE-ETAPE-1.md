# Upgrade — Étape 1 : la mise en conformité

> **Statut : VERROUILLÉ** par le CEO le 29 juillet 2026, sur la référence RCP Gynoril.
> Ce document est le contrat que le moteur doit tenir. Toute évolution passe par une validation CEO.
>
> Étape 2 (traduction EN/FR) et étape 3 (mise en page DOCX/PDF) restent à verrouiller.

---

## 0. Qui parle — et qui rédige

Deux choses distinctes, souvent confondues.

### La voix CLIENT

**Regafy AI est une IA partenaire en affaires réglementaires.** Le ton est celui d'un collègue
expérimenté qui travaille *avec* le client, jamais d'un outil qui rend un verdict.

### La posture INTERNE, différente à chaque passe

`_shared/ai/personas.ts` — arrêté le 30/07/2026.

| Passe | Posture | Pourquoi celle-là |
|---|---|---|
| Conformité | **Opérateur de mise en conformité** : range dans le gabarit, ne connaît pas le produit | Le rôle cesse de contredire les règles zéro-invention |
| Traduction | **Terminologue réglementaire** | Le risque n'est pas l'invention, c'est l'« amélioration » du texte |
| Revue | **Expert RA senior UEMOA, partenaire** | Seul endroit où la connaissance générale est un actif |

⚠️ **La posture de conformité ne revendique AUCUNE expertise, et c'est délibéré.** La version
précédente ouvrait par « Tu es un expert en affaires réglementaires » puis consacrait quatre puces à
interdire l'usage de cette expertise. Sur Opus 5, qui suit les consignes au pied de la lettre
(PLAN-MOTEUR-IA §10), amorcer un comportement pour le réprimer ensuite est un mauvais calcul : il
suffit qu'une règle soit affaiblie dans une évolution pour que le rôle reprenne le dessus.

⚠️ **Aucune posture ne peut empêcher une hallucination.** Ce sont le décodage contraint, la citation
vérifiée, l'ancrage des chiffres et la dérivation des lacunes qui l'empêchent. La posture sert au
registre et à la discipline, pas à l'exactitude — s'en remettre à elle transformerait un mécanisme
en promesse. Un test verrouille chacune de ces décisions.

| À faire | À proscrire |
|---|---|
| « Votre RCP ne suit pas la numérotation du gabarit » | « Le document est non conforme » |
| « Ces rubriques sont-elles sans objet pour GYNORIL ? » | « Rubriques manquantes : 20 » |
| « Nous avons déplacé le fabricant en 7.2 » | « Erreur détectée et corrigée » |
| Nommer le produit du client | Parler de « le document », « l'entité » |
| Expliquer le risque évité | Énumérer des écarts sans conséquence |

Le client est un professionnel : on ne lui explique pas son métier, on lui fait gagner du temps et
on lui signale ce qu'il ne pouvait pas voir.

---

## 1. La règle absolue — le périmètre

**La mise en conformité n'utilise QUE le document source désigné par l'utilisateur.**

- Une information présente dans la source et non reprise est une **omission**, aussi grave qu'une
  invention.
- Une information absente de la source ne va **jamais** dans le document, quelle que soit son
  origine : connaissance générale du modèle, autre pièce du dossier, certificat d'AMM joint.
- Ce qui a été trouvé ailleurs se dit **dans le rapport**, jamais dans le document produit.

En conditions réelles, le moteur n'a accès à rien d'autre que le fichier téléversé. Le comportement
doit être identique quand d'autres pièces sont disponibles.

### Le cas du document SCANNÉ

Un scan reste un document source désigné : il se traite, il ne se refuse pas. Le client, lui, ne
verrait pas de raison d'être refusé — **son lecteur PDF océrise à l'affichage**, il croit donc que son
fichier contient du texte.

La règle de périmètre est inchangée ; c'est la **lecture** qui se dédouble :

| | Ce qui la fait | Ce qu'elle vaut |
|---|---|---|
| **Contenu** | le modèle lit l'IMAGE de la page | fidèle : l'image est le document |
| **Vérification** | une reconnaissance de caractères produit un texte de CONTRÔLE | reconstruction : les mots survivent, les chiffres pas toujours |

Trois conséquences, toutes tenues en code :

1. Le texte océrisé **n'est jamais soumis au modèle**. Sinon les coquilles de la reconnaissance
   deviendraient des « constats » sur le document du client — des affirmations fausses, que rien en
   aval ne peut démentir puisqu'elles figurent dans le corpus de contrôle.
   ⚠️ Le modèle sait pourtant lire une image, et le fait mieux que notre reconnaissance. C'est
   exactement pour cela qu'une **seconde lecture indépendante** existe : un contrôle produit par ce
   qu'il contrôle n'en est pas un. Ce qui compte ici n'est pas la qualité de la reconnaissance, c'est
   qu'elle ne sorte pas du modèle.
2. Le contrôle des **valeurs chiffrées** devient **consultatif** : une reconnaissance confond 0 et O,
   1 et l, 5 et S, 8 et B. Exiger l'exactitude ferait rétrograder en « Non fourni » des rubriques
   parfaitement correctes — précisément l'erreur que l'étape 1 existe pour éviter, dans l'autre sens.
   Les valeurs non retrouvées sont donc **listées à relire**, jamais opposées au livrable.
3. Le contrôle de **citation** reste exigé. La tolérance porte sur 8 % des caractères d'un passage
   **contigu** — une reconnaissance correcte se trompe sur 1 à 2 %. Au-delà, ce n'est plus une lecture
   fautive : c'est une invention, et elle est rejetée comme n'importe quelle autre.
   ⚠️ La contiguïté est essentielle : sans elle, une phrase recombinée à partir de mots pris à trois
   rubriques différentes passerait pour une citation — c'est ainsi qu'une posologie pédiatrique
   inventée pourrait sortir d'une source qui ne posologie que l'adulte.
4. **Aucune tolérance ne touche la MAGNITUDE d'une valeur**, et celle-ci ne vit pas que dans les
   chiffres : `250 g` n'est pas `250 mg`, `5 μg/kg/min` n'est pas `5 mg/kg/min`, `250 microgrammes`
   n'est pas `250 milligrammes`, `1,25` n'est pas `12,5`. Chiffres, séparateur décimal et unité —
   abrégée, composée ou **écrite en toutes lettres**, en français comme en anglais — forment un bloc
   intouchable. Sur tous ces cas, le contrôle des valeurs ne verrait rien : le nombre lui-même est
   intact. D'où l'importance d'en faire une règle de la CITATION.

**La revue le dit.** Un encart déterministe — jamais rédigé par le modèle — annonce que la source est
un scan, explique pourquoi le lecteur du client lui montrait du texte, et liste les valeurs à relire.
Une garantie dont on cache la portée n'est pas une garantie.

## 2. Le gabarit est le socle — rien ne passe sous silence

**Tout élément mentionné dans le gabarit est attendu par le régulateur, donc apparaît dans le
document produit.** Rubriques, sous-rubriques, sous-titres, mentions imposées.

- Renseigné par la source → le contenu.
- Absent de la source → le sous-titre **et** le marqueur `[Non fourni, à compléter]`.
- **Jamais supprimé.** Supprimer un sous-titre rend la lacune invisible, ce qui est pire que la
  lacune.

Vérification de recette : chaque élément du gabarit se retrouve dans le document produit. Sur le RCP
ABMed 2026, cela fait **27 éléments** — audit à repasser à chaque évolution du gabarit.

### Ce que le moteur n'écrit jamais

« Sans objet » est une **affirmation réglementaire**, pas une mise en forme. Elle appartient au
client. Le rapport le lui demande :

> **Ces rubriques sont-elles sans objet, ou ne concernent-elles pas &lt;PRODUIT&gt; ?**
> Dans ce cas, inscrivez-y simplement « Sans objet ». Si au contraire elles concernent votre
> produit, complétez-les : le gabarit attend une réponse à chacune.

## 3. Le re-mappage — la vraie valeur de l'étape

**La numérotation du document source ne fait pas foi.** Le contenu se cherche partout dans la
source, puis se range à sa place dans le gabarit.

Cas réels relevés sur Gynoril :

| Contenu | Source | Gabarit | Risque si recopié en place |
|---|---|---|---|
| Fabricant | rubrique 7 | **7.2** | déposé comme titulaire de l'AMM |
| Titulaire | rubrique 8 | **7.1** | déposé comme numéro d'AMM |
| Sécurité préclinique | 5.2 | **5.3** | pharmacocinétique remplie de toxicologie |
| Phrase sur l'absorption | fin de 5.1 | **5.2 Absorption** | rubrique 5.2 vide alors que la donnée existe |

C'est pour cela que la génération se fait **par rubrique du gabarit** en relisant toute la source, et
jamais séquentiellement.

## 4. La terminologie se verrouille

Aligner sur les référentiels officiels n'est pas de la réécriture : c'est de la conformité.

- **MedDRA** — libellés officiels FR des classes de systèmes d'organes et des catégories de fréquence.
- **Formules du gabarit** — « Classe pharmacothérapeutique », « conformément à la réglementation en
  vigueur », « Pour la liste complète des excipients, voir rubrique 6.1 ».
- **EDQM** — formes pharmaceutiques et voies d'administration.

Ces substitutions sont listées dans le rapport : elles montrent le travail fait.

## 5. Les trois cas de figure

Le gabarit porte déjà les variantes dans ses blocs `<...>` : on garde la branche applicable.

| Rubrique | Nouvelle AMM | Renouvellement | MAH ≠ fabricant |
|---|---|---|---|
| **7** | Titulaire seul | Titulaire seul | **7.1 Titulaire / 7.2 Fabricant** |
| **8** N° AMM | sans objet — attribué à la délivrance | numéro repris, obligatoire | — |
| **9** | ligne « première autorisation » seule | **les deux** lignes | — |
| **10** | date de soumission | date de la révision | — |

⚠️ Une date d'autorisation du **pays d'origine** n'est jamais la date de la rubrique 9, qui concerne
le pays de dépôt.

## 6. Vigilance en rubrique 4.8

Adresse électronique seule ; les autres canaux vont au rapport.

| Pays | Mention |
|---|---|
| BJ · CI · SN | organisme national + adresse électronique (voir `RA-source/Vigilance/INDEX-vigilance-UEMOA.md`) |
| BF | formule neutre + mention de l'application **Med Safety** |
| autres | formule neutre |

**Formule neutre** — les deux phrases obligatoires du gabarit, sans contact nommé :

> La déclaration des effets indésirables suspectés après autorisation du médicament est importante.
> Elle permet une surveillance continue du rapport bénéfice/risque du médicament. Les professionnels
> de santé déclarent tout effet indésirable suspecté via le système national de pharmacovigilance.

## 7. Deux livrables, jamais mêlés

### Le document

Le RCP conforme, seul. Aucune annotation, aucun commentaire, aucune recommandation à l'intérieur.

### La revue réglementaire — une à deux pages, pas davantage

**Nom du livrable**, arrêté le 30/07/2026 : « **Revue réglementaire du RCP** » en français,
« **SmPC Regulatory Review** » en anglais. L'ordre des mots diffère volontairement — la traduction
littérale « Regulatory Review of the SmPC » n'est pas idiomatique. Il se décline par gabarit
(`DOC_SHORT` dans `conformity-specs.ts`) : de la notice, de l'étiquetage, de la lettre de demande…

⚠️ **Jamais « avis » ni « attestation » ni « certificat » de conformité.** Le document ne certifie
rien : il constate et recommande. Un nom qui suggère une conformité créerait l'ambiguïté que
l'avertissement passe deux paragraphes à dissiper.

**Langue du rapport** : celle du document téléversé par l'utilisateur. Source FR → rapport FR ;
source EN → rapport EN ; **toute autre langue source → rapport EN par défaut**. Le rapport suit le
client, pas le livrable : un rapport dans une langue que le client ne lit pas ne sert à personne.

Il s'ouvre sur l'avertissement, **au mot près** :

> ### ⚠️ AVERTISSEMENT — À LIRE AVANT TOUTE UTILISATION
>
> Ce rapport n'est pas un document réglementaire et ne doit jamais être déposé auprès d'une
> autorité. Il accompagne le RCP mis en conformité, il ne le remplace pas et n'en fait pas partie.
>
> Chaque élément signalé « à vérifier » doit être analysé et validé par un expert en affaires
> réglementaires avant d'être repris dans un dossier. Pharnos assiste la décision ; il ne la prend
> pas, et n'engage pas la responsabilité du titulaire de l'AMM.

Structure :

1. **Ce qui a été déplacé** — tableau contenu / source / gabarit / risque évité
2. **Terminologie alignée** — tableau avant / après / référentiel
3. **À compléter** — le plus sérieux d'abord, puis la liste ; suivi de la question « sans objet »
4. **Constats issus d'autres pièces** — signalés, jamais repris dans le document
5. **Connaissance générale** — explicitement séparée, chaque élément « à vérifier »
6. **Recommandations** — classées 🔴 bloquant / 🟠 majeur / 🟡 mineur

Le rapport dit aussi ce qu'il **refuse** d'écrire, et pourquoi : un code ATC non établi par une
source ne s'invente pas, même en rapport.

## 8. Recette de l'étape 1

- [ ] Chaque élément du gabarit présent dans le document produit
- [ ] Aucune valeur absente de la source dans le document produit
- [ ] Aucune information de la source oubliée
- [ ] Contenus re-mappés à leur rubrique de gabarit, pas à leur numéro d'origine
- [ ] Terminologie officielle appliquée et listée au rapport
- [ ] Document et rapport dans deux fichiers distincts
- [ ] Avertissement du rapport reproduit au mot près
- [ ] Ton partenaire : le produit est nommé, le risque est expliqué
- [ ] Source scannée : traitée et non refusée, encart présent dans la revue, valeurs à relire listées
- [ ] Source scannée : aucune rubrique rétrogradée au seul motif d'une valeur chiffrée
