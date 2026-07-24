# PLAN — Le référentiel d'organisations comme colonne vertébrale documentaire

> Cadrage CEO 2026-07-24 (recette fiche org). Statut : **PROPOSÉ — à valider avant dev.**
> Audité sur pièces (2 audits code/DB/RLS, faits cités dans les sections concernées).

## 0) Vision — pourquoi ce chantier est structurant

L'utilisateur construit, org par org, une **base documentaire vivante** (AMM, RCP, COA, GMP…
rattachés à `documents.party_id`, migration 0069). Ce référentiel doit alimenter — sans ressaisie —
la création de produit, la fiche produit et le CTD Builder. C'est le même principe que le branding
par MAH : **l'organisation est la source, le produit/dossier consomme.**

Règle d'architecture qui gouverne tout le plan :
- **Le RÔLE de l'org pilote les AFFORDANCES** (quels onglets/sessions/uploads sont proposés) ;
- **le MODÈLE DE DONNÉES reste agnostique au rôle** (un document est typé par `docType` canonique,
  possédé par `productId` XOR `partyId`). Zéro migration pour les règles du §1.

---

## 1) Matrice métier par rôle (fiche org + wizard) — décision CEO

Contenus **org-scopés** (documents propres de l'organisation) :

| Contenu | MAH pur | Fabricant pur | MAH + Fabricant | Agence locale |
|---|---|---|---|---|
| **AMM** | ✅ | ❌ | ✅ | ❌ |
| **Documents d'information** (RCP, notice, étiquetage…) | ✅ | ❌ | ✅ | ❌ |
| **Pièces administratives** (GMP, ML, FSC, COPP, **COA**, **contrat titulaire-fabricant**) | ❌ | ✅ | ✅ | ✅ (contrats/mandats) |

**Wizard de création** (sessions dérivées des rôles — union pour les rôles cumulés) :
- MAH pur : I-Identification · II-Documents d'information · III-AMM
- Fabricant pur : I-Identification · II-Pièces administratives
- MAH + Fabricant : I · II-Docs d'info · III-Pièces admin · IV-AMM
- Agence locale : I-Identification · II-Pièces administratives (mandats/contrats)

**Fiche org** (onglets, même dérivation) :
- MAH pur : Identification · Marque · Produits · AMM · Documents d'information · Justificatifs
  (l'onglet Pièces admin **disparaît**)
- Fabricant pur : Identification · Pièces admin · Justificatifs (inchangé)
- MAH + Fabricant : tous les onglets
- Agence locale : Identification · Pièces admin · Justificatifs

**Champ « Titulaire » des pièces admin : SUPPRIMÉ en contexte org** (on est déjà chez le
propriétaire). Fait d'audit : `documents.holder` est **écrit partout, lu nulle part** (aucune
consommation aval — ni lettres, ni CTD, ni Monitor, ni affichage). On le masque en contexte org
(prop de `DocTypeCards`) ; le contexte produit le garde à titre informatif (dette notée : champ
mort à trancher plus tard — recâbler ou retirer).

**Réponse au « comment gérer MAH+Fabricant proprement » (1c)** : rien à changer en base —
`parties.roles text[]` cumule déjà ; les onglets/sessions sont l'**union** des règles de chaque
rôle ; les documents restent classés par `docType` canonique (`categoryForDocType`), donc aucun
document ne change de nature quand une org cumule les rôles. Le picker de type gagne une carte
**« MAH + Fabricant »** (`roles: ['titulaire','fabricant']`) — le gate MAH s'applique (c'est un MAH).

---

## 2) « Piocher depuis la base » — création/fiche produit & CTD Builder

**Décision d'architecture : COPIE LIÉE AVEC PROVENANCE** (pas une référence croisée).

- Un « + RCP » (session II) ou « + COA » (session III) propose **deux chemins** dès que la partie
  sélectionnée possède des docs de ce type : **« Depuis la base de ‹org› »** (picker filtré par
  docType) ou **« Depuis mon poste »** (upload, comme aujourd'hui).
- Piocher = créer un **nouveau document produit-scopé** : blob **copié** (download+re-upload
  intra-org — couvert par les policies Storage existantes, vérifié : seul le 1ᵉʳ segment
  `org_id` est contrôlé) + métadonnées héritées (dates, pays, référence…) + **`source_doc_id`**
  (migration 0070, additive) pour la provenance.
- Sources par type : docs d'info + AMM → base du **MAH** sélectionné ; pièces admin → base du
  **fabricant** (les deux si rôles cumulés).

**Pourquoi la copie et pas la référence** :
1. **Le dossier est une photographie opposable** (même philosophie que l'épinglage des dossiers
   sur les mises à jour réglementaires) : un renouvellement dans la base org ne doit pas muter
   silencieusement un dossier déposé.
2. Le CTD Builder monte automatiquement toute row `documents` du produit via `NODE_BY_DOCTYPE`
   (mapping type→nœud existant, vérifié) → **zéro câblage CTD supplémentaire**.
3. Les sémantiques de suppression/purge restent simples (pas de blob partagé entre scopes).
4. `source_doc_id` ouvre l'affordance future « une version plus récente existe dans la base —
   mettre à jour ? » (post-MVP).

Préexistant réutilisé : `addOwnedDocument` (déjà factorisé produit/party), `getDocumentBlob` /
`downloadDocumentBlob`, le pattern `sourceDocId` des docs générés (référence, 0014).

## 3) Upload sur la fiche org finale

Les onglets/pages dédiées de la fiche org gagnent un bouton **« Ajouter »** (selon la matrice §1)
→ `addPartyDocument` (existant). Tout document déposé là entre immédiatement dans la base et
devient « piochable » (§2) — la boucle est fermée : fiche org ⇄ produits ⇄ CTD.

---

## 4) Membres & rôles utilisateurs — verdict de compatibilité (audité)

**Bonne nouvelle : l'essentiel existe déjà.**
- **6 rôles membres** (enum `org_role`, 0001+0027) : Administrateur, Éditeur (`ra_officer`),
  Lecteur (`reviewer`), **Agence Locale**, **Agence de représentation**, **Expert RA** — tous
  proposés dans l'UI d'invitation. « Directeur » = mappe sur Administrateur ou Lecteur (pas de
  nouvel enum nécessaire).
- **Le partage confidentiel demandé = CS1 (0048), déjà en prod** : inviter une agence puis la
  **scoper à des dossiers précis** → RLS RESTRICTIVE vérifiée table par table : un membre scopé
  ne lit **ni** `parties`, **ni** `documents` (y compris org-scopés 0069), **ni** `pro_settings`,
  **ni** `products` ; il ne voit que la couche SUIVI de SES dossiers. Le catalogue est aussi
  bloqué côté client (`SCOPED_ALLOWED_ROUTES`).
- **Conclusion sécurité : les nouvelles features (docs org, branding party) ne fuient PAS vers
  les membres scopés.** Aucun correctif RLS requis.

**Écart identifié (choix d'architecture à venir, PAS bloquant)** : aucun lien n'existe entre un
**membre** (personne) et une **partie** (org du catalogue). Proposition post-GO-LIVE (CS1 phase 2) :
`memberships.party_id` nullable (additif) pour rattacher un membre-agence à sa fiche Agence locale
(auto-branding de correspondance, reporting par agence). À ne PAS faire avant le lancement.

---

## 5) Trajectoire (ordre proposé)

Contexte global : la ligne directrice reste **GO-LIVE** (LOT 13 recette finale · LOT 14) ;
Regafy = fil séparé (`PLAN-REGAFY.md`) ; diagnostic Module 1 = en conception. Les phases
ci-dessous sont des features post-pilotes qui ne bloquent pas le gate.

| Phase | Contenu | Taille | Migration |
|---|---|---|---|
| **P1** | Matrice métier §1 : sessions/onglets par rôle, retrait « Titulaire » (contexte org), carte « MAH + Fabricant » | S (front-only) | 0 |
| **P2** | Réutilisation §2 + §3 : `source_doc_id` (0070), `copyDocumentToProduct`, pickers wizard/fiche produit, upload fiche org | M | 0070 |
| **P3** | Agences en correspondance : destinataire choisi/créé depuis les Agences locales | S–M | 0 |
| **P4** | Autorités versionnées + God dashboard (design/mockup d'abord — briefing SaaS déjà donné : contenu versionné, provenance, overrides respectés, dossiers épinglés, consentement par org) | L | oui |
| **P5** (post-GO-LIVE) | Lien membre↔partie (`memberships.party_id`) + rôles avancés | M | oui |

Chaque phase = 1 à 2 PR, revue `code-reviewer` systématique, CI job-par-job, migration appliquée
et vérifiée en prod AVANT le merge du code qui la consomme.

**Prochaine migration libre : 0070.**
