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
  createdAt: string
  updatedAt: string
  deletedAt: string | null
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

const db = new Dexie('pharnos') as Dexie & {
  products: EntityTable<ProductRecord, 'id'>
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

export { db }
