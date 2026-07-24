import { recordAudit } from '@/lib/audit'
import { db, type DocumentCategory, type DocumentRecord } from '@/lib/db'
import {
  isAllowedUpload,
  MAX_UPLOAD_BYTES,
  sanitizeFileName,
  UPLOAD_SIZE_ERROR,
  UPLOAD_TYPE_ERROR,
} from '@/lib/files'
import { tStatic } from '@/lib/i18n-context'
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
  /** Provenance « pioché depuis la base » (0070) : id du document org-scopé copié vers ce produit. */
  sourceDocId?: string | null
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
export function addDocument(
  orgId: string,
  productId: string,
  input: AddDocumentInput,
): Promise<DocumentRecord> {
  return addOwnedDocument(orgId, { productId }, input)
}

/**
 * Document rattaché à une ORGANISATION (fiche d'ajout org, sessions II/III — migration 0069) :
 * mêmes règles (blob local + outbox), propriétaire = la partie au lieu d'un produit.
 */
export function addPartyDocument(
  orgId: string,
  partyId: string,
  input: AddDocumentInput,
): Promise<DocumentRecord> {
  return addOwnedDocument(orgId, { partyId }, input)
}

async function addOwnedDocument(
  orgId: string,
  owner: { productId?: string; partyId?: string },
  input: AddDocumentInput,
): Promise<DocumentRecord> {
  if (!isAllowedUpload(input.file)) throw new Error(tStatic(UPLOAD_TYPE_ERROR))
  if (input.file.size > MAX_UPLOAD_BYTES) throw new Error(tStatic(UPLOAD_SIZE_ERROR))
  const ts = now()
  const id = newId()
  const record: DocumentRecord = {
    id,
    orgId,
    // `productId` reste la clé d'index Dexie (chaîne vide pour un doc org-scopé).
    productId: owner.productId ?? '',
    partyId: owner.partyId ?? null,
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
    sourceDocId: input.sourceDocId ?? null,
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

/**
 * Corrige les DATES d'une pièce (délivrance / expiration) — la seule métadonnée révisable après
 * coup : une date se corrige, un fichier se remplace. Offline-first : Dexie + outbox `update`.
 * Le push documents est op-agnostique (il `upsert` la ligne locale relue par id), donc la
 * correction remonte telle quelle au prochain cycle, y compris saisie hors-ligne.
 */
export async function updateDocumentDates(
  id: string,
  patch: { issueDate: string | null; expiryDate: string | null; country?: string | null },
): Promise<void> {
  const existing = await db.documents.get(id)
  if (!existing || existing.deletedAt !== null) return
  const ts = now()
  await db.transaction('rw', db.documents, db.outbox, async () => {
    // `country` n'est écrit QUE s'il est fourni (édition d'une AMM) → un autre type de pièce n'est
    // jamais touché sur ce champ.
    await db.documents.update(id, {
      issueDate: patch.issueDate,
      expiryDate: patch.expiryDate,
      updatedAt: ts,
      ...(patch.country !== undefined ? { country: patch.country } : {}),
    })
    await enqueueOutbox('document', id, 'update', { id })
  })
  await recordAudit(existing.orgId, 'document', id, 'update', existing.fileName)
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
