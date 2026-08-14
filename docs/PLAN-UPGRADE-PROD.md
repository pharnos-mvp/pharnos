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
> | Branche | `feat/upgrade-u0-renderer` — **PR [#473](https://github.com/pharnos-mvp/pharnos/pull/473) OUVERTE** (31 commits, à jour de `origin/main`) |
> | Derniers commits | `9a81d93` → **`87ffb52`** (répétition générale + 4 correctifs + deps) |
> | **Fait** | **U0 → U4** (§3) — banc mesuré, paiement, pont, page publique, moteur en série |
> | **Mesuré** | **60 appels · 319 s · 1,96 $** par upgrade — recoupé console (§3, U0) |
> | ✅ **Tranché** | **la revue est DÉCOUPÉE en 4 appels**, un par tableau (§3, U0) — CEO, 2026-08-04 |
> | ✅ **U5 LIVRÉ (2026-08-09)** | le serveur ASSEMBLE (markdowns à la complétion, e-mail n°2), le navigateur MET EN PAGE (5 fichiers + ZIP, reproductibles à l'octet). Et le trou fermé en chemin : **pays/activité n'atteignaient jamais le serveur** — la mention 4.8 n'entrait dans aucun prompt |
> | ✅ **RÉPÉTITION GÉNÉRALE U6 À BLANC PASSÉE (2026-08-10)** | la chaîne complète a tourné **d'un seul tenant** pour la première fois (commande injectée = ce qu'écrit le webhook, parcours acheteur réel en navigateur, backend de prod) : dépôt → porte → 34+27+4 appels → assemblage → e-mail n°2 délivré → 5 fichiers + ZIP au navigateur, **parité binaire 3/3 PDF avec le banc**. Elle a payé : **4 défauts trouvés AVANT le premier acheteur** — `job-tick` n'épinglait pas `anthropic` (34 échecs sur `AI_PROVIDER=vertex`), plafond de revue 60 s crevé par `relocations` sur document réel (→ 100 s mesurés, tranche = plafond par import), `orders.ref NOT NULL` contre `ref: null` hors parcours (`0091`), CORS `order-*` sur un projet Pages inexistant. Chemins d'échec vérifiés aussi : échec terminal + alerte support + page honnête + relance sans nouveau paiement |
> | ✅ **Durcissements post-répétition (2026-08-11)** | ① **relance automatique** : `job-tick` rejoue lui-même une phase échouée (2 fois max, compteur `relances` — `0092`) avant tout échec terminal ; l'acheteur ne voit qu'une barre un peu plus lente, le support n'est alerté qu'au terminal — *l'acheteur n'est jamais le mécanisme de reprise* (décision CEO). ② **décompte prudent** : la page annonce 15 min et finit en ~7 — une barre qui finit tôt rassure. ③ **la revue se lit comme un document officiel** : césure des mots plus larges que leur colonne, criticité en toutes lettres (Critique/Majeure/Mineure, langue de la revue), puces solidaires de leur première ligne — trois défauts constatés sur le livrable réel AARCOLD |
> | **Vitesse — mesures réelles et leviers (2026-08-11)** | Nominal dépôt→e-mail ≈ **7 min** : conformité ~1 min (34 rubriques, vagues de 6) · traduction ~1 min · revue ~3-4 min (le plafond dur : `terminology` → `relocations` ‖ `findings` → `recommendations`) · ~1,5 min de transitions (chaque bascule attend le tick, 30 s). ⚠️ **`next_upgrade_work` sert UN job par tick (`limit 1`)** : le bundle 3 documents serait aujourd'hui SÉQUENTIEL ≈ 18-20 min. Leviers chiffrés, par coût croissant : **L1 servir N jobs par tick** (RPC `limit 3` + entrelacement — bundle ≈ 8-10 min, prérequis up3) · **L2 concurrence 6→10-12** (conformité/traduction ÷2 ≈ −1,5 min ; MESURER les rate limits Anthropic avant) · **L3 bascule de phase dans le MÊME tick** quand il reste de la fenêtre (−1 à −1,5 min) · **L4 traduction sur modèle rapide** (passe mécanique — décision qualité CEO) · L5 pipeline par rubrique (invasif, dernier). Cible réaliste après L1+L2+L3 : **un document ≈ 4-5 min, le bundle entier ≈ 6-7 min** — le temps d'un document aujourd'hui. L1+L3 s'implémentent DANS le lot up3 |
> | ❌ **RECETTE U6 RÉELLE (2026-08-14) : ÉCHEC au critère d'autonomie** | Première vente réelle (570 F, carte via Moneroo, vente `SALEX5MD9EZOYKITEPM`) : paiement OK, **mais TROIS interventions manuelles ont été nécessaires** — ① Chariow n'a JAMAIS livré son Pulse (webhook déclenché à la main, la re-vérification à la source a permis une naissance légitime) ; ② e-mail n°1 délivré chez Gmail mais introuvable en boîte (lien remis à la main) ; ③ la porte monolingue a refusé deux fois un SmPC anglais légitime (corrigée et redéployée en vol — l'empreinte est désormais bilingue). Le moteur a ensuite tourné SEUL sur la source anglaise OCR : 34+31+4 appels, e-mail n°2, 5 fichiers, **parité binaire 3/3 avec le ZIP acheteur**, mention ABMed en 4.8, revue qui a trouvé le défaut critique du dossier (phrases 28 jours tronquées). **Les 570 F ont acheté trois défauts qu'aucun test interne n'aurait vus** — mais le verdict est NO-GO : la vente reste fermée |
> | **Critère de réouverture** | Les LOTS A (fond du livrable : mentions imposées §2/6.1, doctrine actifs/excipients, tableaux markdown, casse des titres, comparateurs OCR, en-tête), B (front = LE MOCKUP comme contrat d'acceptation + config post-paiement + nommage/libellés par langue source) et C (rail : réconciliation active des ventes, salle d'attente, signature `whsec`, retry avant repli) verts, **puis UNE recette complète carte→ZIP avec ZÉRO intervention de l'opérateur**. Rien ne rouvre avant |
> | ✅ **Arbitrages CEO du 2026-08-14 (LOT A)** | ① **Titres : « garder le bon français »** — capitales ACCENTUÉES conservées (RÉSUMÉ, DÉNOMINATION…), pas d'alignement sur la maquette non accentuée ; le test de dérive verrouille l'existant, A4 est CLOS sans changement. ② **Tableau de formulation** (500 ml, colonnes Réf. pharmacopée/Fonction) : **SORT du RCP** — le §2 de la maquette est une phrase de composition (actifs + « Excipient(s) à effet notoire » + renvoi 6.1), le tableau relève du module 3.2.P.1 ; la revue journalise la relocation. ③ **Tableau MedDRA de la 4.8** (SOC | réactions — celui que le CEO désignait) : **RESTE un TABLEAU dans le RCP** — le livrable KV-RL l'a aplati en prose (contenu intégral conservé, structure perdue) : le moteur doit savoir ÉMETTRE des tableaux markdown (le rendu les affiche déjà — la revue en est pleine) ; 4.8 se rend par SOC (+ fréquences quand la source les donne). ④ E-mails : délivrabilité PROUVÉE (mauvais compte consulté — enquête close) ; restent au lot C : partie texte brut, lien de facture DURABLE (`order-invoice` re-signant — les URLs Chariow expirent en ~1 h 30), et l'absorption des e-mails tiers du parcours (reçu **MiMo Global** sur le relevé carte + **clé de licence Chariow** à désactiver en console sinon expliquer) |
> | **Suivant** | §« Lots de réouverture » ci-dessous — LOT A (solde) → LOT B → LOT C → recette d'autonomie → réouverture → **bundle up3** (leviers vitesse L1+L3 inclus) |

---

## Lots de réouverture — état au 2026-08-14, zéro régression / zéro dette

**Règles du chantier (non négociables)** : ① tout changement qui touche le LIVRABLE re-prouve la
parité binaire banc/navigateur (`UPGRADE_RUN_DIR` sur le run KV-RL du scratchpad) ; ② toute clause
de prompt, mention ou format porte son **test de dérive** — une régression casse la CI, jamais un
livrable client ; ③ **aucun run moteur** hors du run de clôture de lot, au feu vert CEO (~2 $) ;
④ le mockup `docs/mockups/upgrade-mise-en-conformite-v3.html` est le **contrat d'acceptation** du
front — recette écran par écran.

⚠️ **Branche `feat/upgrade-recette-suite` : PR à ouvrir → merger** pour déployer la part WEB
(SUBST `📄`/falsy de `pdf.ts` n'est PAS sur `app.pharnos.com` tant que non mergée ; les Edge, elles,
sont déjà déployées hors CI).

### ✅ Déjà fait, déployé, verrouillé (recette des 13-14/08)
| Fait | Verrou |
|---|---|
| Porte de recevabilité **bilingue** (le SmPC EN est LE cas d'affaires) | test « un SmPC ANGLAIS réel PASSE » |
| **Tableaux = information** : clauses structure sur les 3 passes (rubrique, conformité, traduction) | 3 tests de dérive ; preuve réelle au run de clôture |
| **Reçu AASK** dans l'e-mail n°1 (RCCM/IFU/adresse, montant, méthode, facture) + lecture du montant OBJET Chariow | tests `lireVente` (forme réelle de l'API) |
| Relance automatique (`0092`), plafond revue 100 s = tranche, décompte prudent 15 min, rendu revue lisible | tests job-tick-core + deliverables (PR #474, mergée) |
| Bandeau OCR sans émoji + `SUBST !== undefined` | test emit + parité re-prouvée 3/3 sur la vente réelle |
| Vitrine Chariow : AUCUN produit public ; up1/up3/audit masqués (« Masquer sur la boutique ») | décision consignée ; ne pas « Dépublier » (casserait l'API) |
| Délivrabilité e-mail : domaine Resend vérifié, DKIM aligné, boîte principale — **enquête close** | ne pas rouvrir |

### LOT A — le fond du livrable — ✅ **SOLDÉ le 2026-08-14** (zéro run moteur)
| # | Tâche | Fait — verrou |
|---|---|---|
| ✅ A1 | **Mentions imposées** de la rubrique 2 : « Pour la liste complète des excipients, voir rubrique 6.1. » (tous pays) + « Excipient(s) à effet notoire : » **conditionnelle** (`MentionSpec.when`). ⚠️ **Une mention conditionnelle ne se grade JAMAIS dans le prompt d'AUDIT** (`specPromptText` la saute) : son absence peut être le rendu correct, et la grader aurait rendu « non conforme » des RCP corrects au Checking Standard public — trouvé par la revue de diff, verrouillé par test | `conformity-specs.ts` (rubrique 2) ; tests spec + instruction + audit |
| ✅ A2 | **Doctrine §2/6.1** en `RubricSpec.guidance` (« Consigne de rubrique : … » dans l'instruction ; **délibérément absente du prompt d'audit** — documenté sur le champ) : §2 = actifs + effet notoire, renvoi 6.1 ; 6.1 = liste complète, véhicule inclus ; **formulation par volume nominal → module 3.2.P.1, jamais reproduite** ; la revue journalise le déplacement vers un AUTRE module (`PART_SPEC.relocations`, formulation agnostique du type de document) | 3 tests de dérive (spec, instruction ×2, revue) |
| ✅ A5 | **Comparateurs OCR** — trois défenses : ① variantes pliées (`≦`/`⩽`/`<=` → `≤`, idem ≥ ; **ni `=>` ni `=<`** — la flèche d'un texte réel aurait « confirmé » un seuil jamais énoncé) ; « ″ » jamais plié vers un comparateur (ambigu ≤/≥). ② **Un seuil au sens INVERSÉ du corpus n'est jamais « retrouvé »** (`comparatorFlip` en substitution + `opposedThreshold` au niveau des paires — délétion+saut faisait le détournement en 2 éditions, sous budget). ③ **`comparatorsToVerify`** : seuil du contenu non confirmé par le corpus océrisé → « valeurs à relire », comparateur compris — consultatif, OCR seulement, jamais un rejeu ; fréquences CIOMS (`≥ 1/10`) et paires < 2 chiffres exclues (bruit) | 9 tests sur corpus OCR truqué (cas KV-RL « ″ 28 jours », seuil inversé, artefact toléré, CIOMS) + intégration `generateSection` |
| ✅ A6 | **En-tête courant** : `fitHeader` (pdf.ts) — réduction de corps (9,5 → 7 pt) d'abord, ellipse FINALE par dichotomie sur POINTS DE CODE (O(n²) et paires de substitution coupées sinon) ; x du tracé borné à la marge ; le début du nom identifie le produit, il n'est plus jamais perdu au bord de page | 6 tests de largeur + rendu réel (nom démesuré, `dropped: []`) ; contrôle visuel avant/après sur KV-RL (le nom entier tient à corps réduit) |
| ✅ A4 | ~~Casse des titres~~ **CLOS** — arbitrage CEO : « garder le bon français » (capitales accentuées) | test de dérive des titres (existant) |
| ✅ | **Clôture prouvée sur les markdowns payés** (`run-kvrl`, copie de travail) : re-rendu local → SmPC-EN.pdf et revue.pdf **IDENTIQUES À L'OCTET** au ZIP acheteur ; RCP-FR.pdf diffère **par le seul en-tête corrigé** (attendu) ; DOCX ne diffèrent que par `docProps/core.xml` (entrée non déterministe documentée) ; `dropped: []` ; **revue de diff adversariale passée** (1 bloquant + 4 majeurs corrigés avant commit) ; 467 tests Deno + 28 vitest deliverables verts | zéro dépense — la preuve réelle vit dans le run unique final |

### LOT B — le front = le mockup — ✅ **B1/B3/B4 LIVRÉS le 2026-08-14** (B2 déplacé au LOT C)
| # | Fait — verrou |
|---|---|
| ✅ B1 | Page `/u/` au mockup v3 : bandeau contexte (produit · pays · activité · **langue source → cible**), **liste à statuts vivants** (Reprise / À compléter / En attente / spinner, ordonnée et titrée sur le gabarit via `@specs`/`@titles` — jamais une liste parallèle), panneau « Ce que nous faisons » (3 garanties mot pour mot), notice OCR, **écran de livraison** : 4 tuiles chiffrées, labels humains, durée réelle mesurée (`dureeS`), « Le document part à l'agence. La revue reste chez vous. », Tout télécharger EN TÊTE. 10 tests de rendu + helpers purs testés. Les cartes « criticité par rubrique » et « déplacements » du mockup restent dans la revue PDF (hors périmètre B1, assumé) |
| ✅ B3 | **Langue source** détectée par la porte — ⚠️ décidée sur les DEUX tables ENTIÈRES contre le corpus (`langueDuCorpus`), JAMAIS sur l'échantillon tronqué de recevabilité : parcouru FR d'abord, deux intitulés français égarés dans un SmPC anglais suffisaient à inverser LE cas d'affaires (trouvé en revue de diff, test de régression). Migration **`0093`** (`source_lang`, `product_name` — dénormalisé par le worker, le sondage 2 s ne requête plus la rubrique 1 —, `deliverable_stats` figées à l'assemblage). Libellés de phase par langue source (source EN : « Version française » / « Version anglaise au standard ») ; **nommage** `Produit_RCP Upgrade.zip` (FR) / `Produit_SmPC Upgrade.zip` (EN) |
| ✅ B4 | Service worker : `navigateFallbackDenylist [/^\/u\//, /^\/r\//]` — prouvé dans le `dist/sw.js` COMPILÉ ; un lien de livraison ne sert jamais un vieux shell |
| → B2 | **Configuration APRÈS paiement** (panneau = offre + identité + payer ; pays/activité/document sur `/u/`) — **déplacé au LOT C, avec C2** : même surface (pont + panneau landing), une seule réécriture au lieu de deux passages sur le chemin d'encaissement |

**Séquence de déploiement B (exécutée dans l'ordre SÛR — l'ordre par défaut de la CI aurait brûlé des dépôts payés, trouvé en revue de diff)** : ① migration `0093` appliquée au remote ② sonde SQL (3 colonnes, extraction `content->>'status'` sur 68 lignes réelles, rubrique 1 lisible) ③ **Edge `order-gate`/`order-status`/`job-tick` redéployées** (elles emportent les `_shared` du LOT A — dette du balayage soldée pour la chaîne upgrade ; `regafy-ai` reste à redéployer, indépendant) ④ merge = déploiement front. Fumée : `order-status` déployée répond 404 propre sur jeton inconnu. ⚠️ Le sélecteur PostgREST `outcome:content->>status` n'a de preuve SQL que côté base — sa première traversée REST réelle sera le run unique.

### LOT C — le rail
| # | Tâche |
|---|---|
| C1 | **Réconciliation active** : cron → `GET /v1/sales` `completed` sans commande → naissance par le chemin re-vérifié (l'automatisation du geste manuel du 14/08 — plus JAMAIS suspendu au webhook d'un tiers) |
| C2 | **Salle d'attente post-paiement** : réclame plusieurs minutes, affiche l'état, ne se tait jamais ; le lien de livraison s'affiche À L'ÉCRAN (l'e-mail n'est qu'un filet) |
| C3 | **Signature des Pulses** (`whsec_…`, nouveau chez Chariow) — vérifiée au webhook |
| C4 | **Repli du pont** : JAMAIS en mode recette (panne franche affichée) ; en réel : un retry avant repli + signal journalisé |
| C5 | **E-mails** : partie texte brut (aujourd'hui HTML seul) ; **facture DURABLE** (`order-invoice?token=` re-signe à la volée — les URLs Chariow expirent en ~1 h 30) ; absorber les e-mails tiers : « le débit apparaît sous *MiMo Global* » au panneau, clé de licence Chariow désactivée en console sinon expliquée dans l'e-mail n°1 |

### Critère de réouverture — et la règle du RUN UNIQUE (directive CEO, 2026-08-14)

**Aucun run consommant des jetons API ou un paiement Chariow tant que TOUT le workflow n'est pas
prêt pour une exécution de bout en bout** : paiement → traitement suivi en direct à l'écran
(streaming, niveau mockup) → livrable 100 % qualitatif. Les lots A, B et C se valident par tests,
golden files et rendus locaux sur les markdowns déjà payés — jamais par un run.

**LE run, unique et final (feu vert CEO)** = la recette d'autonomie ET la preuve de qualité en un
seul geste : carte → ZIP avec **ZÉRO intervention de l'opérateur**, page de suivi conforme au
mockup pendant le traitement, et à l'arrivée : 4.8 en **table MedDRA** (colonnes/lignes de la
source), renvoi 6.1 présent, §2 sans tableau de formulation, comparateurs OCR propres, nommage par
langue source, parité binaire. Vert → réouverture. Puis **up3** (session multi-dépôts, budget PAR
document) avec les leviers vitesse **L1** (N jobs par tick — le bundle passe de ~20 à ~8-10 min)
et **L3** (bascule de phase dans le même tick).
> | ✅ **Revue de branche purgée (2026-08-09)** | 8 bloquants + 16 majeurs corrigés, déployés (migration `0087`, 4 Edge). Détail : §« Revue de branche » |
> | ✅ Edge déployées | `order-source`, `order-status`, `order-gate`, `order-upload-url`, `chariow-pulse`, `job-tick` — à jour du **2026-08-10** (répétition), migrations `0083`→**`0091`** appliquées |
> | ✅ Mesuré sur run réel (2026-08-10) | le découpage de la revue a tourné sur document réel : `terminology` et `findings` sous 60 s, **`relocations` AU-DESSUS de 60 s** (le plafond-projection l'a tuée une fois), passe sous le plafond recalibré de 100 s ; `recommendations` sous 60 s. La chaîne bout en bout : dépôt→livrable en ~17 min avec l'échec-relance, ~8 min en nominal |
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

### 2.4 Le modèle de données — migration `0083`

> ⚠️ **`0082` est PRIS** depuis la fusion de `main` du 2026-08-04 : `0082_compilation_grace_window.sql`
> (#470, métrage de la compilation). Ce plan annonçait `0082` ; U1 écrira donc **`0083`**. Vérifier
> le dernier numéro sur `main` au moment d'écrire la migration, jamais se fier au numéro d'un plan.

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

Commits `9a81d93` → `d224665`. **368 tests Deno.** Cas : `RA-source/RCP_Sample.pdf` (AARCOLD,
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

#### ✅ Ce que U0 laissait OUVERT — TRANCHÉ le 2026-08-04 : la revue est découpée

**La revue tenait en 114,1 s pour un plafond de 115.** Neuf dixièmes de seconde. Elle avait dépassé
90 s **deux fois de suite** avant relèvement du budget : structurel, pas un aléa. Elle était le seul
appel de la chaîne à produire jusqu'à **8 000 jetons sur quatre tableaux non bornés**, réflexion
adaptative comprise — là où une rubrique en rend ~200 en 5 à 8 s. Plus aucune marge :
`MAX_CALL_TIMEOUT_MS` borne tout appel à 120 s, le mur Edge est à 150 s.

| Voie | Ce qu'elle coûte | Ce qu'elle préserve |
|---|---|---|
| ✅ **Découper** en 4 appels, un par tableau | une passe d'assemblage ; risque qu'un constat transversal se perde | le plan `free`, le livrable, la marge |
| Baisser `effort` ou le budget de sortie | de la profondeur — **ce que le client achète** | la forme actuelle |
| Supabase `Pro` | l'abonnement, et le mur ne recule qu'à 400 s | tout le reste |

**Décision CEO : découper.** Livré dans `_shared/report-core.ts` — `generateReportPart()` produit UN
tableau, `generateReport()` orchestre les quatre. **Trois contraintes en fixent la forme, et aucune
n'est un choix de style :**

1. **Le schéma reste ENTIER, identique aux quatre appels.** C'est le prix — et la leçon — de
   `a520ec7` : le schéma entre dans le préfixe mis en cache. Quatre schémas taillés chacun pour son
   tableau, ce seraient quatre préfixes distincts, donc **quatre écritures à 1,25× et zéro
   relecture : plus cher que pas de cache du tout**. Le schéma GUIDE, le code GARANTIT (`splitPart`
   ne retient que la liste demandée). Un test compare les quatre schémas **à l'octet** — c'est la
   seule forme qui attrape une régression dont *seule la facture* changerait.
2. **Le premier appel préchauffe, et c'est le plus COURT qui s'en charge.** `terminology` ouvre la
   marche et écrit le préfixe partagé ; `relocations` et `findings` le relisent en parallèle. Faire
   préchauffer `findings` coûterait le double en latence pour exactement le même cache.
3. **`recommendations` passe en dernier, nourri des constats.** Seule dépendance réelle des quatre :
   une action qui reformule un constat au lieu de le couvrir donnerait deux listes redondantes. Les
   constats voyagent dans la **queue variable**, après le point de rupture — le préfixe reste intact.

**Un tableau manquant fait REFUSER le rapport entier**, il ne le dégrade pas : `renderReportMarkdown`
écrit « Aucun. » pour une liste vide, et c'est une **affirmation**, pas une absence de données.
Livrer « aucune terminologie à aligner » parce qu'un appel a expiré, ce serait exactement le défaut
corrigé en `d224665` — un rapport qui contredit son propre document. L'erreur **nomme le tableau** et
porte l'originale en `cause` (déterministe ⇒ jamais rejouer ; transitoire ⇒ rejouable).

⚠️ **Deux choses restent à mesurer en vrai, et le banc ne les donnera pas** : les durées réelles par
tableau (aucun ne doit approcher son plafond de 60 s) et le taux de `strayRows` — le prix du schéma
entier, puisqu'il laisse au modèle la possibilité de ranger une ligne sous une autre liste. Les deux
sortent désormais du banc (`partsMs`, `partsAttempts`, `strayRows`) et entrent dans `MESURES.md`.
**Et le risque assumé qu'aucun test n'attrapera : un constat TRANSVERSAL, visible seulement en tenant
les quatre tableaux à la fois, peut se perdre.** Il se surveille en recette, pas en CI.

#### Ce que la revue de code a corrigé après coup (`d224665`)

Le lot avait franchi mes portes locales ; une revue dédiée a trouvé deux blocages, tous deux issus
du même réflexe — **avoir vérifié mes fichiers plutôt que la liste de la CI**.

1. **`translate/index.ts` ne compilait plus.** L'élargissement de `Usage` avait cassé un appelant
   non modifié, absent de mon typecheck. La branche était rouge. → typechecker **toute** la liste
   `deno check` du workflow, jamais le sous-ensemble qu'on vient de toucher.
2. **Le banc gardait 30 rubriques sur 34**, écartant 8, 9, 10 et `prescription` — précisément
   celles qu'un dossier étranger sans numéro d'AMM laisse vides. `renderReportMarkdown` calculant
   « à compléter — N » sur ce qu'on lui donne, le rapport aurait **contredit son propre document**.
   Le compte d'AARCOLD tombait juste par chance. → **une borne qui tronque en silence est pire que
   pas de borne** : refuser, et calibrer sur le référentiel réel.

Trois variantes du même défaut ont été corrigées avec : texte source coupé en silence, `status`
inconnu corrigé en `missing` (donc gonflant le décompte de lacunes d'un rapport client), rubrique
inconnue évaporée dans un `filter`. **Refuser plutôt que corriger poliment.**

**Et une fragilité que le correctif de cache avait introduite** : élargir l'`enum` a rendu
ATTEIGNABLE un cas jusque-là impossible — le modèle peut former « 2 » en répondant sur « 1 ». La
rubrique était perdue, ni rejouée ni rétrogradée, et le harnais sortait en erreur : 1,2 $ à repayer
pour une erreur d'aiguillage. Elle est désormais rejouée une fois puis **rétrogradée en `missing`
avec la cause `misrouted`** — jamais rangée sous le mauvais numéro. **`misrouted` est une métrique à
suivre** : s'il grimpe, c'est le schéma élargi qui désoriente, et le prix du cache partagé serait à
revoir.

#### Le coût qu'on ne voit pas

**Un appel qui dépasse son délai est facturé et n'apparaît nulle part.** Le SDK n'ayant rien reçu,
`addUsage` n'est jamais appelé. Les **trois revues avortées** de la journée pèsent ~**1,01 $** —
retrouvés uniquement par différence entre la console (1 919 661 jetons d'entrée) et mon
instrumentation (1 841 946). **Le compteur de coût de U4 doit en tenir compte**, sans quoi il
sous-estimera systématiquement les commandes difficiles.

### U1 — La vérité du paiement — 1 jour

Migration `0083` (§2.4 — `0082` est pris). Edge **`chariow-pulse`** (`verify_jwt = false`, re-vérification
`GET /v1/sales/{id}`, idempotence, 5 rejeux). Edge **`order-claim`** (rendu du jeton contre la
référence, borné en débit). Jeton via `share-auth.ts`. **E-mail n°1** via Resend.

**Fait quand** : un règlement de recette à 570 F crée une ligne `orders`, l'e-mail arrive, et un
second Pulse pour la même vente ne crée rien.

### U2 — Le pont — ✅ **LIVRÉ le 2026-08-05** (`3352f48`)

Landing : après confirmation **serveur**, téléversement du document vers une URL signée
(Edge `order-upload-url`), puis redirection vers `app.pharnos.com/u/{token}`. Le `mailto:` n'est
plus le transport. `?paiement=ok` ne sert plus qu'à déclencher l'interrogation.

Ce qui décide vit dans `landing/modele/pont.js`, module **pur**, **8 tests Deno** (`deno test`
couvre désormais `landing/` en plus de `_shared/`) :

| Décision | Pourquoi elle est testée |
|---|---|
| « pas encore » ≠ « refusé » | le Pulse peut arriver APRÈS le client — le confondre avec un échec renverrait l'acheteur sur « commande introuvable » une seconde avant que sa commande n'existe |
| la boucle FINIT (~90 s, cadence monotone) | un onglet oublié interrogerait le serveur sans fin ; la fin dit quoi faire — l'e-mail n°1 porte le même lien |
| jeton dans le CHEMIN | une chaîne de requête fuit dans les `Referer`, les journaux de proxy, les captures d'écran |
| `localhost.attaquant.fr` ≠ `localhost` | comparaison stricte, jamais une sous-chaîne |

⚠️ **L'URL de dépôt est demandée UNE fois** — c'est elle qui décompte un dépôt sur trois. Le PUT se
retente sur la même URL (clé dérivée du job, `x-upsert`), et **seulement sur ce qui a une chance de
passer** : un 403 d'URL expirée retenté trois fois ne fait que rallonger l'attente.

⚠️ **On redirige MÊME quand l'envoi échoue.** La page de suivi sait redemander le fichier ; laisser
l'acheteur sur la landing avec un message d'erreur l'y laisserait pour de bon.

Le pied de page annonçait « Rien n'a quitté cet appareil ». C'était vrai avec le `mailto:` ; ça ne
l'est plus, et une phrase rassurante devenue fausse sur la confirmation d'un achat est le pire
endroit pour en laisser une.

**Reste sur ce lot** : le bundle `up3` ne fait traverser que le document principal — le compteur de
dépôts est de 3 par COMMANDE, trois documents l'épuiseraient sans laisser de reprise. Conforme au §4
(hors périmètre tant qu'un `up1` n'a pas réussi de bout en bout), mais **la vente `up3` est ouverte
sur la landing** : à trancher avec la réouverture de U6.

### U3 — La page publique — ✅ **LIVRÉE le 2026-08-05** (`693ac65`, `5613789`)

`app.pharnos.com/u/{token}` sur le patron `/r/{token}` : aucune auth, aucune org, aucune synchro.
Récupération de la source, **`prepareUpgradeSource`** (son premier appelant en production), porte de
recevabilité (`order-gate`), puis l'écran de suivi.

**Une surface non prévue par ce plan a dû être écrite : `order-source`.** Le document est téléversé
depuis `pharnos.com` et lu depuis `app.pharnos.com` — deux origines, donc **aucun stockage
navigateur partagé** (le §2.1 le disait, sans en tirer la conséquence). Storage est le seul chemin,
et la page n'a ni compte ni JWT pour l'y lire.

⚠️ **Et `source_uploaded` n'était écrit NULLE PART.** Le téléversement se fait sur une URL signée :
personne ne nous dit que les octets sont arrivés, et `source_path` est écrit à l'ÉMISSION de l'URL.
`order-source` **constate** l'objet dans Storage avant de faire avancer la commande. Sans ce
constat, un acheteur revenu par l'e-mail n°1 se voyait redemander un document déjà envoyé et
**brûlait un dépôt sur trois** pour rien.

**Trois décisions protègent les trois dépôts d'une commande payée :**

1. `doitChercherSource` interroge le serveur **avant** de réclamer un fichier.
2. **Jamais après un refus** : le document le plus récent est alors celui que la porte vient
   d'écarter. Le redemander, ce serait boucler jusqu'à épuiser les trois dépôts sans que l'acheteur
   ait jamais pu fournir le bon fichier.
3. **On lit le PDF avant de le déposer** : c'est `order-upload-url` qui décompte, donc un fichier
   illisible refusé côté navigateur ne coûte rien.

**Fait quand** : ✅ le chargement, le routage et l'écran de lien expiré sont vérifiés en vrai
navigateur sur un VRAI 404 de l'Edge. ⏳ **Reste à jouer en recette** : un scan et un PDF à couche
texte de bout en bout, et un journal déposé à la place d'un RCP (refus sans crédit consommé).

#### ⚠️ L'ORDRE DE DÉPLOIEMENT N'EST PAS INDIFFÉRENT

**`order-source` doit être déployée AVANT que `app.pharnos.com` ne serve la nouvelle page.**

Si le front sort en premier, `demanderSource` reçoit le **404 du routeur de Functions** — et non le
409 métier. `raisonDepuisHttp` classe un 404 en `lien_invalide`, jamais en `refus` : l'acheteur qui
arrive du pont, **document déjà téléversé et dépôt déjà décompté**, se retrouve sur l'écran de
dépôt et en brûle un second. Le seul cas du chantier où l'ordre de déploiement coûte de l'argent.

`order-status` peut suivre dans n'importe quel ordre : l'ajout de `docType` est purement additif, et
la page tolère son absence (`docType?: string | null`, garde `estDocType`).

#### Ce que la revue de code a corrigé — six bloquants, cinq payants (`54c92c5`)

La revue a répondu **DO NOT SHIP** sur la première version. Chaque constat a été re-vérifié avant
correction ; aucun n'était un faux positif. Les cinq premiers coûtaient de l'argent à quelqu'un qui
venait d'en donner.

| # | Le défaut | Ce qu'il coûtait |
|---|---|---|
| B1 | La landing nomme l'étiquetage `etiquetage`, le serveur `labeling`, et `lireDemandeDepot` retombait **en silence** sur `rcp` | l'acheteur d'un étiquetage voyait son document jugé contre le gabarit du RCP et refusé **trois fois** : commande morte, 19 000 F encaissés, zéro livrable |
| B2 | `pontEnCours` est une variable de **module** — morte au rechargement — alors que la référence vit 7 jours dans `localStorage` | chaque rechargement, retour arrière ou réouverture d'onglet **consommait un dépôt sur trois** |
| B3 | Le récapitulatif d'un bundle annonçait les trois fichiers comme « reçus » ; le pont n'en transmet qu'un | deux documents payés effacés de l'appareil au 7ᵉ jour, sans un mot |
| B4 | `rafraichir` rendait `null` sur **toute** erreur, et `vueDepuis(null)` vaut « expiré » | une coupure 3G ou un 429 annonçaient « ce lien n'est plus valable » à quelqu'un qui venait de payer — sans aucun bouton de reprise |
| B5 | `source_uploaded` est écrit dès que le serveur **constate** le fichier, donc avant que le navigateur ait su le lire | un PDF protégé par mot de passe enfermait sur un sablier définitif : pas de sondage, pas de bouton, deux dépôts inatteignables |
| B6 | Ce qui précédait le dépôt était `arrayBuffer()` — de la copie d'octets, qui ne juge **rien** | un PDF chiffré ou corrompu consommait une tentative avant d'échouer, et le commentaire jurait le contraire |

**La contre-revue a trouvé deux majeurs de plus** (`01e2bfa`) — les deux dans mes propres
corrections, et les deux reproduits avant d'être crus :

| # | Le défaut | Ce qu'il coûtait |
|---|---|---|
| C1 | `echecLecture` n'était posé que par la lecture du PDF : un téléchargement coupé ou une porte en 503 laissaient l'écran **exactement là où B5 le laissait** | sablier définitif sous un « ne fermez pas cet onglet », sans message ni bouton |
| C2 | `depotFait` n'était écrit que si le téléversement **réussissait**, alors que le dépôt est consommé par `order-upload-url`, dont le succès est indépendant du PUT | sur réseau instable, chaque rechargement reprenait un dépôt : commande verrouillée **sans qu'un octet soit arrivé** |

C1 ne se rattrape pas, il se **rend impossible** : `source_uploaded` sans rien en vol ne peut
signifier qu'une chose — la page démarre toujours la préparation sur cet état — donc c'est une étape
à part entière (`reprise`), avec son bouton. ⚠️ **Et surtout pas un `depot`** : le fichier est déjà
là et son dépôt déjà décompté ; en proposer un second ferait payer à l'acheteur un incident réseau
qui n'est pas le sien.

**Trois leçons qui valent au-delà de ce lot :**

1. **Un repli silencieux sur une valeur par défaut est pire qu'un refus.** B1 tenait entièrement dans
   un `? brut : 'rcp'`, et un test figeait ce comportement — il affirmait exactement l'inverse de ce
   qu'il fallait garantir. Deux vocabulaires qui se ressemblent (`etiquetage` / `labeling`) ne se
   rapprochent que par une table explicite.
2. **Une garde en variable de module n'est pas une garde.** B2 : elle protège d'un double clic,
   jamais d'un rechargement. Une garantie d'argent vit dans une persistance, pas dans une portée.
3. **« Je n'ai pas de données » n'est pas « ça n'existe pas ».** B4 et M5 sont le même défaut, à deux
   endroits : un `catch` qui rassemble une panne réseau et un état métier fait dire à l'écran des
   choses fausses sur la commande d'un client.
4. **Un drapeau doit marquer ce qui a été CONSOMMÉ, pas ce qui a RÉUSSI.** C2 : entre les deux, il y
   a exactement le chemin d'échec qu'on voulait couvrir.
5. **Corriger un défaut sur un chemin ne le corrige pas sur les autres.** B5 et C1 sont le même
   sablier, atteint par trois portes différentes ; deux étaient encore ouvertes après le correctif.
   Balayer les états × les échecs, et pas seulement celui qu'on vient de lire.

**Aussi corrigé** : le changement de langue relançait toute la séquence (`t` change d'identité avec
`lang` et entrait dans les dépendances) — deux reconnaissances de caractères en parallèle, puis un
faux « refusé » ; `order-source` pouvait faire **remonter** une commande refusée vers « préparation »
(la garde ne vivait que côté client) ; la promesse « un e-mail vous préviendra » portait sur un envoi
qui n'existe pas encore (U5) ; et **le jeton de livraison partait dans les traces Sentry**, qui
nomment leurs transactions d'après l'URL — masquage posé sur les trois portes.

### U4 — Le moteur en série — 2 jours

Edge **`job-tick`** (§2.5) : réclamation `SKIP LOCKED`, `boundedMap`, auto-chaînage, sémaphore
global, filet `pg_cron`. Surfaces HTTP pour `translate-section-core.ts` et `report-core.ts` — qui
n'en ont aucune. Edge **`order-status`** (lecture par jeton, sans PII superflue).

La revue entre dans la file comme **quatre lignes** (`generateReportPart`, un `section_id` par
tableau), avec la seule contrainte d'ordre du chantier : `recommendations` attend `findings`. Les
trois autres sont indépendants, `terminology` en tête pour préchauffer le cache.

**Fait quand** : une commande passe de `paid` à `done` sans intervention, les 59 appels sont tracés,
et tuer un tick au milieu ne perd aucune rubrique (le filet reprend).

### U5 — La livraison — ✅ **LIVRÉ le 2026-08-09** (`ad06274`, `9e64e5a`)

Migration `0088` appliquée, Edge à jour. Ce qui a été construit suit la décision ci-dessous
(le serveur assemble, le navigateur met en page) ; s'y ajoutent, découverts en chemin :

- **le trou pays/activité** — les colonnes de `0083` n'étaient JAMAIS écrites, et `job-tick` ne
  passait aucun `countryCode` au moteur : la mention de vigilance 4.8 n'entrait dans AUCUN prompt
  de production. Le dépôt est leur transport ; la page ne les redemande que si la commande n'en
  porte pas ;
- **l'e-mail n°2 existe** (bascule `running→done` sous `.select()` : un seul tick l'envoie, jeton
  neuf `source:'completion'`, échéance jamais allongée) — et la promesse d'écran s'est refaite
  entière, avec le test inversé qui EXIGE de se réinverser si l'envoi disparaît ;
- **le rapport ne dit plus « votre produit »** : le nom se dérive de la rubrique 1 ;
- **la parité banc/navigateur est structurelle** : le harnais importe le MÊME assembleur et la
  MÊME table de titres que `job-tick`, et `run.json` porte `created`.

⏳ **Recette restante** : un achat réel à 570 F de bout en bout (c'est U6) — la chaîne complète n'a
tourné qu'en pièces vérifiées séparément.

#### Le plan initial (pour mémoire)

Rendu des cinq fichiers **dans le navigateur** depuis le JSON, avec le module pur de U0 et les
bibliothèques déjà présentes. `jszip` pour le « tout télécharger ». **E-mail n°2**. Lien valable
30 jours.

**Fait quand** : les cinq fichiers produits dans le navigateur sont **binairement conformes** à ceux
que produit le harnais U0 en Node, sur le même JSON.

#### ⚠️ Ce que l'étape 10 du §2.3 disait, et pourquoi elle change

Le plan annonce « la page récupère le JSON complet et fabrique les cinq fichiers ». Vérifié dans le
code au moment d'écrire ce lot, **ce JSON ne suffit pas** :

1. **`renderReportMarkdown` calcule la liste des lacunes depuis les STATUTS des rubriques.**
   `assembler()` ne rend que le `content` des lignes **abouties** — jamais leur `status`. Le
   navigateur ne peut donc pas reproduire le squelette déterministe du rapport. Le lui faire
   recalculer depuis un `livrable` enrichi recréerait **exactement** le défaut corrigé en `d224665` :
   un rapport dont le décompte contredit son propre document. La garantie doit rester là où la
   donnée fait autorité — en base.
2. **La référence de conformité binaire EST le markdown du serveur.** Le harnais U0 écrit
   `rapport.md` depuis `r3.markdown`, produit à la génération. Comparer le navigateur à lui-même
   ne prouverait rien.
3. **`job-tick` ne l'assemble nulle part** : il passe la phase `report` à `done` en laissant les
   quatre tableaux en lignes séparées. `renderReportMarkdown` **n'a aujourd'hui aucun appelant en
   production** — le même piège que `pool.ts` avant U0 (« un module testé mais sans appelant n'est
   pas un module fini »).

**Décision : le SERVEUR produit les trois markdowns à la fin du job, le NAVIGATEUR met en page les
cinq fichiers.** La coupure du §1.4 est respectée à la lettre — le serveur fait ce qui fait autorité
et ce qui est lent, le navigateur fait ce qui coûte du CPU (2 s de DOCX/PDF, l'invariant qui
interdit le rendu côté Edge). Assembler trois chaînes de caractères n'est pas ce CPU-là.

Ce que cela impose :

| | |
|---|---|
| Migration `0087` | les trois markdowns portés par `upgrade_jobs` |
| `job-tick` | à la complétion, rend les markdowns — **premier appelant de `renderReportMarkdown`** |
| `_shared/deliverable-markdown.ts` | l'assemblage des documents, EXTRAIT du harnais et partagé avec lui, jamais recopié |
| `order-status?livrable=1` | rend les trois markdowns + `{slug, reportHeader, reportLang}` |
| `web/` | `upgradeJobs()` + `renderDeliverables()` + `jszip`, et rien d'autre |

⚠️ **Un défaut de qualité à corriger dans ce lot** : `job-tick` passe `productName: 'votre produit'`
en dur (`index.ts:615`) là où le harnais passe le vrai nom commercial. Le rapport livré au client
poserait donc la question « sans objet » sur « votre produit ». Le nom doit venir de la commande.

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
| **`warmupFirst` sur la PREMIÈRE vague seulement** | U4 | vague 1 : écrit 16 696 jetons, lit 0 · vagues 2 à 6 : lisent 16 696 chacune. Le répéter ne fait que rallonger. **Aucun préchauffage en passe 2** : chaque traduction porte son propre contenu, il n'y a pas de préfixe commun (`cacheRead` = 0 sur les 25). **La passe 3 en a un depuis le découpage** — pièce + préambule, partagés par les quatre appels |
| **La revue est QUATRE lignes de file, pas une** | U4 (`upgrade_sections`) | `generateReportPart()` est exportée pour cela : un `section_id` par tableau, donc un rejeu ciblé. Rejouer la passe entière pour un tableau expiré repaierait les trois autres |

---

## 4. Hors périmètre, explicitement

- ~~**Le bundle « les trois documents » (`up3`)** : la mécanique est identique (3 jobs pour une
  commande), mais on ne l'ouvre qu'après un `up1` réussi de bout en bout.~~
  ⛔ **CADUC — arbitrage CEO du 2026-08-06.** Le bundle **rentre dans le périmètre**, et sa forme
  est arrêtée : à l'arrivée sur `/u/{token}`, la page **ouvre une session qui réclame les deux
  documents manquants** (le premier est passé par le pont), chacun avec sa propre porte de
  recevabilité, et **l'analyse ne démarre que lorsque les trois sont recevables**.
  **Aucun recours par e-mail** — ni pour les annexes, ni pour quoi que ce soit d'autre.

  ⚠️ **Ce n'était pas un arbitrage de confort : c'est l'offre elle-même.** Ce qui est vendu 69 €,
  c'est « **les trois documents, mis en cohérence entre eux** » (lexique verrouillé,
  `PLAN-UPGRADE-FRONTEND.md` §D bis). Une mise en cohérence exige de tenir les trois **avant**
  d'analyser : les traiter séparément, ou en faire transiter deux par le support, ne livre pas une
  version dégradée de la promesse — cela ne la livre pas du tout.

  ⚠️ **Le blocage est en base, pas à l'écran.** `deposits_used` est un compteur **par commande**,
  plafonné à 3 par contrainte SQL, et `order-source` / `order-status` ne lisent que le job **le plus
  récent**. Trois documents demandent trois budgets de dépôt séparés — sinon déposer les trois
  épuise le compteur et ne laisse aucune reprise. Migration nécessaire (le dépôt devient un couple
  commande × document), plus les quatre Edge et les deux fronts. Le reste existe déjà :
  `upgrade_jobs` porte déjà plusieurs jobs par commande, c'est ainsi que les reprises fonctionnent.

  **État au 2026-08-06** : la landing renvoie encore les deux annexes vers le support (`#cfmdesc-trio`
  de `modele.html`). **C'est le contournement que cet arbitrage annule** ; il tombe avec le lot
  bundle. La vente publique étant fermée jusqu'à U6, aucun acheteur réel ne l'atteint d'ici là —
  **point à reprendre en U6 avant réouverture**.
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

~~**Trancher le découpage de la revue.**~~ ✅ **Fait le 2026-08-04** — découpée en quatre appels
(§3, U0). C'était la dernière décision qui bloquait l'écriture de U4.

~~**Une dette à solder avant la PR** : `origin/main` a cinq commits d'avance.~~ ✅ **Soldée le
2026-08-04.** La fusion s'est faite **sans un seul conflit**, et la crainte annoncée ici était
infondée pour une raison qui mérite d'être notée : `c7d0304` et mon `0b5b0f9` corrigeaient bien le
même advisory, mais **avec le même contenu** — les deux `package-lock.json` étaient déjà identiques à
l'octet (`brace-expansion` 5.0.9, `fast-uri` 3.1.5, `undici` 7.29.0), et les `overrides` inchangés.
Git ne voit pas de conflit là où les deux côtés écrivent la même chose. **Mesurer avant de
redouter** : `git merge-tree --write-tree` répond en une seconde et sans rien écrire.

**Le vrai obstacle était ailleurs, et il n'était pas dans le plan** : l'arbre de travail portait
onze fichiers non commités du CEO (#470, métrage de la compilation) qui bloquaient la fusion. Ils se
sont révélés **identiques au hash près à ce que `origin/main` allait écrire** — le travail était déjà
fusionné en amont. Vérifié par `git hash-object` avant de dégager quoi que ce soit, sauvegardé, puis
recontrôlé après fusion : dix-sept fichiers, zéro octet perdu.

**Action suivante : U1 — la vérité du paiement.** Migration `0083` (⚠️ `0082` est pris depuis #470 —
voir §2.4), Edge `chariow-pulse` et `order-claim`.

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
   de 158 lignes a failli remplacer 390 lignes plus riches. `git log --all -- <fichier>` avant toute
   conclusion d'absence.
5. **Typechecker la liste de la CI, pas ses propres fichiers.** Élargir un type partagé casse des
   appelants qu'on n'a pas ouverts. Deux minutes de `deno check` sur les 14 fonctions valent mieux
   qu'une branche rouge découverte à la PR.
6. **Une borne qui tronque en silence est pire que pas de borne.** `MAX_ITEMS = 30` sur un gabarit
   de 34 rubriques rendait un rapport calculé sur un document amputé, sans le dire. Refuser.
7. **Élargir une contrainte rend atteignables des cas jusque-là impossibles.** L'`enum` par rubrique
   interdisait structurellement une réponse mal aiguillée ; l'élargir pour partager le cache l'a
   rendue possible. Toute contrainte qu'on relâche pour une raison de performance demande de
   vérifier ce qu'elle empêchait par construction. **Le découpage de la revue a reposé exactement le
   même arbitrage**, et l'a tranché pareil : schéma entier pour que le cache prenne, garantie en
   code, rejeu puis refus.
8. **Mesurer avant de redouter.** Ce plan annonçait un conflit de fusion certain ; il n'y en a eu
   aucun — les deux branches corrigeaient le même advisory avec le même contenu. Et le vrai obstacle
   (onze fichiers non commités dans l'arbre) n'était pas écrit. `git merge-tree --write-tree` simule
   la fusion sans rien écrire, `git hash-object` dit en une seconde si un fichier « en travail » est
   déjà celui d'en face. **Une minute de mesure remplace une heure de prudence — et surtout, elle
   corrige la peur de travers.**
