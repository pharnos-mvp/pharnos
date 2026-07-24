# PLAN — Le référentiel d'organisations comme colonne vertébrale documentaire

> Cadrage CEO 2026-07-24 (recette fiche org). Statut : **EN COURS — P1 + P2 + P3 LIVRÉS
> (2026-07-24), prochaine étape P4.** Audité sur pièces (2 audits code/DB/RLS, faits cités
> dans les sections).

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
| **Pièces administratives** | **contrat seulement** (amendement CEO) | ✅ tout sauf AMM (GMP, ML, FSC, COPP, COA, contrat) | ✅ tout sauf AMM | ✅ (contrats/mandats) |

Le périmètre des pièces admin par rôle = `adminDocTypesForPartyRoles(roles)` (union pour les rôles
cumulés) : `titulaire → {contract}` · `fabricant/agent → tout sauf amm`.

**Wizard de création** (sessions dérivées des rôles — union pour les rôles cumulés) :
- MAH pur : I-Identification · II-Documents d'information · III-Pièces admin (contrat) · IV-AMM
- Fabricant pur : I-Identification · II-Pièces administratives
- MAH + Fabricant : I · II-Docs d'info · III-Pièces admin (tout) · IV-AMM
- Agence locale : I-Identification · II-Pièces administratives (mandats/contrats)

**Fiche org** (onglets, même dérivation) :
- MAH pur : Identification · Marque · Produits · AMM · Pièces admin (**contrat seulement**) ·
  Documents d'information · Justificatifs
- Fabricant pur : Identification · Pièces admin · Justificatifs (inchangé)
- MAH + Fabricant : tous les onglets (Pièces admin = tout sauf AMM)
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
| **P1** ✅ | Matrice métier §1 : sessions/onglets par rôle, retrait « Titulaire » (contexte org), carte « MAH + Fabricant » — **LIVRÉ 2026-07-24 (#408)** | S (front-only) | 0 |
| **P2** ✅ | Réutilisation §2 + §3 — **LIVRÉ 2026-07-24 (#409 pioche · #410 upload fiche org)** : `source_doc_id` (0070, prod), `documents-reuse` (`copyDocumentToProduct`, mapping sources §2), pickers « Depuis la base / Depuis mon poste » wizard + fiche produit (`SourceDocPicker` partagé, dédoublonnage), `DocAddForm` extrait + `OrgDocAddButton` (onglets AMM/admin/info + `OrgPiecePage`). Pièges : garde d'ordonnancement FK auto-référente au push (outbox non ordonnée → 2ᵉ passe bornée) ; RLS insert vérifiée (org_id éditable + RESTRICTIVE CS1). Différé : requêtes party-scopées si `documents` grossit ; garde serveur `party.org_id = document.org_id` (belt-and-braces) | M | 0070 ✅ |
| **P3** ✅ | Agences en correspondance — **LIVRÉ 2026-07-24 (#412)** : ShareDialog = sélecteur des parties rôle `agent` (préremplit l'e-mail), « ＋ Nouvelle agence » inline (collision de nom annoncée : fusion, aucun doublon), capture « base vivante » best-effort APRÈS l'envoi (fill-the-gap `contactEmail`, relecture fraîche, jamais d'écrasement). L'e-mail reste LA clé d'identité des fils (aucun `party_id` persisté). `NativeSelect` promu `components/ui`. Prérequis embarqué : #411 (advisories du jour — postcss 8.5.23 + migration `react-router-dom`→`react-router` 8.3.0) | S–M | 0 ✅ |
| **P4** | Autorités versionnées + God dashboard — **mockup livré 2026-07-24 (`docs/mockups/autorites-versionnees.html`, 3 écrans), design §6 EN ATTENTE DE VALIDATION CEO** | L | oui |
| **P5** (post-GO-LIVE) | Lien membre↔partie (`memberships.party_id`) + rôles avancés | M | oui |

Chaque phase = 1 à 2 PR, revue `code-reviewer` systématique, CI job-par-job, migration appliquée
et vérifiée en prod AVANT le merge du code qui la consomme.

**Prochaine migration libre : 0071.**

---

## 6) P4 — Design « Autorités versionnées + God dashboard » (mockup 2026-07-24, à valider)

Mockup : **`docs/mockups/autorites-versionnees.html`** — 3 écrans (deep-links `#s1/#s2/#s3/#consent`) :
① fiche Autorité versionnée/adaptable (bannière de mise à jour, provenance par champ, badges
« Adapté », dialog de consentement sourcé avec diff avant/après) ; ② console admin onglet
**Référentiel** (versions, éditeur de brouillon avec provenance OBLIGATOIRE, aperçu de notification,
adoption par org) ; ③ dossier **épinglé** sur sa version (bannière bascule volontaire + journal).

Principes (briefing SaaS 2026-07-24, session « Erreur de notification ») : contenu ≠ code ·
versions à date d'effet (modèle MedDRA) · dossiers existants épinglés, nouveaux sur la dernière
version adoptée · adoption = consentement par org, journalisé, source citée (n° décret, JO) ·
les overrides locaux survivent (« la donnée officielle se propose, la donnée locale se respecte »).

**Modèle de données cible (esquisse, migrations 0071+)** :
- `ref_versions` (GLOBAL, hors tenant) : `label` (v2026.2), `status` draft/published/archived,
  `published_at`, `effective_date`, `release_note`. Écriture god-only (service role via Edge,
  comme les autres surfaces god) ; lecture = tout utilisateur authentifié.
- `ref_entries` : `version_id`, `country`, `section` (agency/fees/submission/samples),
  `payload jsonb`, `provenance jsonb` (type de texte, n°, date, JO, pdf). Lecture effective =
  fusion des versions ≤ version adoptée (dernier écrivain par `(country, section)`).
- `org_ref_adoptions` (tenant, RLS org) : `org_id`, `version_id`, `adopted_at`, `adopted_by` —
  le journal DE FAIT du consentement.
- `org_ref_overrides` (tenant, RLS org) : `org_id`, `country`, `field_path`, `value`,
  `updated_by/At` — jamais écrasé par une publication ; conflit SIGNALÉ si une version publiée
  touche le même `field_path`.
- `dossiers.ref_version_id` : épinglé à la création (dernière version adoptée) ; bascule =
  action explicite + événement de journal.
- **Résolution de lecture : override org → version adoptée org → socle code** (`roadmap-data.ts`
  reste le seed + repli offline-first ; réplication Dexie du contenu adopté).

**Découpage proposé (1 PR chacune)** : P4.1 socle versionné + seed v1 depuis le code + fiche
Autorité branchée provenance (zéro changement de comportement) → P4.2 adoption/notification +
épinglage dossiers → P4.3 overrides org + conflits → P4.4 God dashboard Référentiel (éditeur,
publication, adoption). NB : les montants « avant » du diff mockup sont ILLUSTRATIFS.

**Décisions CEO en attente** : (a) valider les 3 écrans ; (b) qui adopte pour l'org (proposition :
admin seul) ; (c) champs adaptables en v1 (proposition : destinataire/adresse/contacts + notes
internes ; montants officiels NON adaptables) ; (d) bascule de dossier dès P4.2 ou différée.
