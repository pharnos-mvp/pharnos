# PLAN — Recevabilité du document déposé

> **Statut** : conception arrêtée le 30 juillet 2026, sur demande CEO. À implémenter **avant** la
> validation du moteur d'upgrade sur l'ensemble des gabarits.
>
> **Lié à** : [PLAN-MOTEUR-IA.md](PLAN-MOTEUR-IA.md) · [PLAN-UPGRADE-FRONTEND.md](PLAN-UPGRADE-FRONTEND.md) ·
> [PLAN-CHARIOW.md](PLAN-CHARIOW.md)

---

## 1. Le problème, et pourquoi il est commercial avant d'être technique

Un utilisateur peut déposer autre chose qu'un RCP : une lettre, un arrêté, une facture, une page de
journal. Par erreur — ou **délibérément**.

C'est le second cas qui dimensionne la fonctionnalité. Un laboratoire qui évalue Regafy commencera
souvent par là : *« voyons s'il détecte que je lui donne n'importe quoi »*. Ce test se joue en une
minute et décide de la suite. Un moteur qui produit consciencieusement un « RCP » à partir d'un
journal officiel a perdu son client avant d'avoir montré quoi que ce soit — et il l'a perdu sur le
terrain où nous prétendons être forts.

**La porte d'entrée n'est donc pas une validation d'entrée. C'est une démonstration de lecture.**

---

## 2. Ce que la porte juge — et ce qu'elle ne juge JAMAIS

| Elle juge | Elle ne juge pas |
|---|---|
| Est-ce bien un document du TYPE demandé ? | Est-il de bonne qualité ? |
| Y a-t-il matière à travailler ? | Est-il complet ? bien numéroté ? à jour ? |

⚠️ **Confondre recevabilité et qualité refuserait exactement les clients qui ont le plus besoin de
nous.** Un RCP médiocre, lacunaire, mal ordonné est le cas d'usage NORMAL de l'upgrade : c'est ce
qu'il vient corriger. La porte ne demande pas « ce document est-il conforme ? », elle demande
« est-ce un RCP ? ».

---

## 3. L'asymétrie des erreurs, et le sens dans lequel on penche

| Erreur | Coût | Récupérable ? |
|---|---|---|
| **Faux accept** — on analyse un journal | livrable absurde, crédit brûlé, crédibilité détruite **en un essai** | non |
| **Faux refus** — on refuse un vrai RCP | le client ne peut pas utiliser ce qu'il a payé | **oui** |

Les deux sont graves. Mais le faux refus laisse une porte de sortie — seconde chance, puis recours —
là où le faux accept ne laisse rien : le mal est fait, et fait devant un prospect qui testait.

**On penche donc vers le refus — à la condition stricte que le chemin de récupération soit réel.**
Sans seconde chance gratuite, cette inclinaison deviendrait une faute.

---

## 4. Trois couches, de la moins chère à la plus chère

### Couche 0 — l'empreinte du gabarit (déterministe, gratuite, instantanée)

Le corpus de contrôle existe déjà : il est produit par le navigateur avant tout appel IA
(`prepareUpgradeSource`). On y cherche les **repères du gabarit demandé** — titres de rubriques et
mentions imposées, dérivés de `conformity-specs.ts` et non d'une liste à maintenir en double.

- Un RCP contient « COMPOSITION QUALITATIVE ET QUANTITATIVE », « Effets indésirables », « Titulaire
  de l'autorisation de mise sur le marché »…
- Un journal officiel, une lettre, une facture : **zéro repère**.

⚠️ La recherche passe par `findInSource`, la MÊME fonction que le contrôle de citation : sur un scan,
elle tolère les erreurs de lecture. Une empreinte plus stricte que le contrôle qu'elle précède
refuserait des documents que le moteur, lui, saurait traiter.

Cette couche seule tranche les cas grossiers — et ce sont ceux du test d'entrée. Coût : **zéro**.

### Couche 1 — la classification (un seul appel IA, sortie contrainte)

Pour ce que la géométrie du vocabulaire ne tranche pas : une **notice** déposée comme RCP, un RCP
d'un autre produit, un document réglementaire hors périmètre.

Un appel, avec la discipline des trois passes existantes :

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": ["document_type", "matches_requested", "source_evidence", "reason"],
  "properties": {
    "document_type":    { "enum": ["rcp", "notice", "etiquetage", "amm", "autre_reglementaire", "hors_sujet"] },
    "matches_requested": { "type": "boolean" },
    "source_evidence":  { "type": "string" },
    "reason":           { "type": "string" }
  }
}
```

- `document_type` en **enum** : répondre « c'est un RCP » à propos d'un journal devient
  structurellement plus difficile qu'en texte libre.
- `source_evidence` **vérifiée en code** (`verifyEvidence`) : la classification doit désigner un
  passage réel. Sans cela, la porte se contenterait d'une impression.
- Le modèle lit la **pièce** (l'image), jamais le corpus océrisé — protocole à deux canaux inchangé.

Coût : **≈ 0,02 $**, contre ≈ 1,15 $ pour l'upgrade complet. C'est ce rapport de cinquante qui rend
la seconde chance gratuite soutenable.

### Couche 2 — le moteur existant, inchangé

Les 59 appels ne partent que si les couches 0 et 1 sont passées.

---

## 5. La seconde chance

**Le mécanisme financier existe déjà.** [PLAN-CHARIOW §6](PLAN-CHARIOW.md) : *« un crédit se consomme
à la production du livrable, jamais à la création ou au dépôt »*. Une porte qui refuse ne produit
rien, donc ne consomme rien. Il n'y a **pas de remboursement à écrire** — il n'y a pas de débit.

Ce qui manque est la **borne**. La couche 1 coûte un appel IA à chaque tentative, et une porte
gratuite sans limite est un robinet ouvert.

| Règle | Valeur | Pourquoi |
|---|---|---|
| Tentatives refusées par commande | **3** | trois essais suffisent à corriger une erreur de fichier ; au-delà, ce n'est plus une erreur |
| Couche 0 | non comptée | elle ne coûte rien, et refuser sur elle doit rester instantané |
| Au-delà de la borne | la commande reste **ouverte**, le support prend la main | jamais un client bloqué avec un crédit payé et rien en face |

⚠️ La borne compte les **refus**, pas les dépôts : un client qui dépose le bon document du premier
coup n'en consomme aucune.

---

## 6. Ce que le refus doit DIRE

C'est la partie qui décide de l'effet commercial, et elle est aussi importante que la détection.

**À proscrire** — « Document non conforme. » Un refus sans preuve ressemble à une panne, et un
prospect qui teste conclut que nous avons deviné.

**Attendu** — nommer ce qui a été lu :

> Ce document ne correspond pas à un RCP. Nous y avons lu une **notice destinée au patient**
> (« Veuillez lire attentivement cette notice avant d'utiliser ce médicament »), et aucune des
> 29 rubriques du gabarit RCP n'y figure.
>
> Déposez le RCP du produit — cette tentative ne vous a rien coûté.

Trois éléments obligatoires : **ce que c'est**, **la preuve citée du document lui-même**, **ce qu'il
faut faire**. Un laboratoire qui testait repart en ayant vu que nous avons lu son fichier.

---

## 7. Le cas « bon type, mauvais produit » — avertir, jamais refuser

Le contexte certifié du dossier porte le nom du produit. Un RCP d'un AUTRE produit est une erreur
fréquente et coûteuse chez un MAH qui gère des dizaines de dossiers.

⚠️ Mais elle **ne se refuse pas** : un même produit porte des noms commerciaux différents selon le
pays, et un titulaire peut légitimement déposer un RCP de référence sous un autre nom. Refuser ferait
plus de dégâts qu'un avertissement bien placé.

→ **Bandeau d'avertissement avant lancement, décision à l'utilisateur.**

---

## 8. Où la porte vit

**Côté Edge, jamais dans le navigateur.** C'est elle qui autorise la dépense : une porte côté client
se contourne en changeant d'appelant, et la mémoire du projet est explicite — une garantie vit dans
la fonction qui ÉCRIT.

Le navigateur fournit les deux canaux comme pour l'upgrade : la pièce (`filePath`) et le corpus de
contrôle (`text` + `sourceKind`). La porte n'ajoute aucun transport.

---

## 9. Ce qui reste à mesurer avant de figer le seuil

Le seuil de la couche 0 — quelle part des repères du gabarit doit se retrouver — **ne se décide pas
à l'intuition**. Il se calibre sur un jeu réel, et nous l'avons déjà :

| Positifs (doivent passer) | Négatifs (doivent être refusés) |
|---|---|
| RCP Gynoril, KV-Kacin (FR et EN) | Arrêtés et décrets de `RA-source/Vigilance/` |
| Notices KV-Kacin, Super Muscle, Super Relief, Cipro, Clozox H | Guide de bonnes pratiques sénégalais |
| RCP scannés | Barème de redevances, lettre de tarification |

⚠️ **Les négatifs sont le jeu difficile**, pas les positifs : un arrêté sur la pharmacovigilance
partage beaucoup de vocabulaire avec un RCP. C'est là que la couche 1 gagne sa place.

Métrique de recette : **zéro faux accept** sur les négatifs, et **zéro faux refus** sur les positifs.
Si les deux ne peuvent pas tenir ensemble, c'est le seuil de la couche 0 qui bouge — la couche 1
tranchera les cas restants.

---

## 10. Recette

- [ ] Un journal officiel déposé comme RCP est refusé **sans appel IA** (couche 0)
- [ ] Une notice déposée comme RCP est refusée, avec le type réel nommé
- [ ] Un RCP scanné, bruité, incomplet **passe** — recevabilité ≠ qualité
- [ ] Un refus ne consomme **aucun crédit** : `credits_used` inchangé
- [ ] Trois refus consommés → la commande reste ouverte, le support est joignable
- [ ] Le message de refus cite un passage RÉEL du document déposé
- [ ] Un RCP d'un autre produit AVERTIT et laisse lancer
- [ ] La porte vit dans l'Edge : un appel direct au mode rubrique ne la contourne pas
