import type { JSONContent } from '@tiptap/core'

import { recordAudit } from '@/lib/audit'
import { db, type GeneratedDocRecord } from '@/lib/db'
import { enqueueOutbox } from '@/lib/outbox'
import { TEMPLATES, type TemplateContext, type TemplateKey } from './templates'

const now = () => new Date().toISOString()
const newId = () => crypto.randomUUID()

export async function listGeneratedDocs(dossierId: string): Promise<GeneratedDocRecord[]> {
  const items = await db.generatedDocs.where('dossierId').equals(dossierId).toArray()
  return items
    .filter((d) => d.deletedAt === null)
    .sort((a, b) => a.nodeNumber.localeCompare(b.nodeNumber))
}

export interface CreateGeneratedDocInput {
  dossierId: string
  nodeNumber: string
  templateKey: TemplateKey
  context: TemplateContext
}

export async function createGeneratedDoc(
  orgId: string,
  input: CreateGeneratedDocInput,
): Promise<GeneratedDocRecord> {
  const tpl = TEMPLATES[input.templateKey]
  const ts = now()
  const record: GeneratedDocRecord = {
    id: newId(),
    orgId,
    dossierId: input.dossierId,
    nodeNumber: input.nodeNumber,
    templateKey: input.templateKey,
    title: tpl.title,
    content: tpl.build(input.context),
    status: 'draft',
    createdAt: ts,
    updatedAt: ts,
    deletedAt: null,
  }
  await db.transaction('rw', db.generatedDocs, db.outbox, async () => {
    await db.generatedDocs.add(record)
    await enqueueOutbox('generated_doc', record.id, 'create', record)
  })
  await recordAudit(orgId, 'generated_doc', record.id, 'create', record.title)
  return record
}

export interface CreateTranslationInput {
  dossierId: string
  nodeNumber: string
  /** Document produit source traduit. */
  sourceDocId: string
  title: string
  content: JSONContent
}

/**
 * Crée une traduction d'une pièce comme **document généré** propre au dossier : éditable (menu de
 * format), sauvegardé, inclus dans le PDF compilé. Ne remplace PAS le document produit original
 * (conformité face au pays cible, pour ce montage uniquement).
 */
export async function createTranslationDoc(
  orgId: string,
  input: CreateTranslationInput,
): Promise<GeneratedDocRecord> {
  const ts = now()
  const record: GeneratedDocRecord = {
    id: newId(),
    orgId,
    dossierId: input.dossierId,
    nodeNumber: input.nodeNumber,
    templateKey: 'translation',
    sourceDocId: input.sourceDocId,
    title: input.title,
    content: input.content,
    status: 'draft',
    createdAt: ts,
    updatedAt: ts,
    deletedAt: null,
  }
  await db.transaction('rw', db.generatedDocs, db.outbox, async () => {
    await db.generatedDocs.add(record)
    await enqueueOutbox('generated_doc', record.id, 'create', record)
  })
  await recordAudit(orgId, 'generated_doc', record.id, 'create', record.title)
  return record
}

export interface CreateUpgradeInput {
  dossierId: string
  nodeNumber: string
  /** Source mise en conformité : pièce uploadée OU document généré (traduction). */
  sourceDocId: string
  title: string
  content: JSONContent
}

/**
 * Crée la VERSION CONFORME d'un document (Regafy Upgrade) comme document généré propre au
 * dossier : éditable, à relire (les rubriques marquées [NON FOURNI…] sont à compléter par
 * l'utilisateur). Ne remplace JAMAIS le document original.
 */
export async function createUpgradeDoc(
  orgId: string,
  input: CreateUpgradeInput,
): Promise<GeneratedDocRecord> {
  const ts = now()
  const record: GeneratedDocRecord = {
    id: newId(),
    orgId,
    dossierId: input.dossierId,
    nodeNumber: input.nodeNumber,
    templateKey: 'upgrade',
    sourceDocId: input.sourceDocId,
    title: input.title,
    content: input.content,
    status: 'draft',
    createdAt: ts,
    updatedAt: ts,
    deletedAt: null,
  }
  await db.transaction('rw', db.generatedDocs, db.outbox, async () => {
    await db.generatedDocs.add(record)
    await enqueueOutbox('generated_doc', record.id, 'create', record)
  })
  await recordAudit(orgId, 'generated_doc', record.id, 'create', record.title)
  return record
}

/** Persiste le contenu édité (débouncé côté UI). */
export async function updateGeneratedDocContent(id: string, content: JSONContent): Promise<void> {
  const existing = await db.generatedDocs.get(id)
  if (!existing || existing.deletedAt !== null) return
  const updated: GeneratedDocRecord = { ...existing, content, updatedAt: now() }
  await db.transaction('rw', db.generatedDocs, db.outbox, async () => {
    await db.generatedDocs.put(updated)
    await enqueueOutbox('generated_doc', id, 'update', updated)
  })
}

/** Régénère le contenu depuis le template (écrase les éditions). Renvoie le nouveau contenu. */
export async function regenerateGeneratedDoc(
  id: string,
  context: TemplateContext,
): Promise<JSONContent | undefined> {
  const existing = await db.generatedDocs.get(id)
  if (!existing || existing.deletedAt !== null) return undefined
  const tpl = TEMPLATES[existing.templateKey as TemplateKey]
  if (!tpl) return undefined
  const content = tpl.build(context)
  const updated: GeneratedDocRecord = { ...existing, content, updatedAt: now() }
  await db.transaction('rw', db.generatedDocs, db.outbox, async () => {
    await db.generatedDocs.put(updated)
    await enqueueOutbox('generated_doc', id, 'update', updated)
  })
  await recordAudit(existing.orgId, 'generated_doc', id, 'update', existing.title)
  return content
}

export async function deleteGeneratedDoc(id: string): Promise<void> {
  const existing = await db.generatedDocs.get(id)
  if (!existing || existing.deletedAt !== null) return
  const ts = now()
  await db.transaction('rw', db.generatedDocs, db.outbox, async () => {
    await db.generatedDocs.put({ ...existing, deletedAt: ts, updatedAt: ts })
    await enqueueOutbox('generated_doc', id, 'delete', { id })
  })
  await recordAudit(existing.orgId, 'generated_doc', id, 'delete', existing.title)
}
