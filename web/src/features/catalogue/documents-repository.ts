import { recordAudit } from '@/lib/audit'
import { db, type DocumentCategory, type DocumentRecord } from '@/lib/db'
import { enqueueOutbox } from '@/lib/outbox'

const now = () => new Date().toISOString()
const newId = () => crypto.randomUUID()

export interface AddDocumentInput {
  category: DocumentCategory
  docType: string
  file: File
  language?: string | null
  expiryDate?: string | null
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

/** Ajoute un document : blob stocké en local (offline) + métadonnées + outbox pour upload. */
export async function addDocument(
  orgId: string,
  productId: string,
  input: AddDocumentInput,
): Promise<DocumentRecord> {
  const ts = now()
  const id = newId()
  const record: DocumentRecord = {
    id,
    orgId,
    productId,
    category: input.category,
    docType: input.docType,
    fileName: input.file.name,
    mimeType: input.file.type || 'application/octet-stream',
    size: input.file.size,
    language: input.language ?? null,
    expiryDate: input.expiryDate ?? null,
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
