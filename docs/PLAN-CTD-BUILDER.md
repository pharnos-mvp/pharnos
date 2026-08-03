# PLAN — CTD Builder (édition autonome, hors ligne)

> **Nature** : produit autonome vendu au crédit ou à la licence annuelle — **sans Regafy AI,
> sans synchronisation en ligne**.
> **Rôle** : entonnoir vers l'écosystème RIM de Pharnos.
> **Plans liés** : [PLAN-CHARIOW.md](PLAN-CHARIOW.md) (encaissement, table `orders`, crédits).
> **Dernière mise au propre** : 2026-07-28.

---

## 0. État et prochaine action

**B0 livré (2026-08-03) — la chaîne de fabrication du produit existe et se vérifie.**
Seconde cible de build sur la **même base de code** (« on ne reconstruit rien, on scinde »),
publication sur **`pharnos.com/ctd-builder/`**, et surtout : l'isolation réseau n'est plus une
intention, c'est un test qui casse le build (§10). Le socle applicatif existe
(`web/src/features/workspace/`), les trois produits Chariow restent à créer, et le chantier
s'ouvre **après M3** (banc d'essai du moteur IA) — sauf B1 et B2, indépendants de l'IA.

**Aucun projet Cloudflare supplémentaire** (arbitrage CEO du 2026-08-03) : le builder est assemblé
dans le déploiement de la vitrine, cf. §10.1. Rien n'est en attente côté infrastructure.

**Prochaine action : B1** — le SCINDEMENT du workspace. C'est là qu'est le travail réel, et il a
un point dur identifié : `NewDossierPage.tsx` importe `syncDossiers` **en statique**
(`from './dossier-sync'`), ce que le garde-fou d'isolation refuse — à juste titre. Il faut rendre
la synchronisation **injectée** plutôt qu'importée, pour que le même écran serve les deux offres.

⏳ **Question ouverte, à trancher avant B1** : un dossier se crée aujourd'hui à partir d'un
**produit du Catalogue** (`listProducts`) et de `@/features/variations/*`. Le builder embarque-t-il
un catalogue minimal (produit + organisations), ou bien la création de dossier est-elle
simplifiée pour cette offre ? Les deux sont défendables, ils ne coûtent pas la même chose.

**L'entrée dans le header de `pharnos.com` n'est PAS encore posée**, et c'est délibéré : elle
pointerait aujourd'hui vers une coquille. Elle arrive avec B1 (§7.3).

---

## 1. Le pivot : la limitation est l'argument de vente

Un responsable des affaires réglementaires qui envisage un SaaS a **une** angoisse avant toutes les
autres : _« mon dossier d'AMM va se retrouver sur le serveur de quelqu'un d'autre »_. C'est la raison
pour laquelle la page Checking Standard doit déjà promettre « espace chiffré · NDA sur demande ».

L'édition autonome supprime la question :

> **Vos documents ne transitent jamais par les serveurs de Pharnos.**

Ce n'est pas une consolation pour un produit dégradé : c'est le **meilleur argument commercial du
catalogue**, et il n'existe que parce qu'il n'y a pas de synchronisation. On ne cache pas la limite,
on la vend.

**Précision de vocabulaire, importante.** « Hors ligne d'abord » ne veut pas dire « jamais connecté » :
la plupart des utilisateurs seront en ligne pendant qu'ils montent leur dossier. Les deux promesses
réelles sont :

1. le builder **fonctionne** sans connexion ;
2. les fichiers **ne sont jamais synchronisés chez nous** — ils restent sur le poste, ou dans le
   dossier que l'utilisateur a choisi.

Corollaire de discipline produit : **toute fonctionnalité de l'écosystème qui fuiterait dans
l'édition autonome affaiblirait à la fois l'abonnement et cet argument.**

---

## 2. Ce que l'édition autonome contient — et ne contient pas

|                                                         | CTD Builder autonome | Abonnement (écosystème RIM) |
| ------------------------------------------------------- | -------------------- | --------------------------- |
| Arborescence CTD / eCTD par pays                        | ✅                   | ✅                          |
| Dépôt et rangement des pièces                           | ✅ (local)           | ✅                          |
| Contrôles de structure et de complétude                 | ✅                   | ✅                          |
| Compilation du paquet                                   | ✅ (au crédit)       | ✅ (illimité)               |
| **Synchronisation multi-postes**                        | ❌                   | ✅                          |
| **Travail à plusieurs**                                 | ❌                   | ✅                          |
| Copilote Regafy AI                                      | ❌                   | ✅                          |
| Upgrade RCP / notice / étiquetage                       | ❌                   | ✅                          |
| Traduction                                              | ❌                   | ✅                          |
| Cockpit produit, cycle de vie, correspondance, relances | ❌                   | ✅                          |

**Le mur est la collaboration, et il se heurte dès le deuxième jour** — pas au sixième mois.
Un service RA à deux personnes le rencontre immédiatement. C'est le déclencheur d'abonnement le plus
honnête qu'on puisse construire : ni artificiel, ni caché.

⚠️ **Ce n'est pas une frontière de volume, c'est une frontière de périmètre.** Un labo qui a besoin
du copilote, de l'upgrade documentaire ou du suivi de dossier n'a aucune alternative dans les
crédits. Il n'y a donc pas d'arbitrage de prix possible entre les deux offres, et pas de plancher à
défendre. Le builder vendu au crédit doit rester **volontairement dépouillé**.

---

## 3. Tarifs

Coût marginal réel : **zéro token IA, zéro stockage, zéro bande passante.** La seule ligne de coût
est la commission Chariow. On tarife donc pour l'adoption, pas pour couvrir un coût.

**Barème arrêté par le CEO le 2026-07-28.**

| Offre                | Compilations            | Prix      | € / compilation | FCFA      | Net après 15 % |
| -------------------- | ----------------------- | --------- | --------------- | --------- | -------------- |
| **Essai**            | 3                       | **49 €**  | 16,33 €         | 32 150 F  | 27 328 F       |
| **Travail** ★        | 20                      | **249 €** | 12,45 € (−24 %) | 163 350 F | 138 848 F      |
| **Licence annuelle** | **illimitées, 12 mois** | **490 €** | —               | 321 450 F | 273 233 F      |

Trois intentions, pas trois volumes : **j'essaie · je travaille · je ne compte plus.**

- **49 € est déjà l'ancre du catalogue** (Audit Regafy AI) : « 49 € — trois compilations, ou un
  audit ». Le prospect n'a pas de nouveau repère à apprendre.
- **Validité des packs : 12 mois.** Ni illimité (passif comptable ouvert) ni court (perçu comme punitif).
- **La licence devient rentable vers la 39ᵉ compilation**, soit ~3 par mois. Mais ce n'est pas
  l'argument : elle se vend à la **garantie** (§4), pas au volume. C'est la seule offre du catalogue
  dont l'argument principal n'est pas un compteur.
- Positionnement : 490 €/an = **27 % d'un abonnement Pro annuel** (100 000 F/mois ≈ 1 830 €/an).
  Assez cher pour signaler le sérieux, assez loin pour ne pas concurrencer la plateforme.

### 3.1 ⚠️ Les mises à jour du référentiel sont incluses dans **toutes** les offres

Question tranchée : **non**, on ne réserve pas l'arborescence à jour à la licence annuelle.

Un builder dont l'arborescence est gelée devient **activement dangereux** au bout de quelques mois —
il fabrique des dossiers qui seront arrêtés à la réception, c'est-à-dire exactement le sinistre que
le produit prétend éviter. Un seul dossier refusé à cause de nous coûterait plus cher que toutes les
licences vendues, et en crédibilité bien davantage.

**Le référentiel à jour est dû à quiconque a une offre en cours de validité.** La licence vend les
compilations illimitées et la durée — **jamais l'exactitude de la donnée**.

---

## 4. Le moat : une arborescence toujours à jour, même hors ligne

C'est **le** différenciateur défendable. Un concurrent copie un arbre CTD en une semaine ; il ne
copie pas l'engagement de le tenir à jour, pays par pays, année après année. Et c'est précisément ce
qu'un builder hors ligne rend difficile — donc précieux.

### 4.1 Deux choses se mettent à jour, à ne jamais confondre

|                        | Quoi                                             | Rythme                | Mécanisme                   |
| ---------------------- | ------------------------------------------------ | --------------------- | --------------------------- |
| **(a) L'application**  | code du builder, corrections, fonctionnalités    | au gré des livraisons | **PWA · service worker**    |
| **(b) Le référentiel** | arborescence Module 1 par pays, pièces attendues | au gré des agences    | **payload versionné signé** |

Les mêler serait une faute : le référentiel doit pouvoir bouger **sans** redéployer l'application,
et l'application sans invalider les dossiers en cours.

### 4.2 Le référentiel — le mécanisme existe déjà

Le socle versionné construit pour l'écosystème (`ref_versions`, `getModule1Tree(format, activity,
variations)`, `isTreeOutdated`, `mergeDefaultTree`, écran de fusion ligne à ligne) **est exactement
ce dont l'édition autonome a besoin**. Il n'y a pas de second système à écrire : il y a un payload à
exposer publiquement, signé, et à mettre en cache localement.

```
poste connecté   →  GET référentiel courant (signé)  →  cache local
                    isTreeOutdated() ?  →  bannière + écran de fusion (déjà en prod)
poste hors ligne →  travaille sur la version en cache, VERSION AFFICHÉE EN PERMANENCE
```

**Trois invariants non négociables :**

1. **Chaque dossier porte la version de référentiel sur laquelle il a été construit.**
2. **Une compilation sur référentiel périmé est bloquée ou explicitement assumée** par l'utilisateur,
   jamais silencieuse. Le silence, ici, c'est le sinistre.
3. **Le payload est vérifié par signature**, jamais lu en confiance — même règle que le jeton de
   crédits et que les Pulses Chariow.

⚠️ Piège hérité, documenté : `isTreeOutdated` et `mergeDefaultTree` **doivent** recevoir
`getModule1Tree(format, activity, variations)`. Sans ça : fausse bannière et fusion automatique
intempestive.

### 4.3 Le rendez-vous en ligne — un seul geste, deux usages

Le hors-ligne n'est pas le jamais-en-ligne. La réservation de crédits (§5.2) impose déjà une
connexion. **On fusionne les deux : la poignée de main qui réserve des crédits rafraîchit le
référentiel.** Une requête, deux effets, et le référentiel ne peut jamais être périmé de plus de
N compilations.

Pour la **licence annuelle**, il n'y a pas de réservation — donc un battement propre :
**vérification tous les 30 jours, avec 14 jours de grâce.** Assez fréquent pour tenir le référentiel
frais, assez souple pour qu'un déplacement ne bloque personne.

**Le mécanisme de mise à jour est aussi le mécanisme de rétention.** Le message _« votre arborescence
date de quatre mois — connectez-vous pour la mettre à jour »_ est à la fois un avertissement de
sécurité réglementaire et une relance commerciale. Les deux sont légitimes, ce qui est rare.

### 4.4 L'application — PWA, et deux pièges maison

Service worker classique : téléchargement des nouveaux actifs en ligne, activation au lancement
suivant. Deux dangers déjà rencontrés dans ce dépôt :

- ⚠️ **Coquille ancienne + chunks neufs = écran mort.** Le service worker sert un `index` en cache
  pendant que les chunks versionnés ont changé d'URL. C'est la classe de panne qui a imposé la règle
  « **interdit de neutraliser `vite:preloadError`** ; tout `React.lazy` passe par `lazyChunk` ».
  **Activation atomique obligatoire** : un bundle entier, ou rien.
- ⚠️ **Origine séparée.** IndexedDB est partagée par origine, et le dépôt porte déjà une garde de
  purge au changement de compte. Faire cohabiter un builder sans compte et une plateforme
  multi-tenant sur la même origine, c'est programmer une collision de caches.
  **→ Le builder est servi par `pharnos.com`, la plateforme par `app.pharnos.com`.** Ce sont deux
  origines distinctes : la contrainte est satisfaite **sans troisième domaine**. Un
  `builder.pharnos.com` réglerait le même problème en ajoutant un projet Cloudflare, un
  certificat et une surface à surveiller — arbitrage tranché par le CEO le 2026-08-03.

---

## 5. Stack et faisabilité

### 5.1 Le socle existe déjà

`web/src/features/workspace/` **est** le CTD Builder : `ArborescenceTree.tsx`, `ctd-full-outline.ts`,
`dossier-repository.ts`, `dossier-attachments-repository.ts`. Dexie 4.4.3 est en place.

**Fait décisif de faisabilité** : stockage local et synchronisation sont **déjà séparés au niveau des
fichiers** — `dossier-repository.ts` d'un côté, `dossier-sync.ts` de l'autre ; idem pour les pièces
jointes. L'édition autonome n'est donc pas une réécriture : c'est **le même dépôt local, sans le
module de synchronisation et sans l'outbox**.

### 5.2 Les crédits — « télécharger » ses crédits

Un compteur stocké localement se falsifie en dix secondes. Comment facturer un produit hors ligne ?

**Par la réservation.** Quand le poste est connecté, l'application _réserve_ N crédits : le serveur
**décrémente immédiatement** et renvoie un jeton signé contenant N jetons de compilation. Le poste
les consomme ensuite **hors ligne**, et réconcilie à la prochaine connexion.

- Aucune fraude possible : le décompte serveur a déjà eu lieu à la réservation.
- Vraie capacité hors ligne : on peut compiler dans un avion.
- Métaphore immédiate pour l'utilisateur : il _télécharge_ ses crédits.

⚠️ **Le jeton est vérifié par signature, jamais lu en confiance.**

### 5.3 Trois modes de stockage — et pourquoi le Drive passe par le dossier

| Mode                       | Où vivent les fichiers       | Sauvegarde               | Multi-poste                            | Navigateurs |
| -------------------------- | ---------------------------- | ------------------------ | -------------------------------------- | ----------- |
| **A — Navigateur** (repli) | IndexedDB                    | export `.pharnos` manuel | non                                    | tous        |
| **B — Dossier local ★**    | dossier choisi sur le disque | celle du dossier         | **oui**, si le dossier est synchronisé | Chrome/Edge |
| **C — API Drive (OAuth)**  | Google Drive via API         | oui                      | oui                                    | tous        |

**Recommandation : B par défaut quand le navigateur le permet, A en repli, C plus tard — voire jamais.**

Le raisonnement tient en une phrase : **tout poste RA d'entreprise a déjà un dossier Google Drive ou
OneDrive synchronisé sur son disque.** Google Drive Desktop transforme le Drive en un dossier
ordinaire (`G:\Mon Drive\`) : le navigateur ne sait même pas que c'est un Drive. Pointer le builder
dessus donne tout ce qu'apporterait l'API…

| Ce que l'API Drive imposerait                                                                                                         | Le dossier synchronisé                                            |
| ------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Écran de consentement OAuth, politique de confidentialité à réviser                                                                   | un sélecteur de dossier — **le choix EST le consentement**        |
| Un jeton de rafraîchissement à stocker et protéger                                                                                    | aucun jeton                                                       |
| Portée `drive.file` obligatoire (la portée large déclenche une **évaluation de sécurité CASA**, plusieurs milliers de dollars par an) | aucune portée                                                     |
| Quotas d'API, pannes Google dans notre chemin critique                                                                                | **aucun appel réseau**                                            |
| Google seulement                                                                                                                      | **Drive, OneDrive, Dropbox, NAS, partage réseau — identiquement** |

Ce dernier point n'est pas mineur : beaucoup de laboratoires sont sur Microsoft, pas sur Google.

**Deux moments distincts, deux besoins** — et ils ne s'opposent pas :

|             | **La sortie** (à livrer en premier)                                   | **L'atelier** (mode confort)                              |
| ----------- | --------------------------------------------------------------------- | --------------------------------------------------------- |
| Quoi        | le paquet compilé : télécharger, ou enregistrer dans un dossier Drive | tout le chantier vit dès le départ dans le dossier choisi |
| Protège     | le **livrable**                                                       | le **travail en cours**                                   |
| Répond à    | « où je mets mon paquet »                                             | « et si mon ordinateur meurt en plein montage ? »         |
| Navigateurs | tous                                                                  | Chrome / Edge                                             |
| Effort      | **une journée**                                                       | un vrai lot (B6)                                          |

Ni l'un ni l'autre n'a besoin de l'API Google.

**Quand l'API OAuth vaudrait le coup** : un contexte sans système de fichiers — iPad, ou un
navigateur sans File System Access. Lot optionnel tardif (B11), pas une fondation.

### 5.4 ⚠️ La promesse s'adapte au mode choisi

Si l'utilisateur range ses dossiers dans un dossier Drive, ses fichiers **partent chez Google** —
pas chez nous. Écrire « vos documents ne quittent jamais votre poste » deviendrait faux, et c'est
exactement le genre d'imprécision qu'une diligence d'acheteur pharmaceutique relève.

La formulation retenue, **vraie dans les trois modes** :

> **Vos documents ne transitent jamais par les serveurs de Pharnos.**

C'est aussi celle qui répond à la seule question que le client se pose vraiment.

### 5.5 Stockage — le vrai risque technique

| Sujet                       | Décision                                                                                                                                                |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Quota                       | `navigator.storage.persist()` **obligatoire** au premier lancement. Sans permission durable, le navigateur peut évincer IndexedDB sous pression disque. |
| Gros dossiers               | Un CTD, ce sont des PDF : centaines de Mo. Espace consommé affiché **dans le tableau de bord**, pas dans un menu caché.                                 |
| Poste perdu = travail perdu | **Export `.pharnos` du dossier complet**, rappel actif si aucun export depuis 7 jours. Non négociable : c'est la contrepartie honnête du hors-ligne.    |

### 5.6 Compilation → paquet ZIP

Pas de dépendance ZIP **de production** dans `web/` aujourd'hui — `jszip` y figure, mais en
`devDependencies` seulement (générateur `build-landing-modeles.mjs` et tests) : il n'entre dans
aucun artefact livré, et le choix ci-dessous reste donc entier.
**Retenir `client-zip`, pas `jszip`** : les PDF sont
déjà compressés (la compression n'apporte rien), `client-zip` diffuse en flux au lieu de tenir le
paquet entier en mémoire, et pèse ~3 Ko contre ~100 Ko.

### 5.7 Risques assumés, écrits noir sur blanc

1. **Perte du poste = perte des dossiers.** Atténué par l'export, jamais supprimé. À dire sur la page de vente.
2. **Éviction IndexedDB** si `persist()` est refusé — bandeau d'alerte explicite.
3. **Aucune collaboration.** C'est voulu (§2), mais doit être lisible **avant** l'achat.
4. **Safari/Firefox** : pas de File System Access → repli mode A, et l'annoncer.

---

## 6. Le tableau de bord — quatre éléments, pas cinq

Pas de graphique, pas de fil d'activité, pas de notifications.

```
┌──────────────────────────────────────────────────────┐
│  7 compilations restantes        [ Acheter ]         │
│  valables jusqu'au 28 juillet 2027                   │
├──────────────────────────────────────────────────────┤
│  [ + Nouveau dossier ]                               │
├──────────────────────────────────────────────────────┤
│  Amoxicilline 500 mg — Bénin      modifié il y a 2 h │
│  Paracétamol 1 g — Sénégal        modifié hier       │
├──────────────────────────────────────────────────────┤
│  ● Poste local · non synchronisé                     │
│    Référentiel Bénin v12 — à jour                    │
│    Dernier export : il y a 3 jours    [ Exporter ]   │
└──────────────────────────────────────────────────────┘
```

**Le bandeau du bas est un choix produit, pas un aveu.** Il rassure (rien ne part), rappelle la
limite (rien ne revient si le poste meurt), et affiche la version de référentiel — le seul indicateur
réglementairement critique. C'est lui qui portera plus tard le lien vers l'abonnement.

---

## 7. La page de vente

### 7.1 Structure

| Section                 | Rôle                                                                 |
| ----------------------- | -------------------------------------------------------------------- |
| **Hero**                | La promesse de confidentialité, pas la promesse de vitesse           |
| **Le problème**         | Monter un Module 1 à la main, pays par pays                          |
| **Comment ça marche**   | 3 étapes, une phrase chacune                                         |
| **Toujours à jour**     | Le moat (§4) — c'est ce qui justifie la licence                      |
| **Inclus / non inclus** | Le tableau du §2, **tel quel** — la transparence est l'argument      |
| **Tarifs**              | 3 offres, « Travail » mise en avant                                  |
| **FAQ**                 | Hors ligne · poste perdu · changement d'ordinateur · confidentialité |
| **CTA**                 | Achat direct, sans création de compte                                |

### 7.2 Copywriting

**Hero**

> ## Montez vos dossiers CTD sans les confier à personne
>
> Le CTD Builder de Pharnos fonctionne entièrement sur votre poste. Arborescence par pays,
> rangement des pièces, contrôles de structure, compilation du paquet prêt à déposer.
> **Vos documents ne transitent jamais par nos serveurs** — ils restent sur votre disque, ou dans le
> dossier de votre choix : Drive, OneDrive, un partage réseau.
>
> [ Voir les tarifs ] · À partir de 49 € · Sans abonnement, sans compte à créer

**Comment ça marche**

> 1. **Vous choisissez le pays de dépôt.** L'arborescence du Module 1 se construit selon les
>    exigences de ce pays — c'est le seul module du CTD qui varie dans l'UEMOA.
> 2. **Vous rangez vos pièces.** Le builder signale ce qui manque, ce qui est au mauvais format,
>    ce qui ne concorde pas.
> 3. **Vous compilez.** Un paquet nommé et ordonné, prêt à déposer.

**Toujours à jour**

> ### Une arborescence qui suit les agences
>
> Les exigences changent. Un dossier monté sur une arborescence périmée est arrêté à la réception —
> redevances engagées, cycle de dépôt à recommencer.
> Le builder met son référentiel à jour dès que vous êtes connecté, et **vous dit toujours sur quelle
> version vous travaillez**. Une compilation sur une arborescence périmée ne se fait jamais en silence.

**Bloc honnêteté** — celui qui fera la différence auprès d'un RA

> ### Ce que cette édition ne fait pas
>
> Elle ne synchronise rien. Vos dossiers vivent sur ce poste et nulle part ailleurs — c'est ce qui
> garantit leur confidentialité, et c'est aussi une contrainte : pour travailler à plusieurs ou
> retrouver vos dossiers sur un autre ordinateur, il vous faudra la plateforme Pharnos.
> Elle n'inclut ni le copilote Regafy AI, ni la mise en conformité documentaire, ni la traduction.
>
> **Exportez régulièrement.** Le builder vous le rappellera.

**FAQ — la question qui compte**

> **Que se passe-t-il si je change d'ordinateur ?**
> Exportez votre dossier depuis le builder, ouvrez-le sur le nouveau poste. L'export est un fichier
> unique qui contient tout : arborescence, pièces, métadonnées. Si vous voulez que ce soit
> automatique, c'est exactement ce que fait la plateforme Pharnos.

### 7.3 Emplacement dans l'en-tête

⚠️ **Tension avec la règle établie** : l'en-tête tient en trois entrées — Plateforme / Outils ▾ /
Tarifs — et la règle veut qu'un nouvel outil **gratuit** devienne une ligne sous « Outils ».

Le CTD Builder n'est pas un outil gratuit d'acquisition : c'est une **ligne de produit payante avec
son propre tunnel**. L'enterrer dans un menu que le visiteur lit comme « gratuités » coûterait des
conversions et brouillerait la promesse.

**Recommandation : quatrième entrée de premier niveau.**

```
Plateforme   CTD Builder   Outils ▾   Tarifs
```

Repli acceptable si le CEO tient aux trois entrées : une ligne en tête de « Outils ▾ » **avec un
badge de prix** — mais c'est le deuxième choix.

---

## 8. Lots

| Lot       | Contenu                                                                                                                                                     | Dépend de                      |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| **B0** ✅ | **Socle de fabrication** : cible de build séparée, CSP `connect-src 'self'`, contrôle d'isolation bloquant, workflow de déploiement, coquille + `persist()` | —                              |
| **B1**    | Édition autonome : `workspace` sans `*-sync.ts` ni outbox · `persist()` · alerte quota                                                                      | B0                             |
| **B2**    | Compilation → ZIP (`client-zip`) · **destination du paquet** (disque ou dossier Drive) · export/import `.pharnos`                                           | B1                             |
| **B3**    | Crédits : réservation signée, consommation hors ligne, réconciliation                                                                                       | B2, `orders` (PLAN-CHARIOW §6) |
| **B4**    | Tableau de bord 4 éléments                                                                                                                                  | B3                             |
| **B5**    | Page de vente + entrée d'en-tête + 3 produits Chariow                                                                                                       | B3                             |
| **B6**    | **Mode atelier** : File System Access API (Chrome/Edge) + repli                                                                                             | B2                             |
| **B7**    | Passerelle vers l'abonnement : import d'un `.pharnos` dans un compte                                                                                        | B2                             |
| **B8**    | **Référentiel hors ligne** : payload public signé, cache, `isTreeOutdated`, blocage de compilation sur arbre périmé                                         | B1                             |
| **B9**    | **PWA** : service worker, activation atomique, sous `pharnos.com/ctd-builder/`                                                                              | B1                             |
| **B10**   | **Licence annuelle** : vérification à 30 jours, grâce 14 jours, rafraîchissement du référentiel                                                             | B3, B8                         |
| **B11**   | _(optionnel, tardif)_ API Drive OAuth `drive.file` — uniquement pour les contextes sans système de fichiers                                                 | B6                             |

**Deux contraintes d'ordre :**

- **B8 avant B10, sans exception.** Vendre 490 € une garantie d'arborescence à jour sans le mécanisme
  qui la tient serait une promesse creuse — et sur un produit réglementaire, une promesse creuse est
  un risque juridique, pas une approximation marketing.
- **B7 est le lot qui rentabilise tout le reste.** Sans lui l'entonnoir fuit : un client qui s'abonne
  doit pouvoir remonter ses dossiers locaux en un clic, sinon il recommence — et il ne s'abonne pas.

---

## 9. Recette

- [ ] Poste déconnecté : montage complet d'un dossier, aucune requête réseau émise
- [ ] Réservation de 3 crédits en ligne → 3 compilations hors ligne → réconciliation correcte
- [ ] Jeton de crédits modifié à la main → **rejeté** (signature)
- [ ] Référentiel périmé → compilation **bloquée ou explicitement assumée**, jamais silencieuse
- [ ] Chaque dossier affiche la version de référentiel sur laquelle il est bâti
- [ ] Mise à jour applicative : nouvelle version activée **atomiquement**, aucun écran mort
- [ ] `persist()` refusé → bandeau d'alerte visible
- [ ] Export `.pharnos` → réimport sur un autre poste → dossier identique
- [ ] Import d'un `.pharnos` dans un compte abonné (B7) → dossier complet en ligne
- [ ] Safari/Firefox : repli mode A fonctionnel, limitation annoncée

---

## 10. Fabrication et déploiement (lot B0 — livré)

### 10.1 Deux produits, deux cibles, une seule base de code

`web/` produit désormais **deux artefacts** depuis les mêmes sources :

|              | Plateforme                    | CTD Builder                                   |
| ------------ | ----------------------------- | --------------------------------------------- |
| Config       | `vite.config.ts`              | `vite.builder.config.ts`                      |
| Entrée       | `index.html` → `src/main.tsx` | `index.builder.html` → `src/builder/main.tsx` |
| Sortie       | `web/dist/`                   | `web/dist-builder/`                           |
| Assemblage   | —                             | `landing/ctd-builder/` (non versionné)        |
| En-têtes     | `public/_headers`             | section `/ctd-builder/*` de `landing/_headers` |
| URL publique | `app.pharnos.com`             | `pharnos.com/ctd-builder/`                    |
| Projet Pages | `pharnos`                     | `pharnos-landing` (le même que la vitrine)    |
| Workflow     | `deploy.yml`                  | `deploy-landing.yml`                          |

**Pourquoi aucun projet Cloudflare supplémentaire.** Un projet Pages publie **un** dossier : deux
workflows visant le même projet s'écraseraient. Et la seule raison technique qui aurait justifié un
domaine à part — la séparation des bases IndexedDB (§4.4) — est déjà acquise, puisque
`pharnos.com` et `app.pharnos.com` sont deux origines distinctes. Le builder est donc **assemblé
dans le déploiement de la vitrine**, par un seul workflow.

```bash
npm run dev:builder       # développement (sert bien l'entrée du BUILDER, pas celle de l'app)
npm run build:builder     # build + contrôle d'isolation
npm run assemble:builder  # web/dist-builder/ → landing/ctd-builder/
npm run headers:builder   # CSP publiée : connect-src 'self' EXACTEMENT
npm run preview:builder   # servir dist-builder/ localement
```

**Pourquoi deux configurations et non un drapeau** : les deux artefacts n'ont ni le même
périmètre, ni la même CSP, ni le même cycle de déploiement — et le builder doit pouvoir prouver
ce qu'il **ne** contient **pas**. Un drapeau se trompe en silence ; deux cibles se comparent.

### 10.2 La promesse de confidentialité est tenue par deux verrous, pas par une phrase

C'est le point le plus important du lot, et il vaut d'être écrit sans détour : « vos documents ne
transitent jamais par les serveurs de Pharnos » (§1) est une affirmation qu'un acheteur
pharmaceutique fera vérifier. Elle repose donc sur deux mécanismes indépendants :

| Verrou                            | Où                                                                    | Ce qu'il empêche                                                                                                                                                                                  | Qui il protège    |
| --------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| **CSP `connect-src 'self'`**      | section `/ctd-builder/*` de `landing/_headers`                                         | Toute requête **de fond** vers une autre origine — `fetch`, XHR, WebSocket, EventSource, `sendBeacon` — quel que soit le code livré                                                               | **L'utilisateur** |
| **Contrôle d'isolation du build** | `web/src/builder/isolation.ts`, branché dans `vite.builder.config.ts` | L'**émission** d'un artefact contenant une dépendance interdite (client réseau, `*-sync.ts`, outbox, télémétrie, authentification) **ou** une adresse absolue / primitive de sortie non autorisée | **La promesse**   |

⚠️ **Ce que la CSP ne couvre pas, et qu'il faut savoir avant de le promettre à un acheteur :**
la **navigation de premier niveau**. `location.href = 'https://ailleurs/?d=' + données` échappe
à la CSP — la directive `navigate-to` a été retirée de la spécification et n'est implémentée
nulle part. C'est précisément la raison d'être du second verrou, et pourquoi ni l'un ni l'autre
ne suffit seul.

Le second verrou a **deux étages**, et le second étage n'est pas un luxe :

1. **Dépendances** — les modules réellement émis dans les chunks (pas ceux que Rollup a seulement
   résolus).
2. **Capacité** — le **code** émis, chunks _et_ assets JS : toute adresse absolue hors liste
   blanche, toute primitive de sortie (`sendBeacon`, `WebSocket`, `EventSource`,
   `XMLHttpRequest`, `importScripts`).

L'étage 2 existe parce que l'étage 1 a **deux angles morts**, tous deux constatés en revue de ce
lot, sondes à l'appui :

- un `fetch('https://…', { body: dossier })` écrit à la main n'importe **rien** d'interdit ;
- Vite compile les **web workers dans un build imbriqué** et les émet en **asset** :
  `chunk.modules` ne les voit jamais. Neuf caractères — `?worker` — suffisaient à faire entrer
  `@supabase/supabase-js` entier, avec l'URL du projet de production, dans un build **vert**.
  Le garde-fou est désormais appliqué aussi aux builds de workers (`worker.plugins`).

Trois tests négatifs sont vérifiés en conditions réelles : import direct, import via worker,
`fetch` écrit à la main — les trois font échouer le build avec le nom du fichier fautif et la
conduite à tenir. La logique est couverte par `src/builder/isolation.test.ts` (17 cas).

Biais assumé : le contrôle est **conservateur**. `chunk.modules` peut mentionner un module
entièrement secoué par l'optimiseur (réexport de barril) et provoquer un échec à expliquer —
mieux vaut cela qu'un artefact dont on ne peut plus certifier le contenu.

⚠️ **La règle du jour où l'on ouvrira le réseau (lot B3, réservation de crédits) :** la ligne
ajoutée dans `isolation.ts` et l'ouverture de `connect-src` doivent tomber **dans le même
commit** que le code appelant. Une CSP élargie « en prévision » ne protège plus de rien, et
l'écart entre les deux fichiers est précisément ce qu'une revue peut voir.

### 10.3 Ce qui n'est délibérément pas encore là

- **Aucun service worker.** La §4.4 décrit la panne « coquille ancienne + chunks neufs = écran
  mort ». On ne pose pas un service worker sur une origine avant d'avoir décidé sa stratégie
  d'activation — on ne le retire plus des navigateurs qui l'ont installé. C'est le lot **B9**.
- **Aucun asset pdf.js ni de reconnaissance de caractères** : ~30 Mo d'artefact pour du code
  absent. Ils arrivent avec l'aperçu des pièces (**B1/B2**), avec `'wasm-unsafe-eval'` dans la CSP.
- **Aucune sourcemap** : elles publieraient le code source sur une origine publique sans qu'aucun
  outil ne les consomme — il n'y a pas de Sentry sur cette cible, et il n'y en aura pas.
- **`style-src 'self'` strict**, plus serré que la plateforme (qui doit tolérer les attributs
  `style` de TipTap/Radix). À desserrer quand — et seulement quand — le workspace arrivera.
- **`worker-src 'self'` sans `blob:`** : un worker construit depuis un blob est le contournement
  classique de `script-src 'self'`. `blob:` reviendra avec pdf.js, dans le même commit.
- **Aucun budget de bundle sur `dist-builder/`** : la coquille pèse 61 Ko gzip, un plafond posé
  aujourd'hui ne mesurerait rien. Il est **dû avec B1**, quand le workspace entrera — c'est la
  cible qui en a le plus besoin, puisqu'elle doit s'installer sur des postes de laboratoire.

⚠️ **`envPrefix: ['PHARNOS_BUILDER_']`** dans `vite.builder.config.ts` — préfixe volontairement
inexistant dans ce dépôt. Sans lui, Vite injecte les `VITE_*` du `.env.local` du poste (dont
l'URL Supabase et la clé publiable de **production**) dans un artefact vendu comme dépourvu de
backend. Sans effet en CI, mais le dépannage documenté publie `dist-builder/` **depuis un poste
de développement** : l'accident aurait été silencieux et public.

### 10.4 Recette de ce lot

- [x] `npm run build:builder` produit `dist-builder/` avec `index.html`, `_headers`, `_redirects`, icônes
- [x] Un import du client Supabase dans la coquille **fait échouer le build**, avec un message qui nomme le module et la règle
- [x] Le même import **via un web worker** (`?worker`) fait échouer le build — l'angle mort des builds imbriqués est fermé
- [x] Un `fetch('https://…')` écrit à la main, sans aucun import interdit, fait échouer le build
- [x] `npm run headers:builder` refuse un `connect-src` élargi (comparaison stricte, pas par sous-chaîne)
- [x] Il refuse aussi une **seconde section `/*`** (les règles Cloudflare se cumulent) et une CSP **Report-Only** posée devant la vraie
- [x] Il refuse un `dist-builder/` **vide** — cas réel : après un build échoué, les en-têtes sont déjà copiés mais aucun chunk n'existe
- [x] `npm run dev:builder` sert l'entrée du builder et non celle de la plateforme
- [x] Le stockage durable se demande depuis un geste utilisateur et l'état s'affiche
- [x] Servi sous `pharnos.com/ctd-builder/` — assemblé dans le déploiement de la vitrine, aucun projet Cloudflare supplémentaire
