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
| **P4** | Autorités versionnées + God dashboard — mockup + design §6 **VALIDÉS CEO 2026-07-24** ; **P4.1 (#414), P4.2 (#415), P4.4-pré (#416) et P4.4 (#417) LIVRÉS** ; reste P4.3 overrides · P4.5 structure CTD | L | 0071→0076 ✅ |
| **P5** (post-GO-LIVE) | Lien membre↔partie (`memberships.party_id`) + rôles avancés | M | oui |

Chaque phase = 1 à 2 PR, revue `code-reviewer` systématique, CI job-par-job, migration appliquée
et vérifiée en prod AVANT le merge du code qui la consomme.

**Prochaine migration libre : 0077.**

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

**Découpage proposé (1 PR chacune)** : **P4.1 ✅ (PR #414, 2026-07-25)** socle versionné
(migration `0071` : `ref_versions`/`ref_entries`, RLS select-authentifié publié-seul, zéro write
client, pgTAP `ref_versions_rls`) + seed `v2026.1` GÉNÉRÉ depuis le code (`ref-seed.ts` +
test de parité) + réplique Dexie v16 pull-only (throttle 15 min, pull borné/paginé, HORS chaîne
`syncCatalogue` — jamais devant un push ni dans le flush de déconnexion) + résolveur
`ref-content.ts` (publié-seul **et à date d'effet atteinte**, payloads normalisés — un contenu
malformé retombe sur le socle code, sections inconnues ignorées) + fiche Autorité (badge version,
lignes « Source : … ») → **P4.2 ✅ (2026-07-25)** adoption/notification + épinglage dossiers →
**P4.4-pré ✅ (#416)** consommateurs au résolveur → **P4.4 ✅ (2026-07-25)** God dashboard →
P4.3 overrides org + conflits (reste). NB : les montants « avant » du diff mockup sont ILLUSTRATIFS.

**P4.4 livré (PR #417 — Edge `admin` v8 déployée + migrations `0075`+`0076` appliquées prod
avant merge)** :
- **Onglet « Référentiel » de la console god** (mockup écran 2) : KPIs (version publiée, adoption
  x/y orgs actives, brouillon, dossiers sur une version antérieure), liste des versions + **suivi
  d'adoption par organisation** (qui, quand), **éditeur de brouillon** par (pays, section) —
  agency/fees(+notes bilingues)/submission/samples — **préremplis depuis le CONTENU RÉSOLU
  COURANT** (`admin_ref_overview.current`, repli socle ; préremplir du socle quand v2 est publiée
  aurait ANNULÉ v2 en silence à la publication suivante — revue M2), **provenance OBLIGATOIRE**
  par entrée (et JAMAIS reprise de la version précédente par inertie), publication et suppression
  de brouillon avec confirmation. Logique pure extraite en `ref-draft.ts` (tests aller-retour
  préremplissage↔payload 8 pays × 4 sections, `eslint react-refresh` interdit d'exporter des
  fonctions depuis un fichier composant).
- **Edge `admin` actions `ref_*`** (double barrière : gate `is_platform_admin` + service-role,
  seul chemin d'écriture de 0071) : `ref_overview` · `ref_entries` · `ref_save_draft` ·
  `ref_publish` · `ref_delete_draft` (brouillons seuls ; 0 ligne = 404 honnête, jamais un faux
  succès). `ctd_structure` volontairement ABSENTE de l'éditeur (publier une section que rien ne
  rend = piège) — P4.5.
- **Durcissements revue #417 (DO NOT SHIP → corrigés avant merge)** :
  - **B1 — rétro-datation INTERDITE à la publication** : le rang d'applicabilité =
    `coalesce(effective_date, published_at, created_at)` → publier « le décret de 2025 » avec
    `effective_date` 2025 aurait classé la version SOUS le socle : inerte (jamais servie), et
    pire, appliquée SANS consentement pour les sections hors socle. Règle : la date d'effet d'une
    publication ne peut précéder aucune version DÉJÀ applicable (les versions à effet futur ne
    bornent pas) ; **la date du décret se cite dans la PROVENANCE, pas en date d'effet** (UI :
    `min=today` + hint ; Edge : 409 `effective_date_backdated`).
  - **RPC transactionnelles 0076** : `admin_ref_save_draft` (verrou `for update`, brouillon seul —
    fin de la fenêtre où un publish concurrent laissait muter une PUBLIÉE, et du brouillon vidé
    par un insert en échec) ; `admin_ref_overview` (agrégats SQL bornés + « latest » + contenu
    résolu par (pays, section) — fin des selects nus tronqués à `max_rows` en silence et de la
    règle d'applicabilité dupliquée-fausse) ; `auto_adopt_latest_ref` re-créée avec bloc
    `exception` (« bookkeeping jamais bloquant » : une org naît TOUJOURS).
  - `ref_publish` : re-vérifie provenance ET efficacité de payload (`refPayloadEffective`, miroir
    strict des normalisateurs client — une « version publiée qui ne rend rien » = le piège
    ctd_structure) AU MOMENT de publier ; acteur sans org = 409 (pattern set_plan_limits) ; échec
    d'audit LOGGÉ ; update conditionnel `status='draft'` avec `.select()` (un concurrent ne crée
    jamais un faux succès).
  - UI : erreurs Edge mappées en messages actionnables (`AdminApiError.code` lu dans le CORPS de
    la réponse, pattern dossier-purge) ; doublons (pays, section) refusés à l'enregistrement et
    évités à l'« Ajouter » (premier couple libre) ; montants saisis mais illisibles REFUSÉS
    (sinon omis en silence du payload) ; civilité inconnue → repli socle ; provenance saisie
    survit au changement de pays/section.
- **Auto-adoption à la création d'org** (0075, trigger `orgs_auto_adopt_ref`) : une org NEUVE naît
  sur la dernière version publiée applicable (état initial tracé à l'audit — pas un consentement
  contourné : aucun état antérieur à protéger) ; couvre create_org/onboarding et tout futur chemin
  sans dupliquer les RPC 0063 ; pgTAP `ref_auto_adopt` (jamais une version future ni un brouillon ;
  UPDATE d'une org existante ne ré-adopte rien) + isolation positive côté B (1 ligne exactement).

**P4.2 livré (migrations `0072` + `0073`, appliquées prod avant merge)** :
- **Consentement** : `org_ref_adoptions` (journal append-only, RLS lecture membres + RESTRICTIVE
  CS1, **zéro policy d'écriture**) + RPC `adopt_ref_version` (security definer : **admin d'org
  seul**, refuse un brouillon, audite dans la même transaction) — pgTAP `org_ref_adoptions_rls`
  (12 assertions).
- **Résolution au PLAFOND adopté** : sans aucune adoption, plafond = **version socle** → une org
  ne voit jamais son contenu changer sans consentement ; adopter la plus récente prend les
  intermédiaires. Isolation par org vérifiée.
- **Notification** : bannière ciblée par pays (fiche Autorité) / globale (liste), dialog de
  consentement avec diff avant/après + sources citées + garanties, et ligne « Référentiel à
  adopter » dans la **cloche + Alertes du Dashboard** (`ActionKind: 'ref_update'`, un seul item
  quel que soit le nombre de versions en attente).
- **Épinglage** : `dossiers.ref_version_id` posé à la création (version appliquée par l'org) ; la
  **Roadmap lit le barème de la version épinglée** (fin de la divergence M7 sur ce chemin) ;
  bannière « épinglé sur vX » + **bascule volontaire** confirmée sur un diff limité au pays du
  dossier, idempotente, tracée à l'audit (« référentiel vX → vY »).
- **Découpage de modules imposé par le budget** : `ref-state` (versions/adoptions, SANS contenu —
  chargé par l'entrée pour la cloche) · `ref-content` (résolveur + socle bilingue) · `ref-diff`
  (dialogs). Sans ce découpage, la cloche tirait tout `roadmap-data` dans le bundle d'entrée
  (**+5,9 Ko gzip mesurés, budget à 98,7 %**) ; après, +0,4 Ko.
- **Écart assumé vs mockup écran 3** : la bascule est tracée dans le **journal d'audit** (org), pas
  dans la timeline du dossier — le vocabulaire `lifecycle_events` est verrouillé (ADR-0004) et
  alimente la **vue agent externe tokenisée** : y publier un événement de configuration serait une
  décision d'exposition à part entière. À arbitrer (migration d'un type `ref_version_switched`) si
  le CEO veut la ligne dans le parcours du dossier.
- Suite naturelle : auto-adoption de la dernière version à la **création d'une org** (sinon une org
  neuve démarre sur le socle et doit adopter) — à traiter avec P4.4.

**Durcissements de revue (#415, migration `0074`)** — deux bloquants et quatre majeurs corrigés
avant merge, tous *dormants aujourd'hui* mais armés dès que le God dashboard publiera :
- **Socle EXPLICITE (`ref_versions.is_baseline`)** : le plafond était inféré (« la plus ancienne
  version de la réplique ») → archiver le socle faisait glisser le plafond sur une version JAMAIS
  adoptée, sans signal (`pending` vide). Aucun socle lisible ⇒ repli socle CODE, jamais un tiers.
- **TTL de pull PAR ORG** : la clé était globale alors que le pull embarque les adoptions → un
  membre multi-orgs (cas nominal CS1) changeant d'org dans les 15 min calculait son plafond sur les
  adoptions de l'org précédente **et épinglait ses nouveaux dossiers sur la mauvaise version**
  (valeur poussée au serveur, durable).
- **Épinglage borné au plafond** + **trigger serveur `dossiers_ref_version_guard`** (null / socle /
  adoptée) : `ref_version_id` est écrivable par un éditeur non-admin (PostgREST) — sans borne, il
  se servait le barème d'une version non consentie, contournant le gate « admin seul ».
- **Backfill des 137 dossiers de prod** (+ bump `updated_at`, sinon le pull incrémental ne le voit
  jamais — leçon 0060) : sans lui, la promesse « vos dossiers existants restent épinglés » affichée
  dans le dialog de consentement était FAUSSE pour tout le parc.
- **FK `on delete restrict`** (une version référencée s'archive, ne se supprime pas), état
  « version épinglée introuvable » affiché au lieu d'un silence, RPC durci (org active + membre non
  scopé, `p_org` obligatoire), cap + alerte sur le pull d'adoptions, tri d'applicabilité
  déterministe (plus de `v2026.10 < v2026.9`), stub de test indexé par table (faux-vert prouvé),
  cloche muette pour un membre scopé, bascule réservée aux rôles éditeurs.

**⚠ GARDE-FOU P4.1→P4.4 (revue #414, M7) — LEVÉ par P4.4-pré (#416)** : lettres
(`buildLetterContext` + Workspace/Bibliothèque/variation), aperçu dossier, wizard de création,
boîte de réception (lignes + recherche) et LISTE des autorités passent par le résolveur (bloc
agence à CLÉ `pays|version` — un bloc périmé d'un autre pays est rejeté, jamais servi ; patch
agence partiel fusionné champ par champ avec le socle). **Inventaire code-only ASSUMÉ** (documenté
sur place) : `PublicParcoursTab` (page publique tokenisée sans session), `submission-language`
(langue officielle seule), `use-regafy-copilot` (nom d'agence en contexte IA — la LANGUE cible,
elle, descend résolue de la page), `recipient-lang` (contrat avec le cron Edge, e-mails de relance
seulement), `lifecycleConfigFor` (à traiter en P4.5). Le test de parité `ref-seed.test.ts` reste le
verrou tant que `roadmap-data.ts` sert de socle/seed.

**Décisions CEO — VALIDÉES 2026-07-24** : (a) les 3 écrans ✅ go build ; (b) adoption = **admin
seul** (consentement d'organisation, journalisé) ; (c) adaptables v1 = **contacts/destinataire/
adresse + notes internes — montants officiels NON adaptables** ; (d) bascule de dossier **dès
P4.2** (épinglage + bascule volontaire tracée ensemble).

**Mises à jour STRUCTURELLES (composition du Module 1) — question CEO 2026-07-24
(ex. « le PGHT n'est plus exigé au Togo ») :**
1. La structure devient une **section du même référentiel versionné** : `ref_entries` section
   `ctd_structure`, payload = **deltas de nœuds par pays+activité** (`{ node: '1.1.2',
   op: 'remove' | 'add' | 'optional', label?, source }`) — même provenance, même publication,
   même consentement que les barèmes. `getModule1Tree(...)` gagne le paramètre pays + version
   adoptée et applique l'overlay À LA CRÉATION du dossier.
2. **Les dossiers existants sont déjà protégés** : l'arbre est FIGÉ à la création (invariant
   existant) — une mise à jour structurelle ne mute jamais un dossier, même après adoption.
3. **Migration volontaire** : le mécanisme `isTreeOutdated`/`mergeDefaultTree` existant (bannière
   « la composition a évolué » + fusion explicite) devient **version-aware** — c'est la bascule
   de l'écran 3, appliquée à la structure. ⚠ invariant connu : toujours passer
   `getModule1Tree(format, activity, variations, …)` complet.
4. **Règle de sécurité des données : un retrait ne supprime JAMAIS un nœud rempli.** Nœud non
   exigé + documents présents → marqué « non exigé (vX) », jamais effacé ; retiré seulement s'il
   est vide. (Le PGHT du Togo disparaîtrait des NOUVEAUX dossiers ; dans un dossier existant
   fusionné, il resterait visible tant qu'une lettre PGHT y est montée.)
Implémentation : slice dédiée **P4.5** (après P4.4) — la machinerie d'arbre est délicate ; le
modèle de données (section `ctd_structure`) est réservé dès la 0071.
