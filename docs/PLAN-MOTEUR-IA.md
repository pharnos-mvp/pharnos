# PLAN — Moteur IA Regafy (Upgrade · Audit · Traduction)

> **Objectif** : un livrable qu'un expert RA signerait.
> **Statut** : plan arrêté le 2026-07-28. Chantier suivant après le socle (§2).
> **Lié à** : [PLAN-CHARIOW.md](PLAN-CHARIOW.md) (encaissement et livraison à l'acte).

---

## 1. Les trois contraintes qui dictent l'architecture

Aucune n'est négociable, et elles convergent toutes vers la même conception.

**① Le plan Supabase reste `free` jusqu'au premier client payant Pharnos** (décision CEO du 2026-07-28).
Wall clock Edge Function : **150 s**. Idle timeout : **150 s**. CPU : **2 s par requête**.

**② Un document entier ne tient dans aucune invocation.**
Un RCP complet ≈ 22 000 tokens de sortie (réflexion comprise). Opus produit à ~40–60 tokens/s :

> 22 000 ÷ 50 ≈ **440 secondes**

C'est au-dessus du mur `free` (150 s) **et** du mur Pro (400 s). Passer à Pro ne résout rien.
Le problème n'est pas le plan, c'est la forme de l'appel.

**③ Un JSON malformé sur un document réglementaire est un défaut produit**, pas un incident technique.

**→ Conclusion unique : génération par SECTION, sorties structurées, job asynchrone.**
Ce n'est pas un contournement de limite. C'est la seule forme qui satisfait les trois contraintes,
et elle reste la bonne le jour où on passe en Pro.

---

## 2. Socle prérequis (avant toute mesure de qualité)

| # | Élément | Pourquoi c'est bloquant |
|---|---|---|
| **S0** ✅ | `UPGRADE_TIMEOUT_MS : 180_000 → 120_000` | **Défaut en production — LIVRÉ (lot M0).** 180 s > mur `free` de 150 s : le garde-fou ne pouvait jamais se déclencher, la plateforme tuait le worker avant avec un 546. Écrêtage généralisé : voir §9. |
| **S1** ✅ | `_shared/ai/provider.ts` — abstraction fournisseur | **LIVRÉ (lot M1).** Point d'entrée unique : `generateParts` / `streamSimpleSse` / `Part`, fournisseur choisi par option d'appel ou `AI_PROVIDER` (défaut `vertex` — trafic actuel inchangé). Les 4 appelants (`upgrade`, `translate`, `regafy-ai`, `conformity-check`) passent par lui ; plus aucun import direct de `vertex.ts`. |
| **S2** | Harnais de mesure par section | On ne règle pas ce qu'on ne mesure pas. Sort : tokens in/out, coût, latence **et taux de rejet `source_evidence`** — par rubrique. Le mode `section` de l'Edge `upgrade` (M2) rend déjà `verdict`, `attempts`, `downgradeReason` et `ungrounded` : le harnais a sa matière. |

---

## 3. Le protocole de génération

### 3.1 Le découpage vient du gabarit, gratuitement

[conformity-specs.ts](../supabase/functions/_shared/conformity-specs.ts) **est déjà** un arbre de rubriques
identifiées : `1`, `2`, `4.1`, `4.2-posologie`, `4.6-grossesse`… Il n'y a pas de découpage à inventer :
une rubrique du gabarit = un appel.

Sortie par appel : quelques centaines à ~2 000 tokens → **10 à 20 s**. Très loin de tout mur,
sur n'importe quel plan.

### 3.2 Le schéma — le JSON ne peut pas casser

Sorties structurées (`output_config.format`) : le décodage est **contraint**. Le modèle ne *peut pas*
produire un JSON invalide. Ce n'est pas une consigne de prompt, c'est mécanique.

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": ["section_id", "status", "content", "source_evidence"],
  "properties": {
    "section_id":      { "enum": ["1", "2", "3", "4.1", "4.2-posologie", "…"] },
    "status":          { "enum": ["filled", "partial", "missing"] },
    "content":         { "type": "string" },
    "source_evidence": { "type": "string" }
  }
}
```

**Trois durcissements, et ils vont bien au-delà du JSON :**

1. **`section_id` en `enum`**, alimenté depuis `conformity-specs.ts` → inventer une rubrique absente
   du gabarit devient **structurellement impossible**.
2. **`status` en `enum` remplace le marqueur texte.** Aujourd'hui le compteur fait un `grep` sur
   `[Non fourni, à compléter]` — un contrat fragile fondé sur une chaîne de caractères.
   Demain c'est un champ typé ; le marqueur devient une **conséquence d'affichage**.
   ⚠️ La constante `MISSING_MARKER` reste le libellé rendu : elle ne disparaît pas, elle cesse
   d'être le mécanisme.
3. **`source_evidence` rend la garantie zéro-hallucination vérifiable par la machine.**
   Le modèle cite le passage source qui justifie ce qu'il écrit ; on vérifie **en code** que cette
   citation figure réellement dans le document déposé. Absente → rubrique rejetée et rejouée.
   On passe d'une promesse de prompt à un contrôle exécutable.

**⚠️ Une citation valide ne prouve rien sur `content` (constat de la revue M2).** Les deux champs ne
sont reliés par aucune vérification : citer un **titre de rubrique** — présent dans tout RCP — suffit
à couvrir un contenu entièrement inventé, et le verdict serait `verified`. Une métrique du §7 dont
l'échec s'évite en copiant une ligne ne mesure pas la tentation d'inventer, elle mesure un
copier-coller. D'où un **second contrôle, `ungroundedFigures`** : toute valeur chiffrée écrite dans
`content` (dosage, quantité, date, numéro) doit exister dans la source. Ce sont exactement les
informations que la consigne système impose de recopier VERBATIM — donc celles dont l'absence de la
source signe l'invention. Les deux contrôles ensemble rejettent puis rétrogradent ; l'un seul non.

Trois précisions qui décident de la valeur réelle du contrôle :

- **La comparaison des valeurs porte sur des JETONS ENTIERS, jamais des sous-chaînes.** Un `includes`
  rendrait « 32 mg » vrai face à une source qui dit « 325 mg » — soit exactement la classe
  d'hallucination la plus dangereuse : le dosage voisin du vrai.
- **Le titre de la rubrique est retranché de la citation avant jugement.** Un titre figure dans TOUT
  document du même type ; le citer « justifierait » n'importe quel contenu.
- **⚠️ Portée résiduelle, assumée.** Pour une rubrique EN PROSE sans valeur chiffrée, un contenu
  inventé accompagné d'une citation réelle mais hors sujet passe encore : l'implication sémantique
  entre citation et contenu n'est pas décidable en code. C'est précisément le rôle du **juge IA du
  §3.3 — sur échantillon, en recette, jamais dans la boucle de production**. Une garantie dont on
  ignore la portée exacte n'est pas une garantie ; celle-ci est bornée, et la borne est écrite.

### 3.3 Ne PAS demander au modèle de se relire

Contre-intuitif, et documenté : sur Opus 5, les instructions de vérification (« double-check »,
« vérifie avant de répondre ») **provoquent de la sur-vérification** sans gain de qualité — le modèle
vérifie déjà son travail. La consigne officielle de migration est de **supprimer** ces échafaudages.

La vérification est donc **programmatique** (`source_evidence`), pas conversationnelle.
Un juge IA distinct reste utile — mais **sur échantillon, en recette**, jamais dans la boucle de production.

---

## 4. Le pipeline

```
dépôt  →  order-run  →  202 immédiat, aucune connexion tenue
                        upgrade_jobs : queued → extracting → conformity → translating
                                     → rendering → done | failed

worker (pg_cron)  →  une rubrique par appel
                     rejet source_evidence → rejoue CETTE rubrique seule
                     progression réelle : « 12 rubriques sur 28 »
```

**Infrastructure : déjà installée.** Vérifié sur le projet `uhsireqwzqqymgsxuvqh` (eu-west-3, PG 17.6) :
`pg_cron 1.6.4` ✅ et `pg_net 0.20.3` ✅. Le patron tourne en production pour
[lifecycle-reminders](../supabase/functions/lifecycle-reminders/index.ts). Zéro brique nouvelle.
(`pgmq 1.5.1` est disponible mais non installé — inutile à cette échelle.)

**Le DOCX/PDF reste dans le navigateur.** 2 s de CPU par requête interdisent de générer un Word
côté Edge : c'est du calcul pur, pas de l'I/O. `docx@9.7.1` et `pdf-lib` sont déjà dans `web/`.

### 4.1 Deux modes, deux contextes

| | In-app (`upgrade`, authentifié) | À l'acte (`order-run`, payé) |
|---|---|---|
| L'utilisateur regarde | oui | non — « livré quelques minutes après paiement » |
| Mode | flux SSE, une passe | **job asynchrone par rubrique** |
| Battement de cœur | retour visuel **uniquement** | sans objet |

⚠️ **Le battement de cœur ne défend que contre l'*idle timeout*.** Il ne peut rien contre le
*wall clock*. S'en servir comme pièce porteuse serait du bricolage : il est légitime comme UX,
jamais comme garantie.

---

## 5. La traduction

Passe séparée, **même schéma, même découpage** : rubrique FR validée → rubrique EN.

- Le glossaire [pharma-glossary.ts](../supabase/functions/_shared/pharma-glossary.ts) sert de
  **termbase contraignante** : RCP → SmPC, notice → leaflet, étiquetage → labelling
  (termes déjà employés dans la landing EN, `data-en="SmPC, leaflet, labelling"`).
- `status` est **recopié**, jamais recalculé : une rubrique absente en FR ne peut pas devenir
  remplie en EN. Le contrôle vit dans la fonction qui **écrit**.
- Chaînage : **jamais** conformité + traduction dans la même invocation.

---

## 6. Audit Regafy AI — le même moteur en lecture

L'audit (49 €) et l'upgrade (§ prix dans PLAN-CHARIOW) partagent gabarit, glossaire et découpage.
La différence est le mode : l'audit **constate**, l'upgrade **produit**.

Schéma d'audit par rubrique : `section_id` (enum) · `verdict` (`conforme` / `écart` / `absent`) ·
`criticite` (`bloquant` / `majeur` / `mineur`) · `constat` · `source_evidence`.

Bénéfice direct : le rapport d'audit devient **trié par criticité par construction**, et l'upsell
Upgrade se calcule — on sait exactement quels documents sont non conformes et lesquels vendre.

---

## 7. Ce qu'on mesure (et qui décide de tout le reste)

Banc d'essai : documents réels de `Test/` (Gynoril, KV-Super Muscle) et `RA-source/`.

| Métrique | Pourquoi |
|---|---|
| Tokens in/out par rubrique | Remplace l'hypothèse « 3,2 caractères/token » par un chiffre |
| **Taux de rejet `source_evidence`** | **La métrique qualité n°1** — mesure directe de la tentation d'inventer |
| Rubriques `missing` vs réellement absentes | Faux négatifs = on signale à tort ; faux positifs = on invente |
| Latence par rubrique | Valide la marge sous le mur de 150 s |
| Coût réel par upgrade | Valide la marge de 71 % estimée |
| **Tokens Opus 5 vs Opus 4.8, mêmes rubriques** | **Même prix au token (5 $/25 $ tous les deux) : le seul écart de coût est la verbosité d'Opus 5. Le banc passe donc les DEUX modèles** — c'est la seule façon de confirmer le choix par des chiffres et non par doctrine. |
| Taux de refus (`stop_reason: refusal`) | Mesuré **`fallbacks: false`** pour voir le taux brut ; la production tourne avec le repli actif |

---

## 8. Invariants

1. **Jamais de génération multi-rubriques dans une invocation** — c'est la contrainte structurante.
2. **Le contrôle `source_evidence` vit dans la fonction qui écrit**, pas dans l'affichage.
3. **Aucune consigne d'auto-vérification** dans les prompts Opus 5 (§3.3).
4. **`max_tokens` généreux** : sur Opus 5 la réflexion est active par défaut et `max_tokens` plafonne
   réflexion **+** texte. Un `max_tokens` calibré pour l'ancien moteur tronque le document en plein milieu.
5. **Toujours vérifier `stop_reason`** : `max_tokens` atteint = JSON valide mais **tronqué**.
6. **DOCX/PDF côté navigateur**, jamais Edge (2 s de CPU).
7. **Le fournisseur passe par `_shared/ai/provider.ts`**, jamais d'import direct.
8. **Aucun timeout sortant au-dessus de `MAX_CALL_TIMEOUT_MS` (120 s)** — l'écrêtage vit dans la
   fonction qui lance le `fetch`, pas chez l'appelant. À reporter tel quel dans `provider.ts` (M1).
9. **Un timeout n'est JAMAIS re-tenté.** `AbortSignal.timeout` remonte un `TimeoutError` (≠
   `AbortError`) et `isTransient` le laisse passer : c'est délibéré, une seconde tentative après
   120 s ne tient pas sous le mur de 150 s. Verrouillé par test dans `retry.test.ts`.
10. **Le budget d'une invocation se compte À L'ENTRÉE du handler** (M2), pas juste avant l'appel IA :
    auth, quota, téléchargement Storage (12 Mo) et base64 consomment du wall clock. Un budget calculé
    après eux ne retranche rien — c'est le garde-fou mort de S0, sous une autre forme.
11. **Le mode rubrique EXIGE un texte source.** Sans lui, le contrôle de citation ne peut pas
    s'exercer et la réponse serait indistinguable d'une rubrique vérifiée. L'extraction PDF vit dans
    le navigateur (§8.6), et l'Edge refuse l'appel en 400 plutôt que de rendre une garantie décorative.
12. **La source précède l'instruction dans les fragments** : le préfixe stable (système + document)
    devient cachable pour les 28 rubriques, et c'est le contrat de sortie — non le document fourni par
    l'utilisateur — qui occupe la position de récence.

---

## 9. Lots

| Lot | Contenu | Dépend de |
|---|---|---|
| **M0** ✅ | `UPGRADE_TIMEOUT_MS → 120_000` + écrêtage `boundedTimeout` | — |
| **M1** ✅ | `_shared/ai/provider.ts` + `anthropic.ts` (Opus 5) | — |
| **M2** ✅ | Schéma par rubrique + contrôle `source_evidence` | M1 |
| **Postures** ✅ | `_shared/ai/personas.ts` — trois, une par passe (#441) | M2 |
| **Cache** ✅ | Préfixe + consigne, préchauffage du lot (#443) — **entrée passe 1 : −82 %** | M2 |
| **M3** | Harnais de mesure + passage du banc d'essai | M2 |
| **M4** | Worker asynchrone `upgrade_jobs` (pg_cron) | M2 |
| **M5** | Passe traduction EN | M4 |
| **M6** | Rendu DOCX/PDF conforme au gabarit | M5 |
| **M7** | Audit Regafy AI porté sur le même protocole | M2 |

**M3 est le point de décision** : les chiffres du banc d'essai valident ou invalident le modèle
économique de PLAN-CHARIOW §3. Rien ne se vend avant M3.

> **⚠️ Le découpage ci-dessus a été RÉORDONNÉ par le CEO le 29/07/2026** : on avance **gabarit par
> gabarit** (tranche verticale) et non lot par lot. Le RCP est verrouillé de bout en bout —
> conformité, traduction, revue réglementaire, mise en page — voir `docs/gabarits/PROCESS-UPGRADE-ETAPE-{1,2,3}.md`.
>
> **Le moteur est complet.** La suite est du front et de l'encaissement :
> **[docs/PLAN-UPGRADE-FRONTEND.md](PLAN-UPGRADE-FRONTEND.md)**.
>
> Estimation mesurée sur les prompts réels (KV-Kacin, 29 rubriques feuilles, 59 appels) :
> **≈ 1,00–1,30 $ par upgrade**, **≈ 2,6 min** à 6 appels simultanés. Le séquentiel demande 11 à
> 23 min et ne passe pas : le parallélisme est une exigence d'architecture. ⚠️ La réflexion d'Opus 5
> compte dans la durée — l'oublier fait sous-estimer d'un facteur deux.

---

## 10. Modèle

**Opus 5** (`claude-opus-5`), `effort: "medium"`, `thinking: {type: "adaptive", display: "summarized"}`.

- 5 $ / 25 $ par MTok — **strictement le même prix qu'Opus 4.8 et 4.7**, en plus capable :
  4.7 est dominé, il n'y a aucune raison de le choisir.
- ~~Minimum de cache **512 tokens** (contre 1 024 sur 4.8)~~ — **argument invalidé (2026-07-29)** :
  notre préfixe stable système + gabarit + glossaire fait **~5 500 tokens**, très au-dessus des DEUX
  seuils. Les deux modèles le cachent à l'identique (0,1×). Le seuil ne départage rien ici.
- **Ce qui départage vraiment Opus 5 de 4.8 sur NOTRE tâche** : suivi **plus littéral** des consignes
  (« recopie VERBATIM », « n'utilise JAMAIS tes connaissances générales » sont pris au pied de la
  lettre) et **auto-vérification spontanée** (cohérente avec §3.3). En face, deux faiblesses :
  livrables **plus longs** — et `effort` ne les raccourcit PAS, seul le prompt le fait — et
  **élargissement du périmètre**. D'où deux clauses obligatoires au prompt (concision sur `content`,
  discipline de périmètre) : sans elles, Opus 5 produit du remplissage fidèle mais non demandé,
  exactement ce que `source_evidence` ne détecte pas.
- **Repli serveur `fallbacks: "default"` (beta `server-side-fallback-2026-07-01`) — LIVRÉ, actif par
  défaut.** Opus 5 embarque des classificateurs (`cyber`, `bio`) qui peuvent rendre un
  `stop_reason: "refusal"` sur un HTTP 200. Le repli rejoue la requête dans le même appel, et le
  refus survenu avant toute sortie n'est pas facturé. Choisir Opus 5 AVEC ce filet donne les deux
  modèles ; choisir 4.8 seul prive du meilleur suivi de consignes sans rien acheter en échange.
  Un rattrapage est journalisé (`status: fallback`) : un document client décliné doit se voir.
- ⚠️ **Ne jamais désactiver la réflexion** : sur Opus 5 le mode `disabled` fait fuiter des balises
  `<thinking>` dans la réponse, sur 4.8 il fait écrire le raisonnement dans le texte visible. Dans un
  document réglementaire, les deux sont des défauts produit.
- `effort: "medium"` et non `xhigh` : la tâche est de la réécriture structurée à invention nulle,
  pas du raisonnement ouvert. L'effort élevé fait produire du contenu non demandé — exactement
  le défaut à proscrire sur un livrable réglementaire.
- Levier `speed: "fast"` (10 $/50 $, jusqu'à 2,5× plus rapide) : **inutile** avec le découpage
  par rubrique. Gardé en réserve.

**Trois pièges vérifiés au lot M1** (SDK officiel `npm:@anthropic-ai/sdk@0.115.0`) :

1. **`temperature` / `top_p` / `top_k` sont REFUSÉS par Opus 5 (400).** Tout le code existant passe
   `temperature: 0` : le fournisseur Anthropic ignore donc volontairement l'option, il ne la relaie
   jamais. Un simple « changement de modèle » aurait cassé les quatre appelants.
2. **`max_tokens` plafonne réflexion + texte** ⇒ plancher de 16 000 côté fournisseur : le `8192`
   calibré pour Gemini tronquerait le document. L'appelant borne le TEXTE, pas la réflexion.
3. **`maxRetries: 0` sur le client SDK.** Le SDK re-tente 2 fois par défaut ; combiné à notre propre
   `withRetry`, le budget de 120 s serait multiplié et repasserait au-dessus du mur.

**`ANTHROPIC_API_KEY` est posée** (secrets Supabase, vérifiée par smoke test Opus 5 : sorties
structurées et `source_evidence` validées en live). `AI_PROVIDER` reste `vertex` par défaut — le
trafic historique est inchangé — mais le **mode `section` épingle `anthropic`** : le décodage
contraint n'existe pas côté Vertex, et `provider.ts` refuse désormais explicitement un `jsonSchema`
adressé à ce fournisseur plutôt que de l'ignorer en silence.

**Reste à mesurer avant M3 (non fait en M2, délibérément) :** le `cache_control` sur le préfixe
stable. L'ordre des fragments le rend possible, mais l'activer sans chiffres reviendrait à optimiser
à l'aveugle — et l'écriture de cache se facture 1,25×. C'est au banc d'essai de trancher.
