# PLAN — L'upgrade en production, du paiement au livrable

> **Objet** : rendre la Mise à niveau documentaire réellement exécutable en production, sans
> intervention humaine, pour un acheteur **sans compte** — du règlement Chariow jusqu'aux cinq
> fichiers entre ses mains, en quelques minutes.
>
> **Écrit le** 2026-08-03, après une revue complète du code confronté aux plans.
> **Mis à jour le 2026-08-03 au soir, à la clôture de U0** — les chiffres estimés sont remplacés par
> des chiffres **mesurés**, et recoupés avec la console de facturation Anthropic.
>
> ### Reprise en 60 secondes
>
> | | |
> |---|---|
> | Branche | `feat/upgrade-u0-renderer` — poussée, PR non ouverte |
> | Derniers commits | `9a81d93` → `c024817` |
> | **Fait** | **U0 complet** (§3) — rendu pur, banc Edge, chaîne mesurée de bout en bout |
> | **Mesuré** | **60 appels · 319 s · 1,96 $** par upgrade — recoupé console (§3, U0) |
> | **À trancher AVANT U4** | le découpage de la revue — 114,1 s pour un plafond de 115 |
> | **Suivant** | **U1 — la vérité du paiement** |
> | ⚠️ Branche en retard | `origin/main` a 5 commits d'avance, dont `c7d0304` qui corrige **le même** advisory que mon `0b5b0f9` — à réconcilier avant la PR |
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

**Conséquence directe : les 2,6 min à concurrence 6 n'avaient jamais été observées.** C'était une
projection arithmétique, écrite dans un commentaire de `pool.ts`. Les trois passes du produit —
conformité, traduction, revue — n'avaient jamais tourné ensemble sur un document. Les deux cas réels
(Gynoril, KV-Kacin) avaient été fabriqués à la main.

> ✅ **RÉSOLU PAR U0 (2026-08-03).** L'Edge `bench` est le premier appelant réel de `pool.ts`,
> `translate-section-core.ts` et `report-core.ts` ; le harnais a fait tourner les trois passes
> ensemble sur un RCP jamais vu du moteur. **Ce que le tableau ci-dessus annonçait s'est vérifié
> immédiatement : deux budgets jamais éprouvés ont cédé au premier document réel** — le cache de
> préfixe ne prenait jamais (§3, U0) et la revue dépassait son délai. Un module testé mais sans
> appelant n'est pas un module fini.
>
> **Le mode par rubrique de l'Edge `upgrade` reste inatteignable depuis `web/`** (`UpgradeInput` n'a
> toujours pas de champ `section`) : U0 est passé par sa propre surface, pas par celle de l'app.
> Cette ligne du tableau tient encore.

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

### U0 — Le banc d'essai (M3) — ✅ **LIVRÉ le 2026-08-03**

| Sous-lot | Livré | Où |
|---|---|---|
| U0.1 | rendu des 5 fichiers en module **pur** (ni `node:fs` ni DOM, garde ESLint) | `web/src/lib/deliverables/` |
| U0.2 | banc d'essai 3 phases, **là où vit la clé** (elle ne sort jamais du serveur) | `supabase/functions/bench/` |
| U0.3 | harnais reprennable + chaîne complète, jusqu'aux 5 fichiers | `docs/gabarits/tools/bench-harness.ts` |

Commits `9a81d93` → `c024817`. **366 tests Deno.** Cas : `RA-source/RCP_Sample.pdf` (AARCOLD,
quadrithérapie, 27 829 caractères) — **une source que le moteur n'avait jamais vue**, choisie pour
cela : KV-Kacin avait déjà son livrable et aurait biaisé la lecture des écarts.

#### Les chiffres, MESURÉS puis RECOUPÉS avec la console Anthropic

| Passe | Appels | Durée | Coût |
|---|---|---|---|
| 1 — conformité FR | 34 | 148,7 s | 1,215 $ |
| 2 — traduction EN | 25 | 56,4 s | 0,443 $ |
| 3 — revue | 1 | 114,1 s | 0,304 $ |
| **Total par upgrade** | **60** | **319,2 s** (5,3 min) | **1,962 $** |

**Vérification externe (relevé console du 2026-08-03, clé `Pharnos`, `claude-opus-5`)** — les quatre
postes tombent à l'octet sur le barème utilisé ici : 181 675 jetons frais → 0,91 $ · 186 664 écrits
en cache → 1,17 $ · **1 551 322 lus en cache → 0,78 $** · 103 743 en sortie → 2,59 $, **total
5,44 $** pour la journée entière (une chaîne complète + une chaîne dont la revue a échoué + trois
vagues d'essai + trois revues avortées). **Le modèle de coût est donc exact, et 1,96 $ est le chiffre
de référence pour fixer le prix de vente** — l'estimation antérieure (« ≈ 1,00–1,30 $ ») était 50 %
en dessous.

⚠️ **La console affiche « Mise en cache des prompts — Non activé » et « 636 jetons sur 7 jours ».
Les deux sont faux** : l'export CSV du même jour montre 1 551 322 jetons **lus depuis le cache**,
soit **80,8 % de toute l'entrée**, et la tuile « Dépenses ce mois-ci » affiche bien 5,44 $. Ce sont
les tuiles d'accueil qui retardent ou visent un autre périmètre — **l'export fait foi, jamais le
bandeau.**

#### Ce que U0 a corrigé au passage

**Le cache de préfixe ne prenait JAMAIS** (`a520ec7`). `sectionSchema([rubric.id])` cuisait
l'identifiant de la rubrique dans l'`enum`, et le schéma entre dans le préfixe mis en cache : chaque
rubrique écrivait le sien, aucune ne le relisait. **Plus cher que pas de cache du tout** — 1,25 %
d'écriture contre 1,0 de base. Preuve dans les jetons : `cacheWrite` valait 16 461 pour la rubrique
« 4 » contre 16 463 pour « 4.1 », soit exactement les deux caractères de l'identifiant.

Le correctif **découple guider et garantir** : le **schéma** couvre tout le gabarit (préfixe
partageable), le **contrôle** reste `parseSectionResult(raw, [rubric.id])`. Une réponse portant une
autre rubrique est toujours refusée, en code.

**Ce que cela vaut, mesuré :** la passe 1 passe de 4,32 $ à 1,215 $ — **3,17 $ par upgrade**. Et sur
la seule journée du 2026-08-03, les 1 551 322 jetons lus auraient coûté 9,70 $ en écritures au lieu
de 0,78 $ : **8,92 $ économisés en une journée d'essais.**

Un test compare les schémas de **deux rubriques différentes à l'octet** : un `enum` réduit
reviendrait sans casser aucun autre test — la sortie resterait juste, seule la facture changerait.

#### ⚠️ Ce que U0 laisse OUVERT — à trancher avant U4

**La revue a tenu en 114,1 s pour un plafond de 115.** Neuf dixièmes de seconde. Elle avait dépassé
90 s **deux fois de suite** avant relèvement du budget : c'est structurel, pas un aléa. Elle est le
seul appel de la chaîne à produire jusqu'à **8 000 jetons sur quatre tableaux non bornés**
(`relocations`, `terminology`, `findings`, `recommendations`), réflexion adaptative comprise — là où
une rubrique en rend ~200 en 5 à 8 s.

**Il n'y a plus de marge** : `MAX_CALL_TIMEOUT_MS` borne tout appel à 120 s, le mur Edge est à 150 s.

| Voie | Ce qu'elle coûte | Ce qu'elle préserve |
|---|---|---|
| **Découper** en 2–4 appels, un par tableau | une passe d'assemblage ; risque qu'un constat transversal se perde | le plan `free`, le livrable, la marge |
| Baisser `effort` ou `REPORT_MAX_OUTPUT_TOKENS` | de la profondeur — **ce que le client achète** | la forme actuelle |
| Supabase `Pro` | l'abonnement, et le mur ne recule qu'à 400 s | tout le reste |

**Recommandation : découper.** Le rapport est déjà en quatre tableaux indépendants. **Non tranchée.**

#### Le coût qu'on ne voit pas

**Un appel qui dépasse son délai est facturé et n'apparaît nulle part.** Le SDK n'ayant rien reçu,
`addUsage` n'est jamais appelé. Les **trois revues avortées** de la journée pèsent ~**1,01 $** —
retrouvés uniquement par différence entre la console (1 919 661 jetons d'entrée) et mon
instrumentation (1 841 946). **Le compteur de coût de U4 doit en tenir compte**, sans quoi il
sous-estimera systématiquement les commandes difficiles.

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

**Charge totale : ≈ 7 jours + recette**, dont **U0 fait** (1 jour) — reste ≈ 6 jours. L'OCR est
inclus : il ne coûte rien de plus dès lors que la page vit dans `web/`, où `prepareUpgradeSource` et
`tesseract.js` sont déjà écrits et testés.

**Ce que U0 impose aux lots suivants** — trois contrats, tous issus de la mesure et non du plan :

| Contrat | Où il s'applique | Pourquoi |
|---|---|---|
| **Une invocation = une vague de 6**, l'état vit chez l'appelant | U4 (`job-tick`) | forme éprouvée 12 fois d'affilée ; vague la plus lente 48,3 s pour un mur de 150 s |
| **L'état s'écrit après CHAQUE vague** | U4 (en base) | le premier run du harnais a perdu 59 appels payés sur un dépassement en passe 3 |
| **`warmupFirst` sur la PREMIÈRE vague seulement** | U4 | vague 1 : écrit 16 696 jetons, lit 0 · vagues 2 à 6 : lisent 16 696 chacune. Le répéter ne fait que rallonger. **Aucun préchauffage en passe 2** : chaque traduction porte son propre contenu, il n'y a pas de préfixe commun (`cacheRead` = 0 sur les 25) |

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
| `PLAN-MOTEUR-IA.md:314-315` | « Cache ✅ », « Scans ✅ » : déployés, **non atteignables**. Le cache est désormais atteignable ET mesuré ; les scans ne le sont toujours pas. |
| `PLAN-MOTEUR-IA.md:387-389` | « cache reste à mesurer » : ~~périmé, le code le pose~~ — **le code le posait sans qu'il prenne**. Mesuré et corrigé le 2026-08-03 (§3, U0) : poser `cache_control` ne suffit pas, encore faut-il que le préfixe soit **identique** d'un appel à l'autre. |
| `PLAN-UPGRADE-FRONTEND.md` §1 | l'estimation « 59 appels · 2,6 min · 1,00–1,30 $ » est remplacée par la mesure : **60 · 5,3 min · 1,96 $**. Fait le 2026-08-03. |
| `PLAN-CHARIOW.md:114-128` | périmé : `prd_1u8jrq16` est bien le bundle **à 45 000 F** (vérifié en console le 2026-08-02), pas « Notice à 19 050 F ». |
| `PLAN-RECEVABILITE.md` | s'appuie sur `prepareUpgradeSource` « produit par le navigateur avant tout appel IA » : vrai **seulement à partir de U3**. |
| `docs/mockups/` | v1 et v2 sont obsolètes ; **v3 fait autorité**, et sa promesse « vous pouvez fermer cette page » devient vraie avec ce plan. |

---

## 7. Première action

~~**U0.** Rien d'autre ne démarre avant que les chiffres existent.~~ ✅ **Fait le 2026-08-03.** Les
chiffres existent, ils sont recoupés avec la facturation, et ils tiennent : **1,96 $ et 5,3 minutes
par upgrade.**

**Deux actions, dans cet ordre :**

1. **Trancher le découpage de la revue** (§3, U0). C'est une décision, pas un développement : elle
   conditionne l'écriture de U4 et ne peut pas être prise en écrivant du code. Recommandation :
   découper en quatre appels, un par tableau du rapport.
2. **U1 — la vérité du paiement.** Migration `0082`, Edge `chariow-pulse` et `order-claim`.

**Et une dette à solder avant la PR** : `origin/main` a cinq commits d'avance sur cette branche,
dont `c7d0304` qui corrige **le même advisory `brace-expansion`** que mon `0b5b0f9`. Réconcilier
avant d'ouvrir la PR, sinon le conflit se découvrira à la fusion.

---

## 8. Ce que la mesure a appris, et qui vaut au-delà de ce chantier

1. **Un module testé mais sans appelant n'est pas fini.** §1.2 le disait ; U0 l'a payé deux fois le
   même jour — le cache ne prenait jamais, la revue dépassait son délai. Les deux défauts étaient
   invisibles aux tests parce que les tests injectent le générateur : **ils vérifient la logique,
   jamais le budget ni la facture.**
2. **Un test qui passe ne prouve rien sur le coût.** L'`enum` par rubrique produisait une sortie
   parfaitement correcte. Seule la facture changeait. D'où le test qui compare deux schémas **à
   l'octet** — la seule forme qui attrape ce genre de régression.
3. **Ne jamais croire un bandeau de console.** « Mise en cache — Non activé » et « 636 jetons sur
   7 jours » cohabitaient avec 1,55 million de jetons réellement lus en cache le jour même.
   **L'export CSV fait foi.**
4. **Vérifier l'historique, pas seulement le disque.** Ce plan a été déclaré inexistant sur la foi
   d'un `Glob` : il vivait sur `feat/bibliotheque-reglementaire`, jamais fusionnée. Une recréation
   de 158 lignes a failli remplacer 390 lignes plus riches.
