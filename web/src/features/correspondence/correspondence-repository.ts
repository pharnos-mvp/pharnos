import { recordAudit } from '@/lib/audit'
import {
  db,
  type CorrespondenceMessageRecord,
  type CorrespondenceRecord,
  type ShareLinkRecord,
} from '@/lib/db'
import { enqueueOutbox } from '@/lib/outbox'

const now = () => new Date().toISOString()
const newId = () => crypto.randomUUID()

export interface CreateCorrespondenceInput {
  /** Id imposé (le chemin Storage du PDF le référence AVANT l'insert) ; généré sinon. */
  id?: string
  dossierId: string
  productName: string
  country: string
  activity: string
  senderEmail: string
  recipientEmail: string
  note: string | null
  pdfPath: string
  pdfSize: number
  tokenHash: string
  passwordHash: string | null
  /** Expiration du lien (L1) — null = sans expiration. */
  expiresAt?: string | null
  /** L1 : révocation automatique du lien dès la décision rendue. */
  autoRevokeOnDecision?: boolean
  /** Lien en clair `/r/{token}` — conservé en LOCAL uniquement (jamais synchronisé). */
  shareUrl: string
}

export async function listCorrespondences(orgId: string): Promise<CorrespondenceRecord[]> {
  const items = await db.correspondences.where('orgId').equals(orgId).toArray()
  return items
    .filter((c) => c.deletedAt === null)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export async function listByDossier(dossierId: string): Promise<CorrespondenceRecord[]> {
  const items = await db.correspondences.where('dossierId').equals(dossierId).toArray()
  return items
    .filter((c) => c.deletedAt === null)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export async function getCorrespondence(id: string): Promise<CorrespondenceRecord | undefined> {
  const c = await db.correspondences.get(id)
  return c && c.deletedAt === null ? c : undefined
}

/** Fil chronologique (note d'envoi, décisions, commentaires) d'une correspondance. */
export async function listMessages(
  correspondenceId: string,
): Promise<CorrespondenceMessageRecord[]> {
  return db.correspondenceMessages
    .where('[correspondenceId+createdAt]')
    .between([correspondenceId, ''], [correspondenceId, '￿'])
    .toArray()
}

export async function getShareLink(correspondenceId: string): Promise<ShareLinkRecord | undefined> {
  return db.shareLinks.get(correspondenceId)
}

/**
 * Enregistre l'envoi (après upload réussi du PDF compilé) : correspondance + message `note`
 * éventuel + lien local + outbox. L'état affiché du dossier devient « En review » par
 * dérivation (aucune écriture serveur dans `dossiers`).
 */
export async function createCorrespondence(
  orgId: string,
  input: CreateCorrespondenceInput,
): Promise<CorrespondenceRecord> {
  const ts = now()
  const record: CorrespondenceRecord = {
    id: input.id ?? newId(),
    orgId,
    dossierId: input.dossierId,
    productName: input.productName,
    country: input.country,
    activity: input.activity,
    senderEmail: input.senderEmail,
    recipientEmail: input.recipientEmail,
    note: input.note,
    pdfPath: input.pdfPath,
    pdfSize: input.pdfSize,
    tokenHash: input.tokenHash,
    passwordHash: input.passwordHash,
    status: 'in_review',
    decidedAt: null,
    revokedAt: null,
    expiresAt: input.expiresAt ?? null,
    autoRevokeOnDecision: input.autoRevokeOnDecision ?? false,
    createdAt: ts,
    updatedAt: ts,
    deletedAt: null,
  }
  const note = (input.note ?? '').trim()
  const noteMessage: CorrespondenceMessageRecord | null = note
    ? {
        id: newId(),
        orgId,
        correspondenceId: record.id,
        author: 'sender',
        authorLabel: input.senderEmail,
        kind: 'note',
        decision: null,
        body: note,
        attachments: [],
        createdAt: ts,
      }
    : null

  await db.transaction(
    'rw',
    db.correspondences,
    db.correspondenceMessages,
    db.shareLinks,
    db.outbox,
    async () => {
      await db.correspondences.add(record)
      await enqueueOutbox('correspondence', record.id, 'create', record)
      if (noteMessage) {
        await db.correspondenceMessages.add(noteMessage)
        await enqueueOutbox('correspondence_message', noteMessage.id, 'create', noteMessage)
      }
      await db.shareLinks.put({ id: record.id, url: input.shareUrl, createdAt: ts })
    },
  )
  await recordAudit(orgId, 'correspondence', record.id, 'create', input.productName)
  return record
}

/** Réponse du labo dans le fil (offline-first : Dexie + outbox, poussée à la reconnexion). */
export async function appendSenderMessage(
  correspondence: CorrespondenceRecord,
  authorLabel: string,
  body: string,
): Promise<CorrespondenceMessageRecord | null> {
  const text = body.trim()
  if (!text) return null
  const message: CorrespondenceMessageRecord = {
    id: newId(),
    orgId: correspondence.orgId,
    correspondenceId: correspondence.id,
    author: 'sender',
    authorLabel,
    kind: 'comment',
    decision: null,
    body: text,
    attachments: [],
    createdAt: now(),
  }
  await db.transaction('rw', db.correspondenceMessages, db.outbox, async () => {
    await db.correspondenceMessages.add(message)
    await enqueueOutbox('correspondence_message', message.id, 'create', message)
  })
  return message
}

/**
 * Remplace le PDF d'un envoi existant (dossier recompilé) : le reviewer garde le MÊME lien et
 * tout le fil — l'Edge resigne `pdf_path` à chaque ouverture, il verra la nouvelle version.
 * Mutation PARTIELLE côté serveur (pdf_path/pdf_size/updated_at) : n'écrase jamais une décision
 * concurrente. Un message « note » système trace la mise à jour dans le fil (append-only).
 */
export async function updateCorrespondencePdf(
  correspondence: CorrespondenceRecord,
  authorLabel: string,
  pdfPath: string,
  pdfSize: number,
): Promise<void> {
  const ts = now()
  const message: CorrespondenceMessageRecord = {
    id: newId(),
    orgId: correspondence.orgId,
    correspondenceId: correspondence.id,
    author: 'sender',
    authorLabel,
    kind: 'note',
    decision: null,
    body: 'Dossier mis à jour — une nouvelle version du document est disponible.',
    attachments: [],
    createdAt: ts,
  }
  await db.transaction('rw', db.correspondences, db.correspondenceMessages, db.outbox, async () => {
    await db.correspondences.put({ ...correspondence, pdfPath, pdfSize, updatedAt: ts })
    await enqueueOutbox('correspondence', correspondence.id, 'update', {
      id: correspondence.id,
      pdfPath,
      pdfSize,
      updatedAt: ts,
    })
    await db.correspondenceMessages.add(message)
    await enqueueOutbox('correspondence_message', message.id, 'create', message)
  })
  await recordAudit(
    correspondence.orgId,
    'correspondence',
    correspondence.id,
    'update',
    correspondence.productName,
  )
}

/**
 * Révoque le lien de partage : l'Edge `share` répond 410 dès la prochaine requête du reviewer.
 * Mutation PARTIELLE côté serveur (revoked_at/updated_at seulement) pour ne jamais écraser une
 * décision concurrente — voir `pushCorrespondences`.
 */
export async function revokeCorrespondence(id: string): Promise<void> {
  const existing = await db.correspondences.get(id)
  if (!existing || existing.deletedAt !== null || existing.revokedAt !== null) return
  const ts = now()
  await db.transaction('rw', db.correspondences, db.outbox, async () => {
    await db.correspondences.put({ ...existing, revokedAt: ts, updatedAt: ts })
    await enqueueOutbox('correspondence', id, 'update', { id, revokedAt: ts, updatedAt: ts })
  })
  await recordAudit(existing.orgId, 'correspondence', id, 'update', existing.productName)
}
