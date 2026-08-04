# PLAN — CTD Builder (édition autonome, hors ligne)

> **Nature** : produit autonome vendu au crédit ou à la licence annuelle — **sans Regafy AI,
> sans synchronisation en ligne**.
> **Rôle** : entonnoir vers l'écosystème RIM de Pharnos.
> **Plans liés** : [PLAN-CHARIOW.md](PLAN-CHARIOW.md) (encaissement, table `orders`, crédits).
> **Dernière mise au propre** : 2026-08-04 (B0 + page de vente + domaine + B1.0 livrés ; licence
> arrêtée §5.2 ; unité de compte tranchée et métrage corrigé §5.2.6–5.2.7).

---

## 0. État et prochaine action

### En production au 2026-08-03

| Quoi             | Où                                                                               | État                                                      |
| ---------------- | -------------------------------------------------------------------------------- | --------------------------------------------------------- |
| Application      | **`builder.pharnos.com`** (projet Pages `pharnos-builder`, `deploy-builder.yml`) | En ligne. **Crée un dossier et affiche son Module 1** (B1.1) ; le classement des pièces manque |
| Page de vente    | **`pharnos.com/ctdbuilder`** (FR + EN, onglet de premier niveau du header)       | En ligne, vérifiée                                        |
| Isolation réseau | `web/src/builder/isolation.ts`                                                   | Casse le build, réseau **et** frontière d'offre (§10.2)   |
| Poids            | `npm run budget:builder` (étape de CI)                                           | Entrée 115,3 Ko gzip, plafond 145 Ko                      |
| Socle de données | `dossier-repository` & co.                                                       | **Branché et vérifié** dans le builder depuis B1.1        |

**Le produit n'est pas vendable tant que B1 n'est pas livré** : on peut désormais créer un dossier
et voir son arborescence, mais pas encore y ranger une seule pièce — donc rien à compiler et rien à
déposer. Rien n'est en attente côté infrastructure ; tout ce qui reste est du logiciel.

⚠️ **Le design de l'application doit être au niveau de la page de vente** (exigence CEO,
2026-08-03). La coquille actuelle est un écran de diagnostic, pas un design. Cela fait partie de
B1, pas d'une finition ultérieure.

✅ **Tranché par le CEO (2026-08-03) : le builder embarque un CATALOGUE MINIMAL** — un dossier s'y
crée depuis un produit, comme sur la plateforme. On ne simplifie pas la création : c'est un clone
sans écosystème, pas un produit différent. Corollaire : `features/catalogue/` entre dans le
périmètre réutilisé, avec la même règle de scindement que le workspace.

### ✅ Métrage — LIVRÉ (2026-08-04) : l'unité de compte est tranchée et le compteur est juste

Le CEO a tranché : **les paliers 49 € et 249 € comptent des COMPILATIONS** (§5.2.6). Les trois
correctifs validés à l'audit du 2026-08-03 partent avec la décision (§5.2.7) : **fenêtre de grâce
de 24 h par dossier**, **crédit consommé après succès**, **commentaire honnête sur le hors-ligne**
— plus une course concurrente refermée au passage. Rien ne bloque donc la création des produits
Chariow côté règle de décompte.

**Prochaine action : la suite de B1** — le classement des pièces sous les nœuds de l'arborescence.
Le socle de données est branché et vérifié (B1.1 ci-dessous) ; ce qui manque au produit pour être
vendable, c'est de pouvoir y ranger des documents.

### ✅ B1.0 — LIVRÉ : `ref-overrides` est découplé du réseau

`syncRefOverrides` et ses aides de ligne vivent dans `ref-overrides-sync.ts` ; les deux écritures
locales passent par un crochet injecté (`setOverrideSyncHook`), que **`src/main.tsx`** branche au
démarrage. Mesures : **1392 tests verts**, budget d'entrée **131,5 Ko → 131,5 Ko** (impact nul —
Supabase était déjà dans le chunk d'entrée via l'authentification), CSP et en-têtes inchangés.

**Vérifié par l'expérience qui échouait avant** : en important `dossier-repository` dans l'entrée
du builder, `@supabase/*` et `src/lib/sentry.ts` **ne sont plus tirés**. La chaîne est coupée.

⚠️ **Obstacle SUIVANT, mesuré par la même sonde** : le contrôle de sortie réseau signale alors deux
adresses dans l'artefact — `https://tinyurl.com/y2uuvskb` et `http://bit.ly/2kdckMn`. Provenance
tracée : ce sont des **liens de documentation dans les messages d'exception de Dexie**
(« Transaction committed too early. See … »), donc des chaînes inertes que personne n'appelle.
Elles iront dans `URL_ALLOWLIST` **avec cette raison** au moment où le dépôt entrera réellement
dans le builder — pas avant, et pas sans la vérification ci-dessus : une URL raccourcie est opaque
par construction, l'autoriser revient à faire confiance à la dépendance qui l'émet.

### ✅ B1.1 — LIVRÉ : le builder monte un dossier, hors ligne

**La mesure d'abord, et elle est meilleure qu'espéré.** En branchant `dossier-repository`,
`ArborescenceTree`, `module1-tree` et les dépôts de pièces jointes et de documents générés dans
l'entrée du builder, le contrôle de DÉPENDANCES ne signale **plus rien** : B1.0 a réellement coupé
la chaîne, et le socle de données est réutilisable tel quel. Le seul obstacle restant était bien
celui qui était prévu — les deux liens de documentation de Dexie.

**Ils sont autorisés, après vérification et pas sur parole** (`node_modules/dexie/dist/dexie.js`
l. 381 et 4749) : ce sont des littéraux dans des messages d'exception, jamais passés à un `fetch`,
un `open` ou une navigation. Redirections résolues (301) vers `dexie.org/docs/DexieErrors/…`.
⚠️ **Autorisés en correspondance EXACTE et ancrée, jamais par domaine** : `tinyurl.com/*` aurait
laissé un tiers choisir la destination, aujourd'hui ou demain. Un test le prouve — et le protège
du jour où quelqu'un « simplifiera » la règle en motif de domaine.

Ce que l'écran fait aujourd'hui : lister les dossiers du poste, en créer un (pays · opération ·
produit), et afficher l'arborescence officielle du Module 1 du pays choisi.

**Vérifié en vrai navigateur, pas seulement en test** : dossier Sénégal créé → **38 nœuds**
d'arborescence rendus → **retrouvé après rechargement complet** de la page → **aucune requête
réseau** hors les propres assets de l'application. C'est la recette n°1 de la §9, tenue.

**Mesures** : 1410 tests verts · entrée **61,5 → 115,3 Ko gzip** (le socle de données qui entre) ·
CSS 19,4 Ko · budget posé à 145/28 Ko.

⚠️ **Le budget de poids existe désormais** (`npm run budget:builder`, étape de CI) — il était dû
avec ce lot (§10.3). Il porte sur le **gzip de l'ENTRÉE**, parce que le builder doit être
entièrement chargé pour fonctionner hors ligne : il n'a pas le luxe du chargement à la demande sur
lequel la plateforme s'appuie. Le relever est un acte, dans le commit qui l'a fait grossir.

**Reste au lot B1** : le classement des pièces sous les nœuds, le catalogue minimal (un dossier se
crée depuis un produit, décision CEO du 2026-08-03), et la recette visuelle du CEO.
⚠️ **Dette connue, à traiter en B2** : `createDossier` alimente l'outbox LOCALE que personne ne
vide dans le builder. Elle est bornée par le stockage, mais elle grossit à chaque écriture — sa
purge appartient au lot qui traite l'export.

### B1.0 — la conception, pour mémoire

Chaîne constatée en branchant le vrai dépôt dans la coquille (le garde-fou l'a refusée) :

```
dossier-repository → catalogue/ref-content → catalogue/ref-overrides → @supabase/supabase-js
```

Autrement dit : **le socle de données n'est pas réutilisable en l'état**, contrairement à ce que
laissait entendre la §5.1. La bonne nouvelle est que la coupe est nette — sur les **douze exports**
de `ref-overrides.ts`, **un seul** parle au serveur (`syncRefOverrides`, l. 234) ; les onze autres
lisent et écrivent dans Dexie.

⚠️ **Le piège, et c'est lui le travail** : `setOverride` (l. 192) et `removeOverride` (l. 220)
appellent eux-mêmes `void syncRefOverrides(orgId)` en _fire-and-forget_. Sortir la fonction dans un
`ref-overrides-sync.ts` ne suffit donc pas — le module local le réimporterait. Il faut **injecter**
le déclencheur :

```ts
let onOverrideChanged: (orgId: string) => void = () => {};
export function setOverrideSyncHook(fn: typeof onOverrideChanged) {
  onOverrideChanged = fn;
}
```

…et l'enregistrer depuis l'entrée de la PLATEFORME (`src/main.tsx`), **pas** depuis
`catalogue-sync.ts` : un enregistrement au chargement d'un module de feature laisserait une fenêtre
où une pose d'adaptation ne déclencherait aucune synchronisation. Le seul appelant en production
est `catalogue-sync.ts` ; le test existant s'appelle déjà `ref-overrides-sync.test.ts`.

**Ce lot touche un module qui sert `app.pharnos.com` : il mérite sa propre PR et une revue.**

### Ce qui reste ensuite

Même exercice, module par module, sur les pages du workspace qui importent la synchronisation en
statique (`WorkspacePage`, `NewDossierPage`, `DossierWorkspacePage`, `LifecycleActionCard`…), puis
sur le catalogue minimal.

⚠️ **Ne PAS neutraliser les `*-sync.ts` en bloc par un alias de build** : `dossier-sync.ts` exporte
aussi `purgeLocalChildren`, qui est une purge **locale** dont `dossier-purge.ts` dépend. Un module
nommé « sync » n'est pas intégralement du réseau — ici encore, ce qui compte est ce que le code
FAIT.

**L'entrée « CTD Builder » du header est posée depuis le 2026-08-03** et mène à la page de vente
`pharnos.com/ctdbuilder`, dont le bouton ouvre l'application. Ce que le bouton ouvre reste une
coquille tant que B1 n'est pas livré.

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

**Ce qui se décompte, tranché le 2026-08-04 : la COMPILATION** (§5.2.6), pas le dossier — même
unité que la plateforme, donc un seul registre et une seule règle. Ce qu'il faut dire sur la page
de vente, parce que c'est ce qui rend l'offre honnête : **recompiler le même dossier dans les 24 h
est gratuit.** Corriger une coquille et relancer ne coûte pas un crédit.

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

### 5.2 Licence et crédits — ARCHITECTURE ARRÊTÉE (CEO, 2026-08-03)

#### 5.2.0 Le cadrage, en une phrase

La promesse n'a jamais été « zéro octet réseau » — elle est **« vos documents ne transitent jamais
par nos serveurs »**. Un compte et un décompte en ligne sont donc **acceptés** ; ce qui reste
interdit, c'est qu'un octet du dossier sorte du poste. Cette distinction débloque tout le reste.

#### 5.2.1 Comment font les incumbents (vérifié)

**Lorenz docuBridge**, l'incumbent exact de ce marché, ne verrouille pas par la cryptographie mais
par un **serveur de licences** : sièges nommés ou flottants, registre serveur, postes qui empruntent
un siège. Extedo eCTDmanager : idem. JetBrains/Adobe : compte + vérification périodique avec grâce
hors ligne. Veeva : SaaS pur.

**La leçon commune, et elle est structurante : aucun ne fait confiance au poste pour COMPTER.**
Le registre est toujours serveur. Ce qui vit sur le poste est une _preuve_ d'un droit, jamais le
compteur lui-même.

#### 5.2.2 L'architecture retenue : registre serveur + bons signés

```
poste   →  « réserve 1 bon pour la licence X »   (id de licence, RIEN d'autre)
serveur →  décompte le registre, renvoie un BON signé Ed25519, à usage unique
poste   →  compile EN LOCAL, documents jamais transmis, bon consommé
```

- **Le registre vit chez nous** (Supabase, stack existant : une table + une Edge Function).
- **Multi-postes par construction** — même clé, même registre. Exigence CEO, pas tolérance : ce qui
  compte est de suivre et décompter la compilation **partout**.
- **Hors ligne réel** : « réserve tiède » de 3 bons maintenue en silence dès que le poste est en
  ligne ; préchargement manuel avant un déplacement. Au retour, seuls les **identifiants de bons**
  se réconcilient — le serveur refuse tout double emploi.
- **Ce qui traverse le réseau, exhaustivement** : id de licence, ids de bons. Ni octet de document,
  ni nom de fichier, ni métadonnée.
- **Pas d'empreinte matérielle.** Fragile, hostile à la vie privée, et cause n°1 des refus abusifs.

⚠️ **Le bon est vérifié par signature, jamais lu en confiance.**

⚠️ **Conséquence sur le garde-fou d'isolation** : il passera de « aucune sortie » à « **exactement
une origine**, vérifiée par égalité dans la CSP, ouverte dans le même commit que le code appelant ».
Le patron est déjà écrit dans `web/public-builder/_headers`.

#### 5.2.3 Ce que la cryptographie garantit — et ce qu'elle ne garantira jamais

|                               | Hors ligne                                 |
| ----------------------------- | ------------------------------------------ |
| Falsifier une clé / un bon    | **Impossible** (signature)                 |
| Partager une clé entre postes | **Voulu** (cf. ci-dessus)                  |
| Révoquer après impayé         | Impossible sans passage en ligne           |
| Faire confiance à l'horloge   | Non — l'horloge appartient à l'utilisateur |

D'où trois règles qui protègent le **client payant**, à ne pas défaire :

1. **Licence perpétuelle** : la clé encode « mises à jour incluses jusqu'à telle date ». Passé ce
   délai l'application **continue de fonctionner**. Supprime l'horloge et le verrouillage.
2. **La licence ne garde JAMAIS les données en otage** : ouvrir ses dossiers et **exporter** restent
   toujours possibles, même sans clé valide. On limite la _création_, jamais la _récupération_.
3. **Clé recouvrable** : envoyée par e-mail, stockée en plusieurs endroits, **incluse dans le
   fichier de projet exporté**.

#### 5.2.4 Combinaison avec l'abonnement Pharnos

Table `licenses` avec un **`org_id` optionnel**. Un abonné Pharnos reçoit une ligne provisionnée
automatiquement — son abonnement _contient_ un droit de compilation. Un client licence seule a une
ligne sans org. Même table, même Edge Function, deux origines commerciales. Quand un client builder
monte vers l'abonnement, on rattache sa ligne : crédits et historique le suivent.

Chiffrage : **~1 jour** (migration + Edge Function + vérification de bon côté builder), à lancer
avec la création des produits Chariow.

#### 5.2.5 Le métrage EXISTANT de la plateforme — audit du 2026-08-03

**À lire avant d'écrire une ligne de licence : la plateforme a déjà tranché, et le builder s'aligne.**

> 📌 Section conservée telle quelle pour la trace du raisonnement. **Les trois correctifs qu'elle
> annonce sont livrés** — voir §5.2.7.

- [`0039_compilation_metering.sql`](../supabase/migrations/0039_compilation_metering.sql) : table
  `compilations` (registre) + RPC `record_compilation`, garde atomique fail-closed.
- [`0040_drop_dossier_creation_quota.sql`](../supabase/migrations/0040_drop_dossier_creation_quota.sql) :
  le quota de **création de dossiers a été RETIRÉ** — « le quota n'est plus à la CRÉATION, c'est la
  COMPILATION ».
- Barème en base : **Free 1 · Pro 5 · Team 15 · Business 50 · Entreprise ∞**, **par mois**.
- Décompte = `count(*)` sur les lignes du registre ⇒ **chaque clic compte**, sans déduplication.

⚠️ **Ne PAS proposer « 1 crédit = 1 dossier »** : c'est séduisant et c'est faux ici. Un dossier est
recyclable (défaut 3 ci-dessous), et la plateforme a délibérément choisi l'inverse.

**Trois défauts constatés, et les décisions prises :**

**1. Le crédit est consommé AVANT la fabrication.**
[`DossierWorkspacePage.tsx`](../web/src/features/workspace/DossierWorkspacePage.tsx) appelle
`record_compilation` puis fabrique le PDF. Si la fabrication échoue, le crédit est perdu — sur un
plan Free à 1/mois, l'utilisateur est dehors pour un mois sans rien avoir obtenu.
→ **Correctif validé : consommer APRÈS succès.**

**2. Les compilations hors ligne ne sont JAMAIS comptées.**
La garde est `if (online && env.isSupabaseConfigured)`, avec un commentaire annonçant « réconcilié
plus tard ». **Vérifié : rien ne réconcilie** — aucune entité d'outbox, aucun rejeu. Se déconnecter
= compiler gratuitement, indéfiniment.
→ **Décision : PAS de rustine.** Une réconciliation a posteriori n'est pas une fermeture mais de la
comptabilité : vider le stockage, ne jamais se reconnecter ou refuser la synchro la contourne, et le
serveur ne peut pas « défaire » 40 compilations déjà faites. **La fermeture réelle est
l'autorisation préalable** (§5.2.2), écrite une fois pour le builder et héritée par la plateforme.
D'ici là, **le commentaire doit dire la vérité**.
→ Calendrier : **aucun abonné payant à ce jour ⇒ revenu en fuite = zéro**. Ce trou devient coûteux
le jour où l'encaissement existe, c'est-à-dire le jour où le lot licence existe. Il ne passe donc
pas devant B1.

**3. Un dossier est recyclable — la faille repérée par le CEO est réelle.**

- **Verrouillé** : [`dossier-repository.ts`](../web/src/features/workspace/dossier-repository.ts)
  n'expose **aucune** fonction modifiant `productId`, `country`, `activity` ou `format`. Ils sont
  écrits à la création, jamais après.
- **Pas verrouillé** : `updateProduct` réécrit **tous** les champs du produit, et le compilateur lit
  le produit **vivant** (`nomCommercial: product.nomCommercial || dossier.productName`) — la
  couverture suit donc le renommage.
- **Conséquence** : un dossier est recyclable pour un autre produit, à condition de rester sur **le
  même pays et la même activité**.
- → **Décision : ne pas combattre par la technique.** Toute empreinte d'identité calculée par le
  client est falsifiable par le client, et l'abus **détruit la propre fiche produit** de
  l'utilisateur — son référentiel de travail. Le registre garde la trace : trente compilations sur
  un dossier unique avec un produit renommé trente fois, ça se voit après coup.

#### 5.2.6 ✅ L'unité de compte — TRANCHÉE PAR LE CEO (2026-08-04)

> **Les paliers 49 € (3) et 249 € (20) comptent des COMPILATIONS.**
> Le **490 €/an reste illimité, donc sans compteur** — juste une clé valide.

C'est l'option alignée sur la plateforme : une seule règle, un seul registre, un seul code à
maintenir des deux côtés (§5.2.4). Elle a une conséquence directe, et c'est elle qui a été livrée
en même temps que la décision : **compter chaque clic n'est vivable que si corriger une coquille
ne coûte rien.** Sur un pack de 3, trois allers-retours de relecture épuisaient l'offre sans qu'un
seul dossier soit déposé.

#### 5.2.7 ✅ LIVRÉ — les trois correctifs de l'audit

Migration [`0082_compilation_grace_window.sql`](../supabase/migrations/0082_compilation_grace_window.sql)
et son pendant client.

| #   | Correctif                                                                               | Où                                                                                             |
| --- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| a   | **Fenêtre de grâce par dossier (24 h)** : recompiler le _même_ dossier ne consomme rien | `compilation_quota()` (0082) — autorisée **même au plafond**, puisqu'elle ne décompte rien      |
| b   | **Consommer le crédit après succès**                                                    | `runMeteredCompile()` — préflight → fabrication → enregistrement, ordre prouvé par 6 tests      |
| c   | **Commentaire honnête** sur le hors-ligne                                               | `DossierWorkspacePage.tsx` — le trou est nommé, ainsi que sa vraie fermeture (bons signés)      |

Le fail-open subsiste et il a changé de poids : l'appel étant désormais le DERNIER, une erreur RPC
livre le paquet sans rien décompter. On ne le referme pas — refuser un livrable déjà fabriqué pour
une panne réseau serait pire — mais `recordCompilation` **réessaie une fois** puis **remonte la
fuite à Sentry**. Une fuite qu'on ne mesure pas n'existe pas dans les chiffres, seulement dans la
trésorerie.

**Deux trous trouvés en revue, fermés dans la même livraison — ils valaient à eux seuls le lot :**

- 🚪 **Le paquet sortait gratuitement par l'aperçu.** `DossierPreviewPage` recompilait le PDF
  **octet pour octet** (mêmes arguments, même filigrane) et l'offrait au **téléchargement** et à
  l'**envoi à l'agence**, sans le moindre décompte. Un compte au plafond n'avait qu'à ouvrir
  `/apercu`. Le métrage a donc changé de définition : ce qui se compte n'est pas « le clic sur
  Compiler », c'est **le paquet qui quitte l'application**. Les trois sorties passent désormais par
  `useCompilationCredit`, et la fenêtre de grâce fait que compiler + télécharger + envoyer le même
  dossier coûte **un** crédit. L'aperçu à l'écran, lui, reste libre : regarder n'est pas déposer.
- 💸 **Un pack se rechargeait tout seul chaque mois.** Le cap se dérogeait par org
  (`org_quota_override.max_compilations`) mais la **période** se lisait sur le plan, et tous les
  plans sont `'month'`. Livrer « 3 compilations » à l'acheteur du pack 49 € lui donnait donc
  3 compilations **par mois, à vie**. `org_quota_override.compilations_period` répare le modèle :
  un pack se livre en `'lifetime'`. **Sans cette colonne, les offres 49 € et 249 € n'étaient pas
  exprimables** — le décompte demandé par le CEO n'aurait pas tenu au premier client.
  ⚠️ La période se lit par `coalesce(override, plan)` **aux deux endroits** : dans le compteur qui
  DÉCIDE (`compilation_quota`) et dans celui qui s'AFFICHE (`my_org_plan`). Ne l'avoir corrigé qu'à
  un seul endroit affichait « 0 / 3 » le 1er du mois pendant que le serveur refusait — un compteur
  d'affichage qui contredit le compteur de décision est pire qu'une absence de compteur.
  🔧 **Livrer un pack reste un `INSERT` SQL manuel** : aucune UI, et `admin_set_org_quota` ne touche
  pas ces colonnes (vérifié — il ne les écrase donc pas). À écrire dans le runbook d'encaissement.

⚠️ **Et un piège que la fermeture a créé, corrigé dans la foulée :** métrer la sortie du paquet
rendait un dossier **payé la veille irrécupérable le lendemain** — la fenêtre de grâce ayant
expiré, le client repayait pour retélécharger ce qu'il possédait déjà. C'est exactement ce que la
§5.2.3 interdit (« on limite la _création_, jamais la _récupération_ »). D'où **l'empreinte
SHA-256 du paquet** (`compilations.content_sha256`), qui sépare deux gratuités très différentes :

| | Condition | Durée |
| --- | --- | --- |
| **Récupération** | mêmes octets déjà facturés à l'org | **illimitée** — on ne paie jamais deux fois le même paquet |
| **Correction** | octets différents, dans les 24 h d'une compilation facturée du même dossier | 24 h, **10 gratuités** au plus |

Des octets **différents** hors fenêtre sont facturés : ce n'est donc toujours pas « 1 crédit =
1 dossier ». Et l'empreinte redonne au registre le pouvoir de témoin que la grâce lui avait retiré —
trente lignes avec trente empreintes distinctes, ce ne sont pas trente corrections. Les deux
gratuités sont **budgétées séparément** (`compilations.free_reason`) : sans ça, un cycle normal —
compiler, télécharger, envoyer — brûlait deux des dix gratuités de correction en récupérations.

🔬 **Le piège qui rendait tout cela inerte, et qui ne se voit pas à l'œil nu.** `PDFDocument.create()`
estampille `/CreationDate` et `/ModDate` **à la seconde**, dans le dictionnaire Info compressé.
Deux compilations rigoureusement identiques donnaient donc deux fichiers différents — **mesuré :
1,1 s d'écart suffit à changer le SHA-256**. L'empreinte n'aurait jamais correspondu d'une session
à l'autre, la récupération n'aurait jamais joué, et le client aurait repayé pour retélécharger.
Les métadonnées sont désormais figées (`stampFixedMetadata`), la date de couverture vient du
**dossier** et non de l'horloge, et un test compile deux fois à plus d'une seconde d'écart pour
comparer les octets. **Toute évolution du compilateur qui réintroduit une source de temps casse
silencieusement la facturation** — ce test est le garde-fou.

⚠️ **À dire sans détour, parce que le lot licence va s'appuyer dessus** : l'empreinte est calculée
par le client, donc forgeable, et rejouer une empreinte déjà facturée donne des compilations
gratuites. Ce n'est pas un affaiblissement — bloquer l'appel RPC dans les outils du navigateur
suffit déjà, le fail-open le traite comme un succès — mais il faut l'écrire : **tout le métrage est
honnête-client jusqu'aux bons signés Ed25519** (§5.2.2). Ce lot réduit la **sur**-facturation d'un
client de bonne foi ; il ne prétend pas résister à un client de mauvaise foi.

**Trois choix de conception valent d'être retenus, parce qu'ils se paieraient cher à refaire :**

1. **La grâce n'est pas un non-enregistrement.** Toute compilation entre au registre ; seule la
   colonne `billable` dit si elle a consommé un crédit — le registre reste complet.
   ⚠️ Mais **il ne démasque pas l'abus** : trente lignes sur le même `dossier_id` en 24 h, c'est
   exactement la forme que la grâce bénit, et le contenu n'est pas enregistré (§5.2.2). Comme
   `dossier_id` vient du client et n'a pas de clé étrangère (un dossier local-only n'existe pas
   côté serveur), la seule borne possible est un **plafond de dix gratuités par fenêtre** : un
   crédit n'achète pas 24 h illimitées, il achète onze compilations.
2. **La fenêtre est ancrée sur la dernière compilation FACTURÉE**, jamais sur la dernière ligne.
   Ancrée sur n'importe quelle ligne, une compilation gratuite à t+23 h en aurait ouvert une autre
   jusqu'à t+47 h, et ainsi de suite : le dossier ne serait plus jamais facturé. Le test le prouve.
   Corollaire du même piège : un `dossier_id` NULL n'ouvre **jamais** la grâce, sinon la première
   compilation sans dossier rendrait gratuites toutes les suivantes de l'org.
3. **Le verrou consultatif par org.** La garde de 0039 se décrivait comme « ATOMIQUE » ; elle ne
   l'était pas — un `count(*)` suivi d'un `insert` sous READ COMMITTED laisse deux onglets lire
   `used = cap - 1` et insérer tous les deux. `pg_advisory_xact_lock` par org ferme la course.
   À défaut, vendre un pack de 3 revenait à en livrer 4 à qui ouvre deux onglets.

⚠️ **Ce qui reste ouvert, et qui n'est pas un oubli** : hors ligne, une compilation n'est comptée
nulle part et **rien ne la rattrape**. Décision inchangée (§5.2.5, défaut 2) : pas de rustine de
réconciliation, la fermeture est l'autorisation **préalable** par bons signés. `runMeteredCompile`
a d'ailleurs été écrit pour que le builder y branche la vérification de bon **sans changer
l'ordre** des trois temps.

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

| Lot         | Contenu                                                                                                                                                                                                    | Dépend de                      |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| **B0** ✅   | **Socle de fabrication** : cible de build séparée, CSP `connect-src 'self'`, contrôle d'isolation bloquant, workflow de déploiement, coquille + `persist()`                                                | —                              |
| **B1.0** ✅ | **Découplage `ref-overrides`** : la chaîne `dossier-repository → @supabase/*` est coupée, le socle de données devient réutilisable                                                                         | B0                             |
| **B1**      | Édition autonome : `workspace` + catalogue minimal, sans `*-sync.ts` · **design au niveau de la page de vente** · `persist()` · alerte quota                                                               | B1.0                           |
| **B2**      | Compilation → ZIP (`client-zip`) · **destination du paquet** (disque ou dossier Drive) · export/import `.pharnos`                                                                                          | B1                             |
| **B3**      | **Licence & crédits (§5.2)** : table `licenses`, Edge Function de réservation, bons signés Ed25519, réserve tiède, vérification côté builder ; **+ les 3 correctifs de métrage (a/b/c) sur la plateforme** | B2, `orders` (PLAN-CHARIOW §6) |
| **B4**      | Tableau de bord 4 éléments                                                                                                                                                                                 | B3                             |
| **B5**      | 3 produits Chariow + branchement du paiement (la page de vente et l'entrée d'en-tête sont **livrées**)                                                                                                     | B3                             |
| **B6**      | **Mode atelier** : File System Access API (Chrome/Edge) + repli                                                                                                                                            | B2                             |
| **B7**      | Passerelle vers l'abonnement : import d'un `.pharnos` dans un compte                                                                                                                                       | B2                             |
| **B8**      | **Référentiel hors ligne** : payload public signé, cache, `isTreeOutdated`, blocage de compilation sur arbre périmé                                                                                        | B1                             |
| **B9**      | **PWA** : service worker, activation atomique, sur `builder.pharnos.com`                                                                                                                                   | B1                             |
| **B10**     | **Licence annuelle** : vérification à 30 jours, grâce 14 jours, rafraîchissement du référentiel                                                                                                            | B3, B8                         |
| **B11**     | _(optionnel, tardif)_ API Drive OAuth `drive.file` — uniquement pour les contextes sans système de fichiers                                                                                                | B6                             |

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

|               | Plateforme                    | CTD Builder                                   |
| ------------- | ----------------------------- | --------------------------------------------- |
| Config        | `vite.config.ts`              | `vite.builder.config.ts`                      |
| Entrée        | `index.html` → `src/main.tsx` | `index.builder.html` → `src/builder/main.tsx` |
| Sortie        | `web/dist/`                   | `web/dist-builder/`                           |
| En-têtes      | `public/_headers`             | `public-builder/_headers`                     |
| URL publique  | `app.pharnos.com`             | `builder.pharnos.com`                         |
| Page de vente | —                             | `pharnos.com/ctdbuilder` (statique)           |
| Projet Pages  | `pharnos`                     | `pharnos-builder`                             |
| Workflow      | `deploy.yml`                  | `deploy-builder.yml`                          |

**Pourquoi un projet Pages dédié — décision prise APRÈS avoir essayé l'inverse.** Le builder a vécu
une demi-journée assemblé dans le déploiement de la vitrine, sur `builder.pharnos.com`. Ce
montage a coûté **deux incidents de production le 2026-08-03**, et le premier est rédhibitoire :

> **Une application à page unique servie sous un chemin de ce projet n'a pas de repli de routage
> possible.** Cible `…/index.html` → ne s'applique jamais (308 « pretty URL »). Cible `…/` →
> capture les assets existants, module au mauvais type MIME, page blanche.

À la racine d'un projet dédié, `/* → /index.html 200` est la configuration standard — celle qui
sert `app.pharnos.com` depuis un an. S'y ajoutent un **rayon d'explosion séparé** (une coquille
marketing ne redéploie plus l'application), une **CSP à la racine** plutôt que par sections
cumulatives, et l'absence d'ambiguïté d'URL avec la page de vente. Le coût — un projet, un
enregistrement DNS sur une zone déjà gérée — est sans commune mesure avec celui des deux incidents.

⚠️ Le projet Pages est créé **par la CI**, pas depuis un poste : le jeton local est restreint au
DNS (il ne peut même pas lister les comptes), celui de la CI porte `Pages:Edit`.

```bash
npm run dev:builder       # développement (sert bien l'entrée du BUILDER, pas celle de l'app)
npm run build:builder     # build + contrôle d'isolation
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
| **CSP `connect-src 'self'`**      | `web/public-builder/_headers` (racine du domaine)                     | Toute requête **de fond** vers une autre origine — `fetch`, XHR, WebSocket, EventSource, `sendBeacon` — quel que soit le code livré                                                               | **L'utilisateur** |
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
- [x] **Vérifié en PRODUCTION** (2026-08-03) : `pharnos.com/ctd-builder/` rend l'application, CSP
      `connect-src 'self'` réellement servie, `Referrer-Policy: no-referrer`, détachement effectif

⚠️ **Deux comportements MESURÉS en production, à connaître avant B1 :**

1. **Ce projet Pages répond `200` + le HTML de la vitrine à TOUTE URL inconnue** — pas un 404.
   Conséquence directe : un cache long sur `/ctd-builder/assets/*` gèle cette mauvaise réponse
   chez le client, qui refuse ensuite d'exécuter le module (mauvais type MIME) et affiche un
   écran blanc, sans erreur réseau. C'est arrivé à la première visite après le déploiement.
   → `max-age=300` sans `immutable` sur ce préfixe, tant qu'une URL inconnue ne répond pas 404.
   ⚠️ **La valeur déclarée n'est pas celle qui est servie** : `max-age=300` revient en
   `max-age=14400` (4 h). Le réseau relève les valeurs basses vers son propre plancher, mais
   respecte les valeurs hautes — c'est pourquoi `immutable` + un an, lui, était bien appliqué.
   Le plafond réel du dégât est donc de 4 heures, pas de 5 minutes.
2. **Aucune réécriture SPA n'est en place, et les deux formes évidentes sont fausses** — les deux
   essayées en production le même jour :
   - `/ctd-builder/* /ctd-builder/index.html 200` → **ne s'applique jamais** (308 « pretty URL »
     de `…/index.html` vers `…/`, la règle se perd — même piège que `/i/*`) ;
   - `/ctd-builder/* /ctd-builder/ 200` → **s'applique à tout, assets EXISTANTS compris**. Le
     fichier statique n'a pas gagné sur la règle : le JS de l'app répondait `200 text/html`,
     le module n'était plus exécuté, page blanche. **Régression réelle, en production.**

   → Règle retirée. Sans perte aujourd'hui (une seule URL, pas de routeur). **Au lot B1**, le
   repli devra exclure `/ctd-builder/assets/` et être **mesuré en production** avant d'être
   considéré comme acquis.

- [x] Le stockage durable se demande depuis un geste utilisateur et l'état s'affiche
- [x] Servi sur `builder.pharnos.com` — assemblé dans le déploiement de la vitrine, aucun projet Cloudflare supplémentaire
