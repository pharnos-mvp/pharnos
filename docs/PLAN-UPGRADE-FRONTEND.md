# PLAN — Front de l'upgrade RCP et module d'achat

> **Document de reprise.** Écrit le 30 juillet 2026 pour démarrer ce chantier dans un contexte neuf.
> Il contient tout ce qu'il faut savoir : ce qui est déjà construit, ce qui reste, et les décisions
> déjà prises qu'il ne faut pas rouvrir.
>
> **Le moteur est terminé. Ce chantier est du front et de l'encaissement, pas de l'IA.**

---

## 1. Où l'on en est

Le RCP est le premier gabarit tracé de bout en bout, validé porte par porte par le CEO sur deux cas
réels : **Gynoril Ovule** (source FR) et **KV-Kacin 500** (source EN, 15 pages, dépôt Bénin).

### Le processus, verrouillé

| Étape | Spec | État |
|---|---|---|
| 1 — Mise en conformité | [PROCESS-UPGRADE-ETAPE-1.md](gabarits/PROCESS-UPGRADE-ETAPE-1.md) | ✅ verrouillée |
| 2 — Traduction | [PROCESS-UPGRADE-ETAPE-2.md](gabarits/PROCESS-UPGRADE-ETAPE-2.md) | ✅ verrouillée |
| 3 — Mise en page | [PROCESS-UPGRADE-ETAPE-3.md](gabarits/PROCESS-UPGRADE-ETAPE-3.md) | ✅ verrouillée |

### Le moteur, complet

| Module | Rôle |
|---|---|
| `_shared/upgrade-section-core.ts` | conformité par rubrique — citation vérifiée + valeurs ancrées |
| `_shared/translate-section-core.ts` | traduction — statut recopié + aucun chiffre altéré |
| `_shared/report-core.ts` | revue réglementaire — squelette déterministe + analyse contrainte |
| `_shared/ai/personas.ts` | trois postures, une par passe |
| `_shared/ai/pool.ts` | parallélisme borné + préchauffage du cache |
| `_shared/ai/evidence.ts` | citation et ancrage des chiffres · tolérance des sources **scannées** |
| `_shared/ai/section-schema.ts` | schéma par rubrique, `enum` verrouillé |
| `docs/gabarits/tools/render-deliverables.mjs` | DOCX + PDF (à porter dans `web/`) |

**298 tests Deno.** Surface HTTP en production : `POST /upgrade` avec `section: "<id>"`.

### Les chiffres, mesurés sur les prompts réels

| | Valeur |
|---|---|
| Appels par upgrade | **59** — 29 rubriques × 2 passes + 1 revue |
| Coût passe 1, entrée, avec cache + préchauffage | **0,27 – 0,33 $** (−82 %) |
| Coût total estimé par upgrade | **≈ 1,00 – 1,30 $** |
| Durée, 6 appels simultanés | **≈ 2,6 min** |
| Durée, séquentiel | 11 – 23 min — **ne passe pas** |

⚠️ Ces jetons sont une **estimation** (longueurs exactes, conversion par ratio 3,1–3,9 car./jeton).
Le chiffre exact viendra du premier passage par l'API.

---

## 2. Ce qui reste — et c'est tout

### A. Écran pays + activité, AVANT la génération

> **Conçu — voir §D bis.** Ces deux champs vivent désormais dans la **modale de mise à niveau**, en
> positions 1 et 2, avant le dépôt du fichier et avant tout prix. Le pays commande en plus le
> **modèle servi** dans la Bibliothèque, pas seulement le prompt.

La plomberie existe déjà : l'Edge `upgrade` accepte `countryCode` et `dossierContext.activity`. Il
manque l'écran qui les renseigne.

Ces deux valeurs **entrent dans le prompt de chaque rubrique**, pas dans un post-traitement : elles
doivent donc être connues avant le premier appel.

**Ce que le pays commande** — la mention de vigilance en rubrique 4.8 :

| Pays | Mention |
|---|---|
| Bénin · Côte d'Ivoire · Sénégal | organisme national + adresse électronique |
| Burkina Faso | formule neutre + application **Med Safety** |
| Mali · Niger · Togo · Guinée-Bissau | formule neutre |

Source unique : [`RA-source/Vigilance/INDEX-vigilance-UEMOA.md`](../RA-source/Vigilance/INDEX-vigilance-UEMOA.md).

**Ce que l'activité commande** — les rubriques 8, 9 et 10 :

| Rubrique | Nouvelle AMM | Renouvellement |
|---|---|---|
| 8 — N° d'AMM | sans objet, attribué à la délivrance | numéro repris, obligatoire |
| 9 | ligne « première autorisation » seule | **les deux** lignes |
| 10 | date de soumission | date de la révision |

⚠️ Une date d'autorisation du **pays d'origine** n'est jamais la rubrique 9, qui vise le pays de dépôt.
C'est un piège réel, rencontré sur Gynoril.

### B. Orchestration côté navigateur

Le moteur est prêt, l'enchaînement ne l'est pas. **Le mur de 150 s interdit d'enchaîner les 59 appels
dans une seule invocation Edge** ; chaque appel individuel, lui, tient largement (5 à 22 s).

Deux voies :

| Voie | Pour qui | Coût |
|---|---|---|
| **Navigateur pilote** — une invocation Edge par rubrique | in-app, l'utilisateur regarde | aucun nouveau composant |
| **Worker asynchrone** (M4, `pg_cron` + `pg_net` déjà installés) | vente à l'acte, l'utilisateur est parti | une brique de plus |

Chariow encaisse en **une fois** et le client attend la livraison : la voie navigateur suffit si
l'onglet reste ouvert, le worker devient nécessaire sinon. **À trancher au début du chantier.**

`_shared/ai/pool.ts` est pur — sans API Deno ni DOM — donc utilisable **tel quel** par les deux voies.

⚠️ **Régler `warmupFirst: true`** et `concurrency: 6`. Sans préchauffage, six appels simultanés
paient six écritures de cache au lieu d'une : 0,28 à 0,35 $ perdus par upgrade.

### C. Portage du générateur dans `web/`

`docs/gabarits/tools/render-deliverables.mjs` produit les cinq fichiers avec `docx@9.7.1` et
`pdf-lib@1.17.1` — **les bibliothèques mêmes de l'application**, précisément pour que le portage soit
un déplacement et non une réécriture.

Trois pièges déjà payés, à ne pas re-découvrir :

1. **Tracer une chaîne entière par groupe de style, jamais mot à mot.** Le positionnement manuel
   produit un PDF dont les extracteurs recollent le texte (« QUALITATIVEET » observé). Sur un
   document réglementaire, l'extractibilité fait partie de la conformité.
2. **Tout tracé passe par `drawMixed`.** Les polices standard ne codent que le WinAnsi ; `Symbol` et
   `ZapfDingbats` fournissent `≥ ≤ ≠ ± × µ ∞ ●`. Un `drawText` direct avec une seule police **lève**
   sur `≥` ou `µ`.
3. **`titlePage` appartient à `properties`** dans `docx`, sinon `<w:titlePg/>` n'est pas émis et Word
   ignore l'en-tête de première page — **en silence**.

Le DOCX/PDF reste **côté navigateur** : 2 s de CPU par requête Edge l'interdisent (§8.6 du plan
moteur).

### C bis. PDF scannés — l'OCR appartient au navigateur

**Le moteur est prêt ; c'est la lecture qui reste à câbler.** Un dossier UEMOA sur trois arrive en
scan : refuser ces fichiers écarterait une part réelle du marché, et le client ne comprendrait même
pas le refus — **son lecteur PDF océrise à l'affichage**, il voit donc du texte que le fichier ne
contient pas.

**Architecture à deux canaux** — la décision centrale, déjà tranchée et implémentée côté moteur :

| Canal | Rôle | Conséquence d'une erreur |
|---|---|---|
| Le modèle lit **l'image** | extraction du contenu | aucune — l'image est fidèle |
| L'OCR produit un **texte de contrôle** | vérifier citation et chiffres, **en code** | affaiblit la vérification, ne corrompt jamais le document |

Le texte océrisé **n'entre jamais dans le prompt**. Deux gains dans le même geste : aucun jeton
supplémentaire, et aucune coquille de lecture attribuée au client (un « constat » sur une faute que
l'OCR a fabriquée serait un constat faux, et le contrôle d'ancrage ne peut pas le rattraper puisque
la coquille figure bel et bien dans le corpus de contrôle).

### Pourquoi une OCR séparée, alors qu'Opus 5 est multimodal et lit déjà l'image

C'est la bonne question, et la réponse est la raison d'être de tout le dispositif. Le modèle **fait**
l'OCR, nativement et bien mieux que `tesseract.js` : c'est précisément pour cela qu'il lit l'image et
que le contenu du livrable en sort. L'OCR navigateur ne sert **pas** à lire le document.

Elle sert à fournir un **corpus de contrôle indépendant**. Un contrôle produit par ce qu'il contrôle
n'est pas un contrôle : si le texte de référence venait du modèle, `verifyEvidence` comparerait sa
citation à sa propre lecture, et une invention cohérente avec elle-même passerait à tous les coups.
La garantie exécutable exige **deux lecteurs qui ne se parlent pas** — l'un produit, l'autre vérifie.

Trois conséquences pratiques, et elles ferment la question de l'outillage :

- La **qualité** de l'OCR navigateur importe peu ; son **indépendance** est tout. C'est pourquoi une
  reconnaissance médiocre reste utile là où une seconde lecture par le modèle ne le serait pas.
- Ses erreurs sont **absorbées, pas subies** : tolérance de 8 % sur la citation, valeurs consultatives.
  Ses erreurs sur les CHIFFRES, elles, ne sont jamais absorbées — elles deviennent une liste à relire.
- **Ne pas remplacer `tesseract.js` par un second appel au modèle**, ni par le même appel qui rendrait
  « et au passage, le texte brut ». Ce serait supprimer le contrôle en croyant l'améliorer.

**Ce que l'Edge attend déjà** (`POST /upgrade`, livré) :

```
{ docType, section, filePath, fileName, text: "<texte océrisé>", sourceKind: "ocr", … }
```

`filePath` **et** `text` ensemble : la pièce pour le modèle, l'OCR pour le contrôle. `sourceKind` est
**déclaré, jamais deviné** — traiter un texte fidèle comme océrisé accepterait des citations
approximatives, l'inverse rejetterait des citations justes.

Trois refus explicites de l'Edge, à gérer côté front :

| Réponse | Cause | Ce que le front doit faire |
|---|---|---|
| `400 ocr_without_file` | `sourceKind: 'ocr'` sans `filePath` | bug d'appelant : la pièce est obligatoire |
| `400 no_text_layer` | pièce fournie, aucun texte de contrôle | déclencher l'OCR, ou nommer la cause au client |
| `413 control_truncated` | texte de contrôle au-delà de `MAX_TEXT_CHARS` | le document est trop volumineux par rubrique — le dire, ne pas livrer un dossier amputé |

⚠️ Le `413` existe parce que la troncature devient **asymétrique** en mode deux canaux : la pièce part
entière au modèle, le corpus de contrôle est coupé. Toute rubrique dont la citation vit dans la queue
du document ressortirait « Non fourni » alors que le document la couvre.

**Le pipeline navigateur à écrire** — la pile est déjà là aux deux tiers :

1. `pdfjs-dist@6` (déjà présent, cf. `lib/pdfjs.ts`) : `getTextContent()` sur chaque page.
   Total quasi nul de caractères ⇒ **c'est un scan**. La détection est mécanique, pas une question
   posée à l'utilisateur.
2. `pdftoppm` n'existe pas en navigateur : rendre chaque page en `canvas` via pdf.js, à ~200 dpi.
3. Reconnaissance : **`tesseract.js` (WASM), chargé en `lazyChunk` et seulement pour un scan** —
   ~15 Mo de données `fra`+`eng` qu'aucun utilisateur au dossier textuel ne doit télécharger.
   ⚠️ `lazyChunk` obligatoire, et `vite:preloadError` **jamais neutralisé** (cf. mémoire).
4. **Retirer les numéros de page et les en-têtes répétés** du texte océrisé avant l'envoi.
   ⚠️ Ce n'est pas de la cosmétique : un chiffre parasite au milieu du corpus (« …chez la femme
   adulte. **12** 4.2 Posologie… ») rend la citation d'un passage à cheval sur deux pages
   **impossible à retrouver** — un chiffre du corpus ne peut pas être enjambé, précisément pour
   qu'un dosage ne le soit pas. La rubrique serait rétrogradée alors qu'elle est juste. Un en-tête
   qui se répète 15 fois pollue en plus le contrôle des valeurs.
5. Envoyer les deux canaux, avec `sourceKind: 'ocr'`.

**Ce que le front doit dire à l'utilisateur, et à quel moment :**

- **Pendant** : « aucun texte exploitable dans ce PDF : nous le lisons page par page ». Nommer la
  cause **avant** l'attente, sinon la lenteur passe pour une panne.
  ⚠️ **Ne pas écrire « aucun texte n'est enregistré dans ce fichier »** : ce serait affirmer un fait
  sur le fichier du client alors que la bascule peut venir d'une couche de texte pauvre ou de pages
  mixtes. L'encart de la revue a été corrigé pour la même raison — le front doit dire la même chose.
- **Après** : le bandeau « valeurs à relire » alimenté par `figuresAdvisory` + `ungrounded`.
  L'encart correspondant est déjà écrit **en dur** dans la revue (`report-core.ts`, deux langues).
  ⚠️ **Construire l'entrée de la revue par `reportInputFrom(outcomes)`, jamais à la main** :
  `sourceKind` et `figuresToVerify` sont les deux faces d'une même contrepartie, et les poser
  séparément permettrait de livrer l'encart sans la liste — un avertissement vide, invisible en
  recette puisque l'encart, lui, serait bien là.
- **Si l'OCR échoue** (page illisible, fichier chiffré) : dire quoi faire — fournir le fichier
  d'origine, ou un export texte. Jamais « texte source requis », qui ferait passer un défaut de
  fichier pour une panne de notre service. L'Edge renvoie déjà `reason: 'no_text_layer'` pour cela.

**Ce que le pays et l'activité deviennent sur un scan** : rien de particulier. Ils viennent de
l'écran §A, pas du document.

⚠️ **Le CPU de l'Edge devient l'argument principal du worker asynchrone (§B).** Sur un scan, la pièce
repart à chaque rubrique : `bytesToBase64` sur 12 Mo coûte **~420 ms mesurés**, plus le téléchargement
Storage, plus le rapprochement approché de la citation (**~74 ms** pour 150 caractères, **~294 ms**
pour 600, sur un corpus de 60 000). Contre **2 s de CPU par requête**, la marge est bien plus mince
qu'en mode texte. Le cache de préfixe protège les jetons, pas ce CPU-là. **Conséquence à trancher
avec §B : pour les scans volumineux, une seule invocation par rubrique avec une pièce de 12 Mo est
la contrainte dimensionnante**, pas le mur de 150 s.

### C ter. La porte d'entrée et la seconde chance

Conception complète : **[PLAN-RECEVABILITE.md](PLAN-RECEVABILITE.md)**.

> ⚠️ **Cette porte s'ouvre APRÈS le paiement** (§D bis.3 — le fichier ne quitte pas le navigateur
> avant). C'est donc le **seul** filet contre un mauvais fichier, et la formulation du refus porte
> tout le poids : le client a déjà payé. « La tentative n'a rien coûté » devient « **votre commande
> reste ouverte, redéposez le bon fichier** » — la reprise vaut pour cette commande et ce document,
> jamais comme crédit (§D).

Ce que le front doit porter :

- **Annoncer le refus avec sa preuve.** Jamais « document non conforme » : le type réellement lu, un
  passage cité DU document déposé, et la marche à suivre. Un prospect qui testait doit voir que nous
  avons lu son fichier, pas deviné.
- **Dire que la tentative n'a rien coûté**, dans le message de refus lui-même. C'est là que se joue
  la confiance, pas dans une page d'aide.
- **Le dépôt suivant reprend la même commande** — aucun nouveau paiement, aucun nouveau parcours.
- **Trois refus**, puis la commande reste ouverte et le support prend la main. Jamais un client
  bloqué avec un crédit payé et rien en face.
- **Bandeau d'avertissement** — et non refus — quand le produit du document diffère de celui du
  dossier : un même produit porte des noms commerciaux différents selon le pays.

⚠️ La décision appartient à l'**Edge**, jamais au navigateur : c'est elle qui autorise la dépense.
Le front affiche un verdict, il ne le calcule pas.

### D. Module d'achat

Rail retenu par le CEO : **Chariow**, one-shot, 15 % de commission
([PLAN-CHARIOW.md](PLAN-CHARIOW.md)).

⚠️ **Contrainte dure déjà établie** : `script-src 'self'` sur `landing/_headers` interdit le script
Snap sur `pharnos.com`. Le contenu vit sur `pharnos.com/services/<x>`, **le paiement est isolé sur
`services.pharnos.com`** ; le delta CSP est `frame-src` seul.

#### Prix — ARRÊTÉ par le CEO le 30 juillet 2026

| | Prix | Marge brute sur ~1,15 $ de coût moteur |
|---|---|---|
| **Un document** | **29 € (19 000 FCFA)** | ≈ 32 $ de revenu net après 15 % Chariow — **×24** |
| **Les trois documents** d'un même produit (RCP + notice + étiquetage) | **69 € (45 000 FCFA)** | 3 upgrades ≈ 3,45 $ de coût — **×17** |

⚠️ **Ne pas confondre avec l'Audit Expert RA (64 900 FCFA), qui porte sur le Module 1 COMPLET.**
L'upgrade traite **un document**, pas un dossier. Les deux offres ne se comparent pas et ne se
substituent pas.

**Format d'affichage, dans TOUTES les langues : `29 € (19 000 FCFA)`** — euro d'abord, FCFA entre
parenthèses. ⚠️ `price()` (`landing/checking.js:53`) rend aujourd'hui l'un **ou** l'autre selon un
booléen : la signature change, pas seulement les constantes.

Le bundle est un **upsell posé SOUS le prix affiché**, jamais au-dessus : on lit 29 €, puis
« les trois — 69 €, 87 € barré, −18 € ». Au-dessus, il ferait du 29 € un prix d'appel. **Chaque bloc
porte son propre bouton.** Il ne vaut que pour **un même produit** — trois documents de trois
produits différents sont trois commandes.

#### Portée du paiement — VERROUILLÉE par le CEO le 30 juillet 2026

**Un paiement = un document.** Ni abonnement, ni crédit reportable, ni solde de mises en conformité.
Un autre document, un autre paiement.

La **reprise gratuite** existe pour un seul cas : l'utilisateur s'est trompé de fichier ou de
gabarit. Elle est attachée à **la commande et au document**, jamais au compte, et ne survit pas au
document. Sans cette borne, un paiement unique financerait la reprise de tout un dossier.

| Interdit dans l'interface | Pourquoi |
|---|---|
| « votre crédit reste disponible » | transforme un one-shot en solde |
| « vous pourrez l'utiliser plus tard » | crée un droit dans le temps |
| tout compteur de mises en conformité restantes | promet un forfait qui n'existe pas |

⚠️ **Le garde-fou vit dans l'Edge**, contre un identifiant de commande lié au document — jamais dans
le libellé. Le front affiche un verdict, il ne l'accorde pas.

> **Toute évolution vers plusieurs upgrades par paiement, ou vers un droit qui dure, passe d'abord
> par une analyse conjointe CEO — coût, rentabilité, délivrabilité.** Ne pas la décider en cours
> d'implémentation.

### D bis. La Bibliothèque réglementaire — SPÉCIFICATION DE DÉVELOPPEMENT

**Maquette de référence, validée CEO le 30/07/2026 :**
[`docs/mockups/bibliotheque-reglementaire.html`](mockups/bibliotheque-reglementaire.html).
*(Les trois maquettes antérieures — `upgrade-mise-en-conformite*.html` — sont conservées pour
l'historique des arbitrages ; elles ne font plus foi.)*

#### Le parcours réel, et pourquoi il commande la conception

**L'utilisateur vient chercher un modèle. Il découvre le service à côté.** Ce n'est pas une page de
vente sur laquelle on tomberait par hasard : c'est un outil gratuit dont l'offre payante est le
prolongement naturel. Trois conséquences non négociables :

1. La page est **entièrement utile sans payer** — aucun e-mail demandé, aucun compte, aucun mur.
2. **L'offre naît du téléchargement, pas de la page.** Le moment où l'utilisateur voit le modèle vide
   à côté de son propre document est le seul où la mise à niveau se vend seule.
3. Le texte se tait partout ailleurs. *(Retour CEO : « trop de détails, trop de garde-fous, les pages
   semblent touffues ».)* Les garanties d'exécution vivent dans la **revue livrée** et dans les specs
   — pas sur la page qui vend.

#### Ce qui se branche sur l'existant

La page **remplace l'entrée « Modèles réglementaires — Bientôt »** du menu Outils
(`landing/checking-standard.html`, `.navmenu` et `.mnav`). Le workflow est déjà à moitié écrit :

| Existant | Devenir |
|---|---|
| `#tplmodal` — prévisualiseur | devient le **lecteur deux volets** (§ ci-dessous) |
| `#upmodal` — mise à niveau | garde son rôle, **change d'ordre** (§ ci-dessous) |
| `#tplup` « Mettre mon document au standard » | inchangé — le libellé est bon |
| `UPGRADABLE = ['rcp','notice','etiq']` (`referentiel.js:97`) | inchangé |
| `#upgo` → `mailto:contact@pharnos.com` (`checking.js:549`) | **remplacé** par le checkout Chariow |
| `MODELES` (`templates.js`) — ossatures reconstruites | **servent le vrai fichier** (§ ci-dessous) |

**Lexique verrouillé** — celui de la production, pas un nouveau : *modèle* (jamais « gabarit »),
*mise à niveau documentaire* (jamais « mise en conformité » côté client), *Mettre mon document au
standard*, *Un document* / *Les trois documents, mis en cohérence entre eux*.

#### 1. Le lecteur de modèle — deux volets

Le clic sur une carte ouvre un panneau au premier plan, en deux colonnes.

**Volet gauche — le vrai document.** Le fichier lui-même, rendu par `pdfjs-dist` (déjà présent,
`lib/pdfjs.ts`), barre de pagination, et un bouton **« Télécharger le modèle »** en évidence.
⚠️ **Pas d'ossature reconstruite** : le commentaire de `templates.js` (« *on ne redistribue pas un
document officiel sous notre marque* ») et le renvoi « obtenir auprès de l'autorité » **tombent** —
le modèle est public, officiel et libre de droit (CEO, 30/07/2026).

**Volet droit — l'offre.** L'accroche exploite l'instant, et rien d'autre :

> **Ce modèle est vide. Votre RCP, lui, ne l'est pas.**
> Le remplir, ce n'est pas du copier-coller : il faut retrouver chaque contenu dans votre document,
> le remettre à la rubrique que le modèle lui donne, et repérer ce qui manque. C'est ce que
> Regafy AI fait en quatre minutes.

Puis quatre preuves, le prix `29 € (19 000 FCFA)`, son bouton, et **sous lui** le bundle avec le sien.

#### 2. Un modèle par PAYS — la mention de vigilance 4.8

**Le fichier servi dépend du pays choisi**, parce que la rubrique 4.8 porte la mention de
pharmacovigilance nationale. Changer de pays **change le fichier**, pas seulement une étiquette.

Source unique : [`RA-source/Vigilance/INDEX-vigilance-UEMOA.md`](../RA-source/Vigilance/INDEX-vigilance-UEMOA.md),
déjà encodée dans `conformity-specs.ts` (`mentions[].requiredFor`).

| Pays | Mention en 4.8 |
|---|---|
| **Bénin** | formule neutre + ABMed — `vigilances.abmed@gouv.bj` |
| **Côte d'Ivoire** | formule neutre + AIRP — `pharmacovigilance@airp.ci` |
| **Sénégal** | formule neutre + ARP — `vigilances@arp.sn` |
| **Burkina Faso** | formule neutre + application **Med Safety** |
| Mali · Niger · Togo · Guinée-Bissau | **formule neutre seule** |

⚠️ **Trois pays sur huit publient une adresse. Le repli neutre est le cas COURANT, pas un cas
dégradé** — l'interface ne doit jamais le présenter comme une lacune.
⚠️ **Aucune adresse qui ne figure pas dans une source déposée.** Une adresse de vigilance inventée
serait recopiée dans des dossiers d'AMM réels.
⚠️ **Med Safety n'est pas propre au Burkina** (les lignes directrices AIRP la citent aussi) : c'est un
canal de notification, jamais un contact national.

**Implémentation** : 3 documents × 8 pays = **24 fichiers**, pré-générés ou produits à la volée
depuis `conformity-specs.ts`. La seconde voie est préférable — un modèle qui dérive de la même source
que le moteur ne peut pas diverger de lui.

#### 3. La modale de mise à niveau — l'ordre est la spécification

**Ne jamais ouvrir sur un prix.** L'ordre exact :

1. **Pays de dépôt**
2. **Activité réglementaire** — Nouvelle AMM / Renouvellement
3. **Dépôt du document**
4. *puis seulement* **le prix** `29 € (19 000 FCFA)` + son bouton
5. *sous lui* **le bundle** `69 € (45 000 FCFA)`, 87 € barré, −18 € + son bouton

⚠️ **Le fichier ne quitte pas le navigateur avant le paiement.** Il est sélectionné, affiché comme
déposé (« Prêt — il partira au traitement dès la commande »), mais **rien n'est envoyé au backend ni
au moteur**. Le sentiment que le document est déjà en place fait la conversion ; l'envoi réel se
fait au retour de paiement.

> **Conséquence technique à ne pas manquer** : le fichier doit **survivre au passage par
> `services.pharnos.com`**. Le conserver côté navigateur (mémoire ou IndexedDB, clé liée à la
> commande) et ne le poster qu'au retour. Sans cela, le client paie et se retrouve sans document —
> le pire échec possible de ce parcours.

⚠️ **La lecture de recevabilité passe donc APRÈS le paiement** (arbitrage CEO du 30/07/2026, il
annule ma proposition d'une lecture gratuite en amont). C'est ce qui donne son sens à la reprise
gratuite décrite plus haut : le seul filet contre un mauvais fichier est en aval.

#### 4. Démonstration

Un **spécimen fabriqué** (DEMOCILLINE 500 mg), joué sur les **écrans réels** de génération et de
livraison, avec bandeau. ⚠️ **Jamais un fichier client** — ni Gynoril ni KV-Kacin, ce sont des pièces
confiées. Le spécimen porte les défauts réels que le moteur sait corriger : numérotation décalée,
préclinique rangée dans la pharmacocinétique, tableau MedDRA absent.

#### 5. Avec et sans session

Même page, même URL. Seule la destination des livrables change : **lien tokenisé 30 jours** pour un
visiteur (même mécanique que la vue Agent en production), **espace de l'organisation** pour un compte.

⚠️ **Conséquence sur §B :** un paiement one-shot signifie que le client ferme l'onglet. Le pilotage
navigateur ne suffit plus — **le worker asynchrone devient obligatoire**, et non plus une option.

#### 6. Les quatre deltas de code, à faire ensemble

| Fichier | Aujourd'hui | À faire |
|---|---|---|
| `landing/checking.js:48` | `up1 = {xof:25000, eur:39}` · `up3 = {xof:60000, eur:92}` | `up1 = {xof:19000, eur:29}` · `up3 = {xof:45000, eur:69}` |
| `landing/checking.js:53` | `price()` rend € **ou** FCFA | rendre `29 € (19 000 FCFA)`, les deux langues |
| `landing/checking/templates.js` | ossatures + « on ne redistribue pas » | sert le fichier réel, par pays ; commentaire supprimé |
| `landing/checking.js:549` | `#upgo` → `mailto:` | checkout Chariow sur `services.pharnos.com` |

⚠️ **La landing promet encore « un Word éditable et son PDF »** (`.msafe` de `#upmodal`). Le livrable
verrouillé est de **cinq fichiers**. La promesse est en retard sur le produit, et en défaveur de la
vente.

---

## 3. Les décisions déjà prises — ne pas les rouvrir

| Décision | Où |
|---|---|
| Périmètre : le **document source désigné**, rien d'autre | étape 1 §1 |
| Le gabarit est le socle : **rien ne passe sous silence** | étape 1 §2 |
| « Sans objet » n'est **jamais** écrit par le moteur | étape 1 §2 |
| Rubrique 7 = **titulaire seul** ; le fabricant vit dans la notice | étape 1 §5 |
| Le statut se **recopie**, jamais ne se recalcule | étape 2 §2 |
| Livrable = **5 fichiers** : 2 documents en DOCX+PDF, 1 revue en PDF | étape 3 §1 |
| Nom : **Revue réglementaire du RCP** / **SmPC Regulatory Review** | étape 1 §7 |
| **Aucune marque de fournisseur** sur le document déposé | étape 3 §3 |
| Rapport dans la **langue du document téléversé** | étape 1 §7 |
| Marqueur : `[Non fourni, à compléter]` | étape 1 §2 |
| **Un paiement = un document** — ni abonnement, ni crédit, ni solde | §D |
| Prix **29 € (19 000 FCFA)** · bundle **69 € (45 000 FCFA)**, affiché SOUS le prix | §D |
| Le modèle officiel est **public et libre de droit** : servi et téléchargeable | §D bis |
| **Un modèle par pays** — la mention 4.8 en dépend | §D bis |
| Le fichier **ne quitte pas le navigateur avant paiement** | §D bis |
| Lexique client : **modèle**, **mise à niveau documentaire**, jamais « gabarit » | §D bis |

---

## 4. Ce que le front doit afficher, et pourquoi

Le moteur rend par rubrique un **verdict** que l'interface doit savoir montrer — sans quoi les
garanties construites en profondeur resteraient invisibles :

| Champ | Ce qu'il dit | Traitement attendu |
|---|---|---|
| `status` | `filled` · `partial` · `missing` | le compteur de rubriques à compléter |
| `verdict` | citation `verified` · `not_found` · `unverifiable`… | `unverifiable` = le contrôle n'a **pas** eu lieu |
| `downgradeReason` | `evidence` · `figures` · `empty_content` · `budget` | `budget` est un défaut de plateforme, pas du modèle |
| `ungrounded` | valeurs chiffrées non retrouvées | à montrer, pas seulement à compter |
| `attempts` | 1 ou 2 | alimente la mesure de coût |
| `verdict: verified_ocr` | citation retrouvée dans un texte **reconstruit** | garantie réelle, moindre — à distinguer de `verified` |
| `figuresAdvisory` | source scannée : `ungrounded` = valeurs **à relire** | libellé distinct ; jamais « valeur inventée » |

⚠️ **`isComplete` du pool refuse de tenir un lot partiel pour livrable.** Le front ne doit jamais
présenter 27 rubriques sur 29 comme un document fini : c'est le défaut du document tronqué que le
lot M0 avait déjà corrigé côté moteur.

---

## 5. Recette de bout en bout

- [ ] Pays et activité recueillis **avant** le premier appel, et présents dans chaque prompt
- [ ] Mention de vigilance conforme au pays choisi
- [ ] Rubriques 8, 9, 10 conformes à l'activité choisie
- [ ] 59 appels enchaînés sous **5 minutes** (`concurrency: 6`, `warmupFirst: true`)
- [ ] Journal du cache non nul : `cacheRead` élevé dès la deuxième rubrique
- [ ] Cinq fichiers produits, parité FR/EN mécanique (rubriques, sous-rubriques, marqueurs)
- [ ] Aucun lot partiel présenté comme complet
- [ ] Un PDF **scanné** est détecté, océrisé côté navigateur, et traité — pas refusé
- [ ] Sur un scan : `sourceKind: 'ocr'` envoyé, `filePath` **et** `text` présents dans la requête
- [ ] Sur un scan : aucune rubrique rétrogradée pour cause de `figures` (contrôle consultatif)
- [ ] Sur un scan : l'encart de la revue est présent, et les valeurs à relire sont listées
- [ ] Sur un scan : `tesseract.js` n'est téléchargé **que** dans ce cas
- [ ] Sur un scan : numéros de page et en-têtes répétés retirés du texte de contrôle
- [ ] Sur un scan : un dosage volontairement altéré dans le document produit est bien REFUSÉ
- [ ] Un fichier illisible même après OCR nomme la cause (`reason: 'no_text_layer'`)
- [ ] Un journal ou une lettre déposé comme RCP est refusé, avec le type réel nommé et une citation
- [ ] Un refus ne consomme aucun crédit, et le message le DIT
- [ ] Le dépôt suivant reprend la même commande, sans nouveau paiement
- [ ] Un RCP médiocre ou scanné PASSE — recevabilité n'est pas qualité
- [ ] Achat Chariow sur `services.pharnos.com`, `frame-src` seul ajouté à la CSP

### Bibliothèque réglementaire (§D bis)

- [ ] Le modèle se télécharge **sans compte, sans e-mail, sans clic supplémentaire**
- [ ] Le volet gauche affiche le **fichier réel**, pas une ossature reconstruite
- [ ] Changer de pays **change le fichier téléchargé**, pas seulement le libellé
- [ ] Rubrique 4.8 : BJ / CI / SN portent leur adresse ; BF porte Med Safety ; les 4 autres la
      formule neutre **seule** — et aucun écran ne présente le repli neutre comme une lacune
- [ ] Aucune adresse de vigilance absente de `INDEX-vigilance-UEMOA.md` n'apparaît nulle part
- [ ] La modale de mise à niveau s'ouvre sur **le pays**, jamais sur un prix
- [ ] Ordre respecté : pays → activité → dépôt → prix → bundle
- [ ] Le bundle est **sous** le prix, avec **son propre bouton**
- [ ] Prix affiché `29 € (19 000 FCFA)` / `69 € (45 000 FCFA)` — **dans les deux langues**
- [ ] **Aucune requête réseau portant le fichier avant le paiement** (à vérifier dans l'onglet Réseau)
- [ ] Le fichier **survit au passage par `services.pharnos.com`** et part au retour de paiement
- [ ] La démonstration tourne sur un **spécimen fabriqué**, jamais sur un fichier client
- [ ] La démonstration emprunte les écrans réels de génération et de livraison, avec bandeau
- [ ] Aucun écran n'affiche de solde, de crédit restant ni de forfait
- [ ] Un second paiement est exigé pour un second document
- [ ] Un refus après paiement ne rouvre la commande que pour **ce document**, 3 dépôts au plus
- [ ] Sans session : livrables par lien tokenisé 30 jours ; avec session : dans l'espace de l'org
- [ ] L'entrée « Modèles réglementaires — Bientôt » du menu Outils pointe vers la page
- [ ] La promesse `.msafe` annonce bien **cinq fichiers**, pas « un Word et son PDF »
- [ ] Sans compte : les livrables arrivent par lien tokenisé (30 j) et l'e-mail le dit
