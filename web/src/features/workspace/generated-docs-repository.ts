import type { JSONContent } from '@tiptap/core'

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
}
