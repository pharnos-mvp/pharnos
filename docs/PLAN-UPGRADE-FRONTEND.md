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
| `_shared/ai/evidence.ts` | citation et ancrage des chiffres |
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

### D. Module d'achat

Rail retenu par le CEO : **Chariow**, one-shot, 15 % de commission
([PLAN-CHARIOW.md](PLAN-CHARIOW.md)).

⚠️ **Contrainte dure déjà établie** : `script-src 'self'` sur `landing/_headers` interdit le script
Snap sur `pharnos.com`. Le contenu vit sur `pharnos.com/services/<x>`, **le paiement est isolé sur
`services.pharnos.com`** ; le delta CSP est `frame-src` seul.

Marge : à ~1,15 $ de coût contre un Audit Expert RA publié à 64 900 FCFA, le modèle tient très
largement. **Confirmer avec les jetons réels avant d'annoncer un prix.**

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

⚠️ **`isComplete` du pool refuse de tenir un lot partiel pour livrable.** Le front ne doit jamais
présenter 27 rubriques sur 29 comme un document fini : c'est le défaut du document tronqué que le
lot M0 avait déjà corrigé côté moteur.

⚠️ **Refus d'un PDF scanné.** Le mode rubrique exige un texte source. Un client verra du texte dans
son PDF — son lecteur l'océrise à l'affichage — et se le fera refuser. Le message doit **nommer la
cause** : « ce PDF est un scan, aucun texte n'y est enregistré ; l'aperçu de votre lecteur provient
de sa propre reconnaissance de caractères », et proposer la sortie. Un simple « texte source requis »
ferait passer un défaut de fichier pour une panne de notre service. **Une OCR côté navigateur est une
piste sérieuse** : le §8.6 interdit le calcul lourd côté Edge, pas côté client.

---

## 5. Recette de bout en bout

- [ ] Pays et activité recueillis **avant** le premier appel, et présents dans chaque prompt
- [ ] Mention de vigilance conforme au pays choisi
- [ ] Rubriques 8, 9, 10 conformes à l'activité choisie
- [ ] 59 appels enchaînés sous **5 minutes** (`concurrency: 6`, `warmupFirst: true`)
- [ ] Journal du cache non nul : `cacheRead` élevé dès la deuxième rubrique
- [ ] Cinq fichiers produits, parité FR/EN mécanique (rubriques, sous-rubriques, marqueurs)
- [ ] Aucun lot partiel présenté comme complet
- [ ] Un PDF scanné est refusé avec la cause nommée
- [ ] Achat Chariow sur `services.pharnos.com`, `frame-src` seul ajouté à la CSP
