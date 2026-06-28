import { recordAudit } from '@/lib/audit'
import { db, type DocumentCategory, type DocumentRecord } from '@/lib/db'
import {
  isAllowedUpload,
  MAX_UPLOAD_BYTES,
  sanitizeFileName,
  UPLOAD_SIZE_ERROR,
  UPLOAD_TYPE_ERROR,
} from '@/lib/files'
import { enqueueOutbox } from '@/lib/outbox'

const now = () => new Date().toISOString()
const newId = () => crypto.randomUUID()

export interface AddDocumentInput {
  category: DocumentCategory
  docType: string
  file: File
  language?: string | null
  expiryDate?: string | null
  /** AMM : date d'émission (octroi) + N° d'AMM. */
  issueDate?: string | null
  reference?: string | null
  /** Métadonnées pièce admin (wizard) : titulaire figurant sur la pièce · pays (AMM) · N° de lot (COA). */
  holder?: string | null
  country?: string | null
  batchNumber?: string | null
}

/** Documents actifs d'un produit (optionnellement filtrés par catégorie). */
export async function listDocuments(
  productId: string,
  category?: DocumentCategory,
): Promise<DocumentRecord[]> {
  const items = await db.documents.where('productId').equals(productId).toArray()
  return items
    .filter((d) => d.deletedAt === null && (!category || d.category === category))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

/**
 * Doc AMM actif le plus récent d'un produit (pièce administrative `amm`) — source du N° d'AMM et de
 * la date d'octroi synchronisés vers le CTD builder pour les opérations Renouvellement / Variation.
 */
export async function getAmmDocument(productId: string): Promise<DocumentRecord | undefined> {
  const docs = await listDocuments(productId, 'admin')
  return docs.find((d) => d.docType === 'amm')
}

/** Ajoute un document : blob stocké en local (offline) + métadonnées + outbox pour upload. */
export async function addDocument(
  orgId: string,
  productId: string,
  input: AddDocumentInput,
): Promise<DocumentRecord> {
  if (!isAllowedUpload(input.file)) throw new Error(UPLOAD_TYPE_ERROR)
  if (input.file.size > MAX_UPLOAD_BYTES) throw new Error(UPLOAD_SIZE_ERROR)
  const ts = now()
  const id = newId()
  const record: DocumentRecord = {
    id,
    orgId,
    productId,
    category: input.category,
    docType: input.docType,
    fileName: sanitizeFileName(input.file.name),
    mimeType: input.file.type || 'application/octet-stream',
    size: input.file.size,
    language: input.language ?? null,
    expiryDate: input.expiryDate ?? null,
    issueDate: input.issueDate ?? null,
    reference: input.reference ?? null,
    holder: input.holder ?? null,
    country: input.country ?? null,
    batchNumber: input.batchNumber ?? null,
    status: 'active',
    filePath: null,
    uploaded: false,
    createdAt: ts,
    updatedAt: ts,
    deletedAt: null,
  }
  await db.transaction('rw', db.documents, db.documentBlobs, db.outbox, async () => {
    await db.documents.add(record)
    await db.documentBlobs.add({ id, blob: input.file })
    await enqueueOutbox('document', id, 'create', { id })
  })
  await recordAudit(orgId, 'document', id, 'create', record.fileName)
  return record
}

export async function deleteDocument(id: string): Promise<void> {
  const existing = await db.documents.get(id)
  if (!existing || existing.deletedAt !== null) return
  const ts = now()
  await db.transaction('rw', db.documents, db.outbox, async () => {
    await db.documents.update(id, { deletedAt: ts, updatedAt: ts })
    await enqueueOutbox('document', id, 'delete', { id })
  })
  await recordAudit(existing.orgId, 'document', id, 'delete', existing.fileName)
}

/** Blob local d'un document (pour prévisualisation / téléchargement hors-ligne). */
export async function getDocumentBlob(id: string): Promise<Blob | undefined> {
  return (await db.documentBlobs.get(id))?.blob
}

/**
 * Épingle le blob d'un document en local (offline-first). Appelé après un téléchargement réseau
 * (sync/aperçu/compilation) pour qu'un document tiré du serveur soit ensuite disponible hors-ligne.
 */
export async function cacheDocumentBlob(id: string, blob: Blob): Promise<void> {
  await db.documentBlobs.put({ id, blob })
}
