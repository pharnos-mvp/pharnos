import Dexie, { type EntityTable } from 'dexie'

import type { CtdNodeDef, DossierFormat } from '@/features/workspace/module1-tree'

/**
 * Base locale (IndexedDB) — socle offline-first.
 *
 * Tables noyau + `outbox` (file des mutations à pousser au serveur à la reconnexion — pattern
 * outbox, résolution server-authoritative). Les blobs de documents sont stockés localement
 * (`documentBlobs`) pour la disponibilité hors-ligne. Étendu au fil des milestones.
 */

export interface ProductRecord {
  id: string
  orgId: string
  nomCommercial: string
  dci: string
  dosage: string
  forme: string
  presentation: string
  classeTherapeutique: string
  codeAtc: string
  /** Nom du titulaire / demandeur d'AMM. */
  titulaire: string
  /** Adresse du titulaire / demandeur d'AMM (couverture du dossier). */
  titulaireAdresse?: string
  /** Nom du fabricant. */
  fabricant: string
  /** Adresse du fabricant (couverture du dossier). */
  fabricantAdresse?: string
  /**
   * Lien vers l'organisation (`parties`) titulaire d'AMM — dérivé du free-text `titulaire` à
   * l'enregistrement (M4, « 0 ressaisie »). Optionnel : le free-text reste la source de vérité
   * pendant la transition (LOCAL-ONLY tant que la migration `0045` n'est pas posée).
   */
  titulaireId?: string | null
  /** Lien vers l'organisation (`parties`) fabricant — dérivé du free-text `fabricant`. */
  fabricantId?: string | null
  createdAt: string
  updatedAt: string
  /** Soft delete : conservé pour la réconciliation de synchro. `null` = actif. */
  deletedAt: string | null
}

/** Rôles cumulables d'une organisation (réalité RA + IDMP) — cf. migration `0045`. */
export type PartyRole = 'titulaire' | 'fabricant' | 'distributeur'

/**
 * Organisation du référentiel RIM (table `parties`) — Titulaire d'AMM / Fabricant / Distributeur,
 * rôles cumulables. UNE entité par organisation réelle (pas une par type) : le moat « OS
 * réglementaire » IDMP-ready. Dérivée du free-text produit à l'enregistrement (M4) — id
 * DÉTERMINISTE (org + nom normalisé) → dédup naturelle serveur/multi-appareil, zéro doublon.
 */
export interface PartyRecord {
  id: string
  orgId: string
  nom: string
  roles: PartyRole[]
  pays: string
  adresse: string
  /** N° de certificat GMP (rôle fabricant). */
  gmpCertificat: string
  /** Échéance GMP (yyyy-mm-dd) suivie par Monitor ; null sinon. */
  gmpExpiry: string | null
  createdAt: string
  updatedAt: string
  /** Soft delete : conservé pour la réconciliation de synchro. `null` = actif. */
  deletedAt: string | null
}

export type OutboxOp = 'create' | 'update' | 'delete'

export interface OutboxItem {
  id: string
  entity: string
  entityId: string
  op: OutboxOp
  payload: unknown
  createdAt: string
}

export type DocumentCategory = 'info' | 'admin'

export interface DocumentRecord {
  id: string
  orgId: string
  productId: string
  category: DocumentCategory
  /** Type issu d'un vocabulaire contrôlé (eCTD-ready). */
  docType: string
  fileName: string
  mimeType: string
  size: number
  /** Langue BCP-47 (ex. 'fr', 'en') ou null. */
  language: string | null
  /** Date de validité (yyyy-mm-dd) — pièces administratives ; null sinon. */
  expiryDate: string | null
  /** Date d'émission / d'octroi (yyyy-mm-dd) — AMM : date où l'AMM a été accordée. Optionnel (additif). */
  issueDate?: string | null
  /** Référence / N° officiel de la pièce (ex. N° d'AMM « AMM_2015_7457 »). Optionnel (additif). */
  reference?: string | null
  /**
   * Métadonnées de pièce administrative (wizard création). LOCAL-ONLY tant que la migration `0044`
   * n'est pas posée : `documentToRow` (sync) ne les pousse pas encore → aucune casse synchro.
   * `holder` = titulaire figurant sur la pièce · `country` = pays (AMM) · `batchNumber` = N° de lot (COA).
   */
  holder?: string | null
  country?: string | null
  batchNumber?: string | null
  status: string
  /** Chemin Storage une fois le blob téléversé ; null tant que local-only. */
  filePath: string | null
  /** Vrai quand le blob est présent côté Storage (téléversé). */
  uploaded: boolean
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

export interface DocumentBlob {
  id: string
  blob: Blob
}

export interface DossierRecord {
  id: string
  orgId: string
  productId: string
  /** Nom commercial dénormalisé (affichage rapide hors-ligne). */
  productName: string
  /** Format réglementaire : 'ectd' (ECOWAS) ou 'ctd' (UEMOA papier/PDF). */
  format: DossierFormat
  /** Activité réglementaire (code), ex. 'new_ma'. */
  activity: string
  /** Pays cible (code ISO), ex. 'CI'. */
  country: string
  status: string
  /** Arborescence Module 1 **propre au dossier** (éditable par l'utilisateur). */
  tree: CtdNodeDef[]
  /** Documents produit (catalogue) exclus de CE dossier (retirés du workspace, conservés au produit). */
  excludedDocIds: string[]
  /**
   * Variations cochées (n° Annexe N°2) pour un dossier d'opération « variation » — pilotent
   * l'arbre Module 1 taillé, la lettre de variation et le tableau comparatif. Optionnel
   * (additif, rétro-compat : les dossiers non-variation n'ont pas le champ).
   */
  variations?: number[]
  /** Items du tableau comparatif (VariationItem[] sérialisé) — édités au nœud 1.4.1. */
  variationItems?: unknown
  /** N° de l'AMM existante (variation / renouvellement) — réf. de la lettre + méta du tableau. */
  ammNumero?: string
  /** Date d'octroi (émission) de l'AMM existante (renouvellement / variation) — réf. lettre + RCP §9. */
  ammDate?: string
  createdAt: string
  updatedAt: string
  deletedAt: string | null
  /**
   * Archivage (rétention réglementaire GxP) d'un dossier SOUMIS — distinct de `deletedAt`.
   * `deletedAt` = brouillon retiré (corbeille, purgeable) ; `archivedAt` = dossier soumis
   * conservé (jamais purgé). Optionnel : les enregistrements antérieurs n'ont pas le champ.
   */
  archivedAt?: string | null
  /**
   * Numéro d'opération canonique « OP-{opYear}-{opNumber sur 4} » attribué CÔTÉ SERVEUR à la 1re
   * synchro (séquentiel, unique par org+année — migration 0046). Null tant que le dossier n'a pas
   * été synchronisé (brouillon local) → l'UI affiche « n° en attente ». Le client ne les envoie
   * jamais (omis du push) : seul le trigger serveur les attribue.
   */
  opYear?: number | null
  opNumber?: number | null
}

/**
 * Document **généré** depuis un template en vigueur (lettre Cover, attestation PGHT, formulaire…),
 * rattaché à un nœud de l'arborescence d'un dossier et éditable in-place (M3).
 * Le contenu est stocké au format ProseMirror/TipTap (JSON) — éditable, traduisible, compilable PDF.
 */
export interface GeneratedDocRecord {
  id: string
  orgId: string
  dossierId: string
  /** Numéro de nœud cible dans l'arborescence Module 1 (ex. '1.1.1'). */
  nodeNumber: string
  /** Clé du template source (ex. 'cover', 'pght') ; 'translation' pour une traduction de pièce. */
  templateKey: string
  /** Traduction : id du document produit source (lien vers l'original). Propre au dossier. */
  sourceDocId?: string
  title: string
  /** Contenu éditable au format ProseMirror/TipTap (JSON). */
  content: unknown
  status: string
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

/**
 * Réglages « Profil pro » (M3.1) — images réutilisables appliquées aux documents générés.
 * `kind: 'orgBranding'` = papier à en-tête + pied de page (partagés par l'organisation) ;
 * `kind: 'userSignature'` = signature de l'utilisateur. Images stockées en **data URL**
 * (petites, disponibles hors-ligne, exportables directement, pas de Storage à gérer).
 */
export interface ProSettingRecord {
  id: string
  orgId: string
  kind: 'orgBranding' | 'userSignature'
  /** Nom de l'entreprise (orgBranding) — infos professionnelles partagées. */
  entreprise: string | null
  /** Poste / fonction (orgBranding). */
  poste: string | null
  /** Nom et prénom(s) du signataire (orgBranding) — bloc signature des lettres. */
  signataire: string | null
  /** Pays (orgBranding). */
  pays: string | null
  /** Data URL de l'en-tête (orgBranding). */
  headerImage: string | null
  /** Data URL du pied de page (orgBranding). */
  footerImage: string | null
  /** Data URL du petit logo (orgBranding) — bandeau d'en-tête du dossier compilé. */
  logoImage: string | null
  /** Data URL de la signature (userSignature). */
  signatureImage: string | null
  updatedAt: string
  deletedAt: string | null
}

/**
 * Pièce jointe **téléversée directement sur un nœud** d'un dossier (M3.1) — coexiste avec les
 * documents générés et les pièces produit auto-classées. Blob local (offline) + Storage.
 */
export interface DossierAttachmentRecord {
  id: string
  orgId: string
  dossierId: string
  nodeNumber: string
  fileName: string
  mimeType: string
  size: number
  filePath: string | null
  uploaded: boolean
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

/**
 * Journal d'audit (ALCOA++ / intégrité des données) — qui a fait quoi et quand.
 * **Append-only** : on ajoute, on ne modifie ni ne supprime jamais une entrée.
 */
export interface AuditLogRecord {
  id: string
  orgId: string
  actorId: string
  actorEmail: string
  /** Entité : 'product' | 'document' | 'dossier' | 'generated_doc' | 'dossier_attachment'. */
  entity: string
  entityId: string
  /** 'create' | 'update' | 'delete'. */
  action: string
  /** Libellé lisible de la ressource (nom produit, fichier…). */
  label: string
  at: string
}

/** Statuts d'une correspondance — la décision du reviewer fait foi (jalon H). */
export type CorrespondenceStatus = 'in_review' | 'accepted' | 'suspended' | 'rejected'

/** Décision rendue par le reviewer (jamais `in_review` : c'est l'état d'attente, pas un acte). */
export type CorrespondenceDecision = Exclude<CorrespondenceStatus, 'in_review'>

/**
 * Correspondance (jalon H) : envoi du Module 1 compilé à un correspondant externe (agence locale)
 * via un lien tokenisé. Le token en clair n'est JAMAIS stocké côté serveur (seulement son SHA-256) ;
 * le lien complet est conservé en local chez l'expéditeur (`shareLinks`, non synchronisé).
 */
export interface CorrespondenceRecord {
  id: string
  orgId: string
  dossierId: string
  /** Dénormalisés (affichage hors-ligne + page publique sans jointures). */
  productName: string
  country: string
  activity: string
  senderEmail: string
  recipientEmail: string
  note: string | null
  /** PDF compilé dans le bucket privé `documents` ({orgId}/shares/{id}/…). */
  pdfPath: string
  pdfSize: number
  /** SHA-256 hex du token de partage. */
  tokenHash: string
  /** 'pbkdf2$iter$salt$hash' ou null = lien libre. */
  passwordHash: string | null
  status: CorrespondenceStatus
  decidedAt: string | null
  revokedAt: string | null
  /** Expiration du lien (L1) — null = sans expiration. */
  expiresAt: string | null
  /** L1 : le lien se révoque automatiquement dès que le reviewer rend sa décision. */
  autoRevokeOnDecision: boolean
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

/**
 * Message du fil de correspondance — append-only (ALCOA). `author: 'sender'` = labo,
 * `'recipient'` = reviewer externe (écrit via l'Edge `share` en service-role).
 */
export interface CorrespondenceMessageRecord {
  id: string
  orgId: string
  correspondenceId: string
  author: 'sender' | 'recipient'
  /** Libellé affiché (e-mail), figé à l'écriture. */
  authorLabel: string
  /** 'note' (message d'envoi) | 'decision' (Accepter/Suspendre/Rejeter) | 'comment' (chat). */
  kind: 'note' | 'decision' | 'comment'
  decision: CorrespondenceDecision | null
  body: string
  /** Pièces jointes du reviewer [{path,name,size,mime}] — blobs dans Storage. */
  attachments: { path: string; name: string; size: number; mime: string }[]
  createdAt: string
}

/**
 * Lien de partage en clair — **local uniquement** (jamais synchronisé) : seul l'expéditeur
 * peut ré-afficher/copier son lien ; côté serveur seul le hash existe.
 */
export interface ShareLinkRecord {
  /** correspondenceId. */
  id: string
  url: string
  createdAt: string
}

/**
 * Marqueur de lecture d'une conversation — **local uniquement** (préférence d'appareil,
 * comme la barre latérale) : messages du reviewer postérieurs à `lastSeenAt` = non lus.
 */
export interface CorrespondenceReadRecord {
  /** correspondenceId. */
  id: string
  lastSeenAt: string
}

/**
 * Cache d'analyse IA par document (ÉCO) — l'extraction Gemini (chère : lecture du PDF) n'est faite
 * qu'**une seule fois** par document ; les constats sont mémorisés et réutilisés tant que le document
 * ne change pas (`sig`). Un même produit soumis à plusieurs pays ne re-lit pas ses documents.
 */
export interface DocAnalysisRecord {
  /** Id du document analysé (clé). */
  docId: string
  /** Signature du contenu (updatedAt) — invalide le cache si le document change/est remplacé. */
  sig: string
  /** Constats IA figés pour ce document (validité/langue/produit) — JSON RegafyFinding[]. */
  findings: unknown
  analyzedAt: string
}

export interface SavedTemplateRecord {
  id: string
  orgId: string
  /** Type de template officiel : 'rcp' | 'notice' | 'labeling'. */
  docType: string
  /** Nom donné au modèle (défaut : dénomination du produit saisie). */
  title: string
  /** Métadonnées produit pour la carte (dérivées de la saisie). */
  productName?: string
  dci?: string
  /** Langue d'édition du modèle. */
  lang: 'fr' | 'en'
  /** État du formulaire rempli (TemplateFormState sérialisé) — saisie indépendante de la langue. */
  state: unknown
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

/**
 * Demande de variation (Module 1) — local-first, org-scoped. Une demande = un produit/AMM + une
 * LISTE d'items de changement (multi-variation), d'où dérivent la lettre, le tableau comparatif,
 * la checklist de pièces (union) et la redevance (× items). Cf. `variation-catalog` (Annexe N°2,
 * Règlement 04/2020 UEMOA). `fields`/`items` typés `unknown` (cast dans le repo) — mirror `savedTemplates`.
 */
export interface VariationRequestRecord {
  id: string
  orgId: string
  title: string
  /** Dénormalisés pour les cartes « Mes demandes ». */
  productName?: string
  country: string
  /** Sujet de la demande (LetterFields sérialisé). */
  fields: unknown
  /** Items de changement (VariationItem[] sérialisé). */
  items: unknown
  /** Index (0–6) de la condition de regroupement (GROUPING_RULES) ; null si item unique. */
  groupingRuleIndex: number | null
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

const db = new Dexie('pharnos') as Dexie & {
  products: EntityTable<ProductRecord, 'id'>
  parties: EntityTable<PartyRecord, 'id'>
  outbox: EntityTable<OutboxItem, 'id'>
  documents: EntityTable<DocumentRecord, 'id'>
  documentBlobs: EntityTable<DocumentBlob, 'id'>
  dossiers: EntityTable<DossierRecord, 'id'>
  generatedDocs: EntityTable<GeneratedDocRecord, 'id'>
  proSettings: EntityTable<ProSettingRecord, 'id'>
  dossierAttachments: EntityTable<DossierAttachmentRecord, 'id'>
  auditLog: EntityTable<AuditLogRecord, 'id'>
  docAnalysis: EntityTable<DocAnalysisRecord, 'docId'>
  correspondences: EntityTable<CorrespondenceRecord, 'id'>
  correspondenceMessages: EntityTable<CorrespondenceMessageRecord, 'id'>
  shareLinks: EntityTable<ShareLinkRecord, 'id'>
  correspondenceReads: EntityTable<CorrespondenceReadRecord, 'id'>
  savedTemplates: EntityTable<SavedTemplateRecord, 'id'>
  variationRequests: EntityTable<VariationRequestRecord, 'id'>
}

db.version(1).stores({
  products: 'id, orgId, updatedAt',
  outbox: 'id, entity, createdAt',
})

// v2 : index additionnels pour tri/recherche et filtrage soft-delete du Catalogue (M1).
db.version(2).stores({
  products: 'id, orgId, updatedAt, nomCommercial, deletedAt',
})

// v3 : documents (métadonnées) + blobs locaux (offline).
db.version(3).stores({
  documents: 'id, orgId, productId, category, updatedAt, deletedAt',
  documentBlobs: 'id',
})

// v4 : dossiers CTD/eCTD (CTD Workspace, M2).
db.version(4).stores({
  dossiers: 'id, orgId, productId, updatedAt, deletedAt',
})

// v5 : documents générés depuis templates (lettres Cover/PGHT, formulaires) — M3.
db.version(5).stores({
  generatedDocs: 'id, orgId, dossierId, [dossierId+nodeNumber], updatedAt, deletedAt',
})

// v6 : profil pro (en-tête/pied/signature) + pièces jointes par nœud — M3.1.
db.version(6).stores({
  proSettings: 'id, orgId, kind, updatedAt, deletedAt',
  dossierAttachments: 'id, orgId, dossierId, [dossierId+nodeNumber], updatedAt, deletedAt',
})

// v7 : journal d'audit (ALCOA++) — append-only.
db.version(7).stores({
  auditLog: 'id, orgId, at',
})

// v8 : cache d'analyse IA par document (éco — ne ré-analyse pas les documents inchangés).
db.version(8).stores({
  docAnalysis: 'docId, analyzedAt',
})

// v9 : correspondance (jalon H) — envois tokenisés + fil append-only + liens locaux (non sync).
db.version(9).stores({
  correspondences: 'id, orgId, dossierId, updatedAt, deletedAt',
  correspondenceMessages: 'id, orgId, correspondenceId, [correspondenceId+createdAt], createdAt',
  shareLinks: 'id',
})

// v10 : marqueurs de lecture des conversations (non-lus, local uniquement) — Correspondance v2.
db.version(10).stores({
  correspondenceReads: 'id',
})

// v11 : modèles de templates enregistrés (Bibliothèque RIM, local-first) — « Mes modèles ».
db.version(11).stores({
  savedTemplates: 'id, orgId, docType, updatedAt, deletedAt',
})

// v12 : store « demandes de variation ». L'UI builder autonome a été RETIRÉE (flux intégré Workspace
// + Bibliothèque) ; le store reste DÉCLARÉ — ne jamais retirer une version Dexie déjà servie à une
// base locale (sinon VersionError à l'ouverture). Réutilisable si un flux le repeuple.
db.version(12).stores({
  variationRequests: 'id, orgId, updatedAt, deletedAt',
})

// v13 : organisations RIM (`parties`) — référentiel maître Titulaire/Fabricant/Distributeur (M3).
db.version(13).stores({
  parties: 'id, orgId, updatedAt, nom, deletedAt',
})

export { db }
