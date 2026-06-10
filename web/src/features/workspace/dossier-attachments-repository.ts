import { recordAudit } from '@/lib/audit'
import { db, type DossierAttachmentRecord } from '@/lib/db'
import { enqueueOutbox } from '@/lib/outbox'

const now = () => new Date().toISOString()
const newId = () => crypto.randomUUID()

/** Plafond de taille d'une pièce jointe téléversée. */
export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024 // 25 Mo

/** Pièces jointes actives d'un dossier. */
export async function listAttachments(dossierId: string): Promise<DossierAttachmentRecord[]> {
  const items = await db.dossierAttachments.where('dossierId').equals(dossierId).toArray()
  return items
    .filter((a) => a.deletedAt === null)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

/** Téléverse une pièce jointe sur un nœud : blob local (offline) + métadonnées + outbox upload. */
export async function addAttachment(
  orgId: string,
  dossierId: string,
  nodeNumber: string,
  file: File,
): Promise<DossierAttachmentRecord> {
  const ts = now()
  const id = newId()
  const record: DossierAttachmentRecord = {
    id,
    orgId,
    dossierId,
    nodeNumber,
    fileName: file.name,
    mimeType: file.type || 'application/octet-stream',
    size: file.size,
    filePath: null,
    uploaded: false,
    createdAt: ts,
    updatedAt: ts,
    deletedAt: null,
  }
  await db.transaction('rw', db.dossierAttachments, db.documentBlobs, db.outbox, async () => {
    await db.dossierAttachments.add(record)
    await db.documentBlobs.add({ id, blob: file })
    await enqueueOutbox('dossier_attachment', id, 'create', { id })
  })
  await recordAudit(orgId, 'dossier_attachment', id, 'create', record.fileName)
  return record
}

export async function deleteAttachment(id: string): Promise<void> {
  const existing = await db.dossierAttachments.get(id)
  if (!existing || existing.deletedAt !== null) return
  const ts = now()
  await db.transaction('rw', db.dossierAttachments, db.documentBlobs, db.outbox, async () => {
    await db.dossierAttachments.put({ ...existing, deletedAt: ts, updatedAt: ts })
    await db.documentBlobs.delete(id) // libère l'espace IndexedDB (fichiers potentiellement lourds)
    await enqueueOutbox('dossier_attachment', id, 'delete', { id })
  })
  await recordAudit(existing.orgId, 'dossier_attachment', id, 'delete', existing.fileName)
}

/** Blob local d'une pièce jointe (prévisualisation / téléchargement hors-ligne). */
export async function getAttachmentBlob(id: string): Promise<Blob | undefined> {
  return (await db.documentBlobs.get(id))?.blob
}

/** Épingle le blob d'une pièce jointe en local (offline-first) — après un téléchargement réseau. */
export async function cacheAttachmentBlob(id: string, blob: Blob): Promise<void> {
  await db.documentBlobs.put({ id, blob })
}
