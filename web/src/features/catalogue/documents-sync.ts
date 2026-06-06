import type { SupabaseClient } from '@supabase/supabase-js'

import { db, type DocumentCategory, type DocumentRecord } from '@/lib/db'
import { getSupabase } from '@/lib/supabase'
import { getDocumentBlob } from './documents-repository'

const BUCKET = 'documents'
const lastPullKey = (orgId: string) => `pharnos.lastPull.documents.${orgId}`
let syncing = false

export interface DocumentRow {
  id: string
  org_id: string
  product_id: string
  category: string
  doc_type: string
  file_path: string | null
  language: string | null
  expiry_date: string | null
  status: string
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export function documentToRow(d: DocumentRecord): DocumentRow {
  return {
    id: d.id,
    org_id: d.orgId,
    product_id: d.productId,
    category: d.category,
    doc_type: d.docType,
    file_path: d.filePath,
    language: d.language,
    expiry_date: d.expiryDate,
    status: d.status,
    created_at: d.createdAt,
    updated_at: d.updatedAt,
    deleted_at: d.deletedAt,
  }
}

/** Reconstruit un DocumentRecord depuis une ligne serveur (fileName dérivé du chemin Storage). */
export function rowToDocument(r: DocumentRow): DocumentRecord {
  const fileName = r.file_path?.split('/').pop() ?? 'document'
  return {
    id: r.id,
    orgId: r.org_id,
    productId: r.product_id,
    category: r.category as DocumentCategory,
    docType: r.doc_type,
    fileName,
    mimeType: '',
    size: 0,
    language: r.language,
    expiryDate: r.expiry_date,
    status: r.status,
    filePath: r.file_path,
    uploaded: true,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    deletedAt: r.deleted_at,
  }
}

/** Réconcilie les documents : upload des blobs en attente + upsert métadonnées, puis pull. */
export async function syncDocuments(orgId: string): Promise<void> {
  if (syncing || !navigator.onLine) return
  const supabase = await getSupabase()
  if (!supabase) return
  syncing = true
  try {
    await pushDocuments(supabase, orgId)
    await pullDocuments(supabase, orgId)
  } catch (error) {
    console.warn('[sync] documents :', error)
  } finally {
    syncing = false
  }
}

async function pushDocuments(supabase: SupabaseClient, orgId: string): Promise<void> {
  const items = await db.outbox.where('entity').equals('document').toArray()
  if (items.length === 0) return

  const ids = [...new Set(items.map((i) => i.entityId))]
  for (const id of ids) {
    const rec = await db.documents.get(id)
    if (!rec || rec.orgId !== orgId) continue

    // Upload du blob si pas encore fait (et document non supprimé).
    if (!rec.uploaded && rec.deletedAt === null) {
      const blob = await getDocumentBlob(id)
      if (blob) {
        const path = `${rec.orgId}/${rec.productId}/${rec.id}/${rec.fileName}`
        const { error: upErr } = await supabase.storage
          .from(BUCKET)
          .upload(path, blob, { upsert: true, contentType: rec.mimeType || undefined })
        if (upErr) throw upErr
        await db.documents.update(id, { filePath: path, uploaded: true })
        rec.filePath = path
        rec.uploaded = true
      }
    }

    const { error } = await supabase.from('documents').upsert(documentToRow(rec))
    if (error) throw error
  }
  await db.outbox.bulkDelete(items.map((i) => i.id))
}

async function pullDocuments(supabase: SupabaseClient, orgId: string): Promise<void> {
  const since = localStorage.getItem(lastPullKey(orgId)) ?? '1970-01-01T00:00:00.000Z'
  const { data, error } = await supabase
    .from('documents')
    .select('*')
    .eq('org_id', orgId)
    .gt('updated_at', since)
    .order('updated_at', { ascending: true })
  if (error) throw error

  const rows = (data ?? []) as unknown as DocumentRow[]
  let maxUpdated = since
  for (const row of rows) {
    const incoming = rowToDocument(row)
    const local = await db.documents.get(incoming.id)
    // Strictement plus récent → on évite d'écraser les métadonnées locales riches (taille, mime, blob).
    if (!local || incoming.updatedAt > local.updatedAt) {
      await db.documents.put(incoming)
    }
    if (incoming.updatedAt > maxUpdated) maxUpdated = incoming.updatedAt
  }
  if (rows.length > 0) localStorage.setItem(lastPullKey(orgId), maxUpdated)
}

/** URL signée (courte durée) pour télécharger un document depuis Storage. */
export async function getDocumentDownloadUrl(filePath: string): Promise<string | null> {
  const supabase = await getSupabase()
  if (!supabase) return null
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(filePath, 300)
  if (error) return null
  return data.signedUrl
}
