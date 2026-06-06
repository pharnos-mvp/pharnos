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
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

const db = new Dexie('pharnos') as Dexie & {
  products: EntityTable<ProductRecord, 'id'>
  outbox: EntityTable<OutboxItem, 'id'>
  documents: EntityTable<DocumentRecord, 'id'>
  documentBlobs: EntityTable<DocumentBlob, 'id'>
  dossiers: EntityTable<DossierRecord, 'id'>
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

export { db }
