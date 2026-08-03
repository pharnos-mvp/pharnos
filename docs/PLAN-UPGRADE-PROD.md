# PLAN — L'upgrade en production, du paiement au livrable

> **Objet** : rendre la Mise à niveau documentaire réellement exécutable en production, sans
> intervention humaine, pour un acheteur **sans compte** — du règlement Chariow jusqu'aux cinq
> fichiers entre ses mains, en quelques minutes.
>
> **Écrit le** 2026-08-03, après une revue complète du code confronté aux plans.
> **Plans liés** : [PLAN-MOTEUR-IA.md](PLAN-MOTEUR-IA.md) (le moteur) ·
> [PLAN-UPGRADE-FRONTEND.md](PLAN-UPGRADE-FRONTEND.md) (les écrans, **partiellement périmé** — voir §1.3) ·
> [PLAN-CHARIOW.md](PLAN-CHARIOW.md) (l'encaissement, exact) ·
> [PLAN-RECEVABILITE.md](PLAN-RECEVABILITE.md) (la porte).
>
> **Ce plan REMPLACE** les §B, §C et §D bis de `PLAN-UPGRADE-FRONTEND.md` sur tout ce qui touche
> l'exécution après paiement. Le reste de ce document-là (contenu des écrans, vocabulaire, ordre
> des étapes d'achat) reste en vigueur.

---

## 1. État des lieux — vérifié dans le code, pas dans les plans

### 1.1 Ce qui existe et tourne

| Brique | Où | État réel |
|---|---|---|
| Encaissement Chariow en panneau | `supabase/functions/checkout/` + `landing/modele.js` | **en production**, session ouverte, devise et géolocalisation correctes |
| Mode **par rubrique** du moteur | `supabase/functions/upgrade/index.ts:347` | déployé, sortie structurée + `source_evidence` vérifiée |
| Postures, cache, provider | `_shared/ai/{personas,provider,anthropic,vertex}.ts` | déployés, testés |
| Préparation de source (couche texte **et** OCR) | `web/src/lib/ocr/{prepare-source,pdf-text,scan-text,recognize,columns}.ts` | écrit, testé |
| Rendu des 5 fichiers | `docs/gabarits/tools/render-deliverables.mjs` | fonctionne, **Node seulement**, chemins absolus en dur |
| Page publique par jeton | `web/src/App.tsx:139-151` (`/r/{token}`) + `_shared/share-auth.ts` | **en production** — c'est le patron qui débloque tout (§2.1) |
| Chaîne app authentifiée | `upgrade-doc.ts` → `use-regafy-copilot.ts:621` → `tiptapToDocxBlob` | en production, mais **mode document**, un seul appel, un seul DOCX |

### 1.2 Ce qui est écrit mais que personne ne peut atteindre

C'est le cœur du malentendu, et il faut le nommer sans détour : **du code déployé n'est pas du code
atteignable.**

| Module | Appelants en production |
|---|---|
| `_shared/ai/pool.ts` (`boundedMap`, `warmupFirst`, concurrence 6) | **aucun** — son test seul |
| `_shared/translate-section-core.ts` | **aucun** — aucune surface HTTP |
| `_shared/report-core.ts` | **aucun** — aucune surface HTTP |
| `web/src/lib/ocr/prepare-source.ts` (`prepareUpgradeSource`) | **aucun**, même dans l'app |
| Mode par rubrique de l'Edge `upgrade` | **aucun** — `UpgradeInput` n'a pas de champ `section` |

**Conséquence directe : les 2,6 min à concurrence 6 n'ont jamais été observées.** C'est une
projection arithmétique, écrite dans un commentaire de `pool.ts`. Les trois passes du produit —
conformité, traduction, revue — n'ont jamais tourné ensemble sur un document. Les deux cas réels
(Gynoril, KV-Kacin) ont été fabriqués à la main.

Le travail n'est pas perdu : ces modules sont sérieux et testés, ils sont le cœur du produit. Mais
tout chiffrage, tout prix et toute promesse de délai qui s'appuie dessus repose aujourd'hui sur une
estimation. D'où le lot **U0**.

### 1.3 Ce qui bloque l'acheteur sans compte — par conception

Quatre barrières indépendantes, chacune suffisante, toutes délibérées :

| Barrière | Preuve |
|---|---|
| CORS exclut `pharnos.com` | `_shared/cors.ts:3-9` — « la landing STATIQUE n'appelle jamais l'Edge » |
| `verify_jwt` actif sur `upgrade` | aucun bloc `[functions.upgrade]` dans `supabase/config.toml` |
| Quota par organisation | `_shared/quota.ts:22` → un anonyme n'a pas d'org → 403 |
| Storage sous le JWT appelant | `upgrade/index.ts:310` |

**On ne les lève pas.** L'Edge `upgrade` reste la porte de l'app authentifiée. Le parcours payant
passe par ses **propres** surfaces, avec sa propre authentification (jeton de commande) et son
propre compteur de crédits (porté par la commande). Mélanger les deux ouvrirait le moteur à
l'anonyme le jour où l'une des quatre barrières bougerait.

### 1.4 Les deux contradictions des plans, et comment l'architecture les résout

**A. « Vous pouvez fermer cette page » contre l'interdiction du DOCX sur Edge.**
La maquette v3 (`docs/mockups/upgrade-mise-en-conformite-v3.html:1527`) promet une livraison par
e-mail après fermeture de l'onglet — ce qui exige un worker serveur. Mais `PLAN-MOTEUR-IA.md:209`
interdit le rendu DOCX/PDF côté Edge (2 s de CPU, calcul pur). Aucun des trois plans ne tire la
conséquence : personne ne peut fabriquer les cinq fichiers quand l'onglet est fermé.

**Résolution : on coupe la chaîne là où le coût est.** Le serveur fait la partie **lente et
attendante** (59 appels IA, ~2,6 min, c'est de l'I/O — le CPU y est négligeable) et ne stocke qu'un
JSON. Le navigateur fait la partie **rapide et calculante** (mise en page des cinq fichiers, ~1 s)
au moment où le client est là — tout de suite s'il est resté, plus tard s'il revient par le lien.
L'invariant CPU est respecté, la promesse d'e-mail devient **vraie**, et rien de dérivé n'est stocké.

**B. `PLAN-UPGRADE-FRONTEND.md` se contredit sur le worker** (« à trancher » ligne 101, « obligatoire »
ligne 432). **Tranché ici : worker serveur pour l'IA, navigateur pour le rendu.** La ligne 101 est
caduque.

---

## 2. L'architecture retenue

### 2.1 La décision qui change tout : le post-paiement vit dans `web/`, pas dans `landing/`

`landing/` est du HTML servi tel quel : **aucune étape de build**
(`.github/workflows/deploy-landing.yml:5`), donc pas de TypeScript, pas d'import de
`supabase/functions/_shared/*.ts`, et toute bibliothèque doit être pré-bundlée puis commitée
(`landing/vendor/`). Y porter le rendu, l'extraction de texte et l'OCR coûterait trois bundles,
deux modifications de CSP (`connect-src` n'autorise pas `'self'`, `script-src` n'autorise pas
`wasm-unsafe-eval`) et une duplication de `boundedMap` en JS — donc une divergence garantie.

`web/` a déjà **tout** :

| Besoin | Déjà présent |
|---|---|
| Rendu Word / PDF | `docx@9.7.1`, `pdf-lib@1.17.1` |
| Lecture de PDF | `pdfjs-dist@6.0.227` + `web/src/lib/pdfjs.ts` (cmaps, polices, couche texte) |
| OCR des scans | `tesseract.js@7.0.0` + `web/src/lib/ocr/*` **écrit et testé** |
| Page publique sans compte | `App.tsx:139-151` — `/r/{token}` évalué **avant** tout provider d'auth |
| Contrat de jeton | `_shared/share-auth.ts` — 43 caractères base64url, PBKDF2, WebCrypto |

**Donc : le parcours après paiement est une page publique par jeton dans `web/`**, sur le patron
exact de `/r/{token}` qui tourne déjà en production.

```
app.pharnos.com/u/{token}     ← upload, porte, suivi en direct, livraison
```

Un seul ajout de dépendance : `jszip` (le « tout télécharger »). Rien d'autre.

> ⚠️ Corollaire à assumer : l'acheteur change d'origine (`pharnos.com` → `app.pharnos.com`). Même
> marque, même en-tête, mais **IndexedDB n'est pas partagée entre origines** — le document déposé
> avant paiement n'est pas lisible depuis `app.`. D'où le téléversement en §2.3 étape 4.

### 2.2 Les trois surfaces

| Origine | Rôle | Change ? |
|---|---|---|
| `pharnos.com/modele` | vitrine, configuration, dépôt du document, paiement en panneau | **presque pas** — un téléversement et une redirection s'ajoutent |
| `app.pharnos.com/u/{token}` | tout l'après-paiement | **nouveau**, sur un patron existant |
| Supabase | vérité de la commande, exécution du moteur, e-mails | **nouveau**, sur des patrons existants (`share`, `lifecycle-reminders`) |

### 2.3 Le parcours, étape par étape

1. **Configuration et paiement** — inchangé. La page génère une référence UUID, l'envoie à
   `checkout` qui la place dans `custom_metadata.ref` de la session Chariow.
2. **Encaissement** — Chariow → Moneroo / carte, dans le cadre.
3. **La commande naît côté SERVEUR, jamais côté navigateur.** Le Pulse `successful.sale` frappe
   l'Edge `chariow-pulse`, qui **re-vérifie par `GET /v1/sales/{id}`** (les Pulses n'ont aucun
   secret de signature — vérifié en console), insère la ligne `orders` avec
   `chariow_sale_id UNIQUE`, tire un jeton de livraison de 43 caractères, n'en stocke que le hash,
   et envoie **l'e-mail n°1** (« commande enregistrée », avec le lien).
4. **Le pont.** Au retour de paiement, la landing appelle `order-claim(ref)` **en boucle courte**
   (le webhook peut arriver après le client) ; dès que la commande existe, elle reçoit le jeton,
   **téléverse le ou les documents** vers une URL signée, puis redirige vers
   `app.pharnos.com/u/{token}`. Si le client ferme avant, l'e-mail n°1 le ramène au même endroit et
   la page lui redemande son fichier.
5. **Préparation de la source** — sur `/u/{token}` : téléchargement depuis Storage, puis
   `prepareUpgradeSource` (couche texte, sinon OCR). **Premier appelant en production** de ce module.
6. **Porte de recevabilité** — `order-gate` : est-ce vraiment un RCP ? Un refus **ne consomme aucun
   crédit** et le dit ; l'acheteur peut redéposer (3 dépôts au plus, cf. `PLAN-UPGRADE-FRONTEND.md`).
7. **Lancement** — `order-start` crée `upgrade_jobs` + les 29 lignes `upgrade_sections` en `queued`.
8. **Exécution** — l'Edge `job-tick` (§2.5) vide la file par vagues de 6.
9. **Suivi en direct** — la page interroge `order-status` toutes les 2 s et peint l'écran de la
   maquette v3 : « Rubrique 4.8 sur 29 », temps restant, rubriques qui basculent une à une.
   Le client **peut fermer** : la promesse est désormais tenue.
10. **Livraison** — job terminé → **e-mail n°2** (« vos fichiers sont prêts »). La page récupère le
    JSON complet et **fabrique les cinq fichiers dans le navigateur** en ~1 s. Téléchargements
    unitaires + ZIP. Le lien reste valide **30 jours**.

### 2.4 Le modèle de données — migration `0082`

```sql
orders                       -- une commande payée, vérité serveur
  id uuid pk
  ref uuid unique            -- la référence générée par le navigateur, relayée par Chariow
  chariow_sale_id text unique not null   -- idempotence des rejeux Pulse
  offre text not null                    -- 'up1' | 'up3'
  amount_minor int, currency text
  email text not null, first_name text, last_name text
  country text, activity text, doc_type text
  delivery_token_hash text not null      -- PBKDF2, jamais le jeton en clair
  delivery_expires_at timestamptz not null   -- +30 jours
  deposits_used smallint not null default 0  -- 3 au plus (refus de recevabilité)
  status text not null                   -- paid | source_uploaded | gated_out | running | done | failed
  created_at, updated_at

upgrade_jobs                 -- un document à traiter (1 pour up1, 3 pour up3)
  id uuid pk, order_id uuid fk
  doc_type text, source_path text, source_kind text  -- 'text' | 'ocr'
  phase text not null        -- conformity | translation | report | done
  sections_total smallint, sections_done smallint
  started_at, finished_at, error text

upgrade_sections             -- une rubrique du gabarit = une ligne = un appel
  id uuid pk, job_id uuid fk
  section_id text, phase text
  status text not null       -- queued | running | done | failed
  attempts smallint not null default 0
  content jsonb, verdict text, evidence jsonb, tokens jsonb
  claimed_at timestamptz, finished_at timestamptz
  unique (job_id, phase, section_id)
```

**RLS : `deny all`.** Aucune de ces tables n'est lue par un client. Tout passe par des Edge
Functions en service-role qui authentifient par le jeton de livraison.

### 2.5 L'exécution — pourquoi ce découpage tient les 150 s

Le mur n'est pas le CPU (les appels IA sont de l'attente), c'est le **wall clock de 150 s par
invocation**. Une orchestration de 2,6 min ne rentre pas dans une invocation. Elle rentre
parfaitement en **vagues**.

```
job-tick  (verify_jwt = false, authentifiée par un secret de service)
  ├─ réclame jusqu'à 6 rubriques `queued`  (SELECT … FOR UPDATE SKIP LOCKED)
  ├─ boundedMap({ concurrency: 6, warmupFirst: true })     ← le premier appelant de pool.ts
  ├─ écrit chaque résultat dans upgrade_sections
  ├─ s'il reste du travail : se ré-invoque (pg_net, feu et oubli)
  └─ sinon : phase suivante, ou statut `done` + e-mail n°2
```

- **Une invocation = une vague ≈ 22 s au pire.** Sept fois sous le mur.
- **`SKIP LOCKED`** rend deux ticks simultanés inoffensifs : ils ne réclament jamais la même rubrique.
- **`pg_cron` toutes les 30 s** n'est qu'un **filet** : il relance tout job qui a des rubriques
  `queued` et aucun tick vivant depuis plus de 60 s. Le chemin nominal est l'auto-chaînage, donc la
  latence de planification est quasi nulle.
- **`attempts`** borne les reprises. Rappel de l'invariant moteur : **un timeout ne se rejoue
  JAMAIS** ; seules les erreurs non déterministes ouvrent une seconde tentative.
- `pg_cron 1.6.4` et `pg_net 0.20.3` sont **déjà installés** (vérifié). Zéro brique nouvelle.

### 2.6 Performance et passage à l'échelle

| Levier | Décision |
|---|---|
| Parallélisme par job | 6 (`DEFAULT_CONCURRENCY`), avec `warmupFirst` — sans préchauffage, six appels paient six écritures de cache au lieu d'une : 0,28 à 0,35 $ perdus par upgrade |
| Parallélisme **global** | **sémaphore en base** — un compteur de rubriques `running` toutes commandes confondues, plafonné (24 pour commencer). Sans lui, dix acheteurs simultanés font 60 appels et le fournisseur nous limite. C'est le seul endroit où la montée en charge se règle. |
| Équité | le tick sert les jobs **du plus ancien au plus récent** : une grosse commande ne fait pas attendre indéfiniment une petite |
| Cache | préfixe stable + consigne, `cache_control: ephemeral` déjà posé (`anthropic.ts:107,137`). Gain annoncé −82 % sur l'entrée de la passe 1 — **à confirmer par U0** |
| Stockage | le document source (purgé à 30 jours) + un JSON de résultat. **Aucun fichier dérivé** : les cinq livrables sont refabriqués à la demande en ~1 s |
| Coût | ≈ 1,00–1,30 $ par upgrade **projeté**. À 19 000 F (29 €), la marge paraît confortable — mais le chiffre n'a jamais été observé. **U0 le tranche.** |

### 2.7 Invariants de sécurité

1. **`?paiement=ok` n'accorde RIEN.** Aujourd'hui `landing/modele.js:1008` et `:1328-1330` en font
   la preuve du règlement — un acheteur arrivé jusqu'à l'écran de paiement peut se déclarer payé en
   rechargeant la page. C'est sans effet tant que la confirmation n'ouvre qu'un `mailto:`. Le jour
   où elle déclenche le moteur, **c'est le moteur offert au prix d'un paramètre d'URL**. Le retour
   d'URL ne fait qu'**afficher** un état établi par le webhook.
2. **La commande naît du webhook re-vérifié**, jamais d'une requête du navigateur.
   `chariow_sale_id UNIQUE` porte l'idempotence des rejeux (5 : 1 min → 24 h).
3. **Le jeton de livraison est l'authentification.** 43 caractères base64url, **seul son hash est
   stocké**, expiration à 30 jours, transmis par e-mail **et** au retour de paiement.
4. **Le navigateur ne nomme jamais un produit, un prix ni un nombre de crédits.** Il nomme une
   commande ; le serveur nomme tout le reste. Même règle que `checkout`.
5. **Les crédits se décomptent dans la fonction qui ÉCRIT**, jamais dans le calcul de l'affichage.
6. **Clés Storage en ASCII** — `storageObjectKey()` pour le chemin, `sanitizeFileName()` pour
   l'affichage. Supabase refuse les clés accentuées, et un nom de fichier client en porte souvent.
7. **L'Edge `upgrade` authentifiée n'est pas touchée.** Les nouvelles surfaces sont distinctes.
8. **Aucune requête réseau ne porte le document avant le paiement** — invariant existant, conservé :
   le téléversement a lieu à l'étape 4, après la vérification serveur.

---

## 3. Les lots

Chaque lot est livrable et vérifiable seul. L'ordre n'est pas négociable : **U0 est une porte.**

### U0 — Le banc d'essai (M3) — 1 jour · **PORTE**

Un harnais Deno qui enchaîne **pour de vrai**, sur KV-Kacin :
`boundedMap({concurrency:6, warmupFirst:true})` → 29 rubriques → 29 traductions → 1 revue → rendu
des 5 fichiers. Il sort **jetons, durée par phase, coût, taux de rejet et de rétrogradation**.

Au passage, il force le refactor de `render-deliverables.mjs` en module **pur et exportable** —
`render(sections) → { docxFR, pdfFR, docxEN, pdfEN, pdfRapport }` — sans `node:fs`, sans les deux
chemins absolus `D:/pharnos-mvp/…` (`:15` et `:571`), sans la liste de jobs codée en dur. C'est
exactement le module dont U5 a besoin dans le navigateur ; le faire ici évite de l'écrire deux fois.

**Fait quand** : un tableau de chiffres mesurés existe, et `render(...)` tourne en Node comme sous
Vitest. `PLAN-MOTEUR-IA.md:324` l'exige déjà : *« Rien ne se vend avant M3. »*

**Ce que ces chiffres décident** : le prix, la promesse de délai affichée, et s'il faut ou non
réduire la portée (par exemple abandonner la passe traduction en v1).

### U1 — La vérité du paiement — 1 jour

Migration `0082` (§2.4). Edge **`chariow-pulse`** (`verify_jwt = false`, re-vérification
`GET /v1/sales/{id}`, idempotence, 5 rejeux). Edge **`order-claim`** (rendu du jeton contre la
référence, borné en débit). Jeton via `share-auth.ts`. **E-mail n°1** via Resend.

**Fait quand** : un règlement de recette à 570 F crée une ligne `orders`, l'e-mail arrive, et un
second Pulse pour la même vente ne crée rien.

### U2 — Le pont — 1 jour

Landing : après confirmation **serveur**, téléversement du ou des documents vers une URL signée
(Edge `order-upload-url`), puis redirection vers `app.pharnos.com/u/{token}`. Suppression du
`mailto:` comme transport. `?paiement=ok` ne sert plus qu'à déclencher l'interrogation.

**Fait quand** : le document arrive dans Storage sous la clé de la commande, et l'onglet bascule sur
la page publique. Recette explicite du chemin « le client ferme avant le téléversement ».

### U3 — La page publique — 1,5 jour

`app.pharnos.com/u/{token}` sur le patron `/r/{token}` (`App.tsx:139-151`) : aucune auth, aucune org,
aucune synchro. Téléchargement de la source, **`prepareUpgradeSource`** (son premier appelant),
porte de recevabilité (`order-gate`), `order-start`, puis l'écran de suivi de la maquette v3.

**Fait quand** : un scan comme un PDF à couche texte passent ; un journal déposé à la place d'un RCP
est refusé **sans consommer de crédit**, et le message le dit.

### U4 — Le moteur en série — 2 jours

Edge **`job-tick`** (§2.5) : réclamation `SKIP LOCKED`, `boundedMap`, auto-chaînage, sémaphore
global, filet `pg_cron`. Surfaces HTTP pour `translate-section-core.ts` et `report-core.ts` — qui
n'en ont aucune. Edge **`order-status`** (lecture par jeton, sans PII superflue).

**Fait quand** : une commande passe de `paid` à `done` sans intervention, les 59 appels sont tracés,
et tuer un tick au milieu ne perd aucune rubrique (le filet reprend).

### U5 — La livraison — 1 jour

Rendu des cinq fichiers **dans le navigateur** depuis le JSON, avec le module pur de U0 et les
bibliothèques déjà présentes. `jszip` pour le « tout télécharger ». **E-mail n°2**. Lien valable
30 jours.

**Fait quand** : les cinq fichiers produits dans le navigateur sont **binairement conformes** à ceux
que produit le harnais U0 en Node, sur le même JSON.

### U6 — Vérité de la promesse et recette — 0,5 jour

Le « 4 minutes environ » de `landing/modele.html:430` est remplacé par **le chiffre mesuré en U0**,
ou retiré. Un achat réel à 570 F de bout en bout. Réouverture de la vente publique.

**Fait quand** : la page ne promet plus rien que la chaîne ne tienne.

**Charge totale : ≈ 7 jours + recette.** L'OCR est inclus — il ne coûte rien de plus dès lors que la
page vit dans `web/`, où `prepareUpgradeSource` et `tesseract.js` sont déjà écrits et testés.

---

## 4. Hors périmètre, explicitement

- **Le bundle « les trois documents » (`up3`)** : la mécanique est identique (3 jobs pour une
  commande), mais on ne l'ouvre qu'après un `up1` réussi de bout en bout.
- **La livraison dans l'espace de l'org** pour un acheteur qui a un compte : le plan front la prévoit
  (`PLAN-UPGRADE-FRONTEND.md:427-430`), elle attend U6.
- **Le worker pour une génération sans navigateur du tout** : inutile — le serveur fait déjà tout le
  travail long ; seul le rendu attend le client, et il prend une seconde.
- **Migrer l'app authentifiée vers le mode par rubrique** : elle marche en mode document. À faire,
  mais après.

---

## 5. Les pièges déjà payés — ne pas les redécouvrir

1. **`?v=` sur les assets de `landing/`** doit être incrémenté à **chaque** changement de contenu :
   le HTML se propage avant l'expiration du cache JS de 5 min, et l'on obtient une page morte.
2. **Les règles de `landing/_headers` sont CUMULATIVES**, jamais substitutives : pour surcharger un
   en-tête hérité il faut le **détacher** (`! Header-Name`) puis le reposer.
3. **`connect-src` de la landing n'autorise pas `'self'`** (`landing/_headers:8`) : tout `fetch`
   même-origine y est bloqué. Sans effet ici (on ne parle qu'à Supabase), mais c'est un piège garanti.
4. **Clés Storage en ASCII** — voir §2.7 n°6.
5. **`vite:preloadError` ne se neutralise jamais** : tout `React.lazy` passe par `lazyChunk`, et un
   ErrorBoundary est obligatoire hors app-shell — donc **aussi sur `/u/{token}`**.
6. **Un timeout n'est jamais re-tenté** (invariant moteur), et tout délai est écrêté à 120 s par
   `boundedTimeout` — le plan Supabase reste `free` (mur à 150 s) jusqu'au premier abonné payant.
7. **`vertex.ts` n'a pas de décodage contraint** : tout chemin `jsonSchema` épingle `anthropic` en dur.
8. **Une citation valide ne prouve rien sur le contenu** : citer un titre de rubrique couvrirait une
   invention. D'où le second contrôle d'ancrage des **chiffres**, par jetons, jamais par `includes`.
9. **Le rendu PDF** : tracer une chaîne entière par groupe de style (jamais mot à mot, sinon les
   extracteurs recollent le texte) ; tout tracé passe par `drawMixed` (les polices standard ne codent
   que le WinAnsi) ; `titlePage` appartient à `properties` dans `docx`, sinon Word ignore l'en-tête
   de première page **en silence**.
10. **`landing/vendor/docx.esm.js` n'exporte pas** `BorderStyle`, `Header`, `LeaderType`,
    `PageNumber`, `Tab`, `TabStopType`. Sans objet si l'on suit ce plan (le rendu vit dans `web/`),
    mais à savoir si quelqu'un rouvre la piste « tout sur la landing ».

---

## 6. Corrections à apporter aux plans existants

| Document | Correction |
|---|---|
| `PLAN-UPGRADE-FRONTEND.md:7` | « Le moteur est terminé » → **faux**. Deux des trois passes n'ont aucune surface HTTP. Adopter partout un vocabulaire à deux niveaux : **déployé** (le code est en prod) vs **atteignable** (un utilisateur peut le déclencher). |
| `PLAN-UPGRADE-FRONTEND.md:101-102` vs `:432-433` | contradiction sur le worker — **tranchée ici** (§1.4 B). |
| `PLAN-UPGRADE-FRONTEND.md:35,109-113` | « porter le renderer dans `web/` » : juste, mais pour la **page publique**, pas pour l'app authentifiée. |
| `PLAN-MOTEUR-IA.md:314-315` | « Cache ✅ », « Scans ✅ » : déployés, **non atteignables**. |
| `PLAN-MOTEUR-IA.md:387-389` | « cache reste à mesurer » : périmé, le code le pose (`anthropic.ts:107,137`). |
| `PLAN-CHARIOW.md:114-128` | périmé : `prd_1u8jrq16` est bien le bundle **à 45 000 F** (vérifié en console le 2026-08-02), pas « Notice à 19 050 F ». |
| `PLAN-RECEVABILITE.md` | s'appuie sur `prepareUpgradeSource` « produit par le navigateur avant tout appel IA » : vrai **seulement à partir de U3**. |
| `docs/mockups/` | v1 et v2 sont obsolètes ; **v3 fait autorité**, et sa promesse « vous pouvez fermer cette page » devient vraie avec ce plan. |

---

## 7. Première action

**U0.** Rien d'autre ne démarre avant que les chiffres existent : ils décident du prix, du délai
affiché, et de la portée de la v1.
