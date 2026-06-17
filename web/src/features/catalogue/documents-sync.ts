import type { SupabaseClient } from '@supabase/supabase-js'

import { db, type DocumentCategory, type DocumentRecord } from '@/lib/db'
import { isPermanentSyncError, withRetry } from '@/lib/retry'
import { isSyncEnabled } from '@/lib/sync-prefs'
import { reportError } from '@/lib/sentry'
import { contentTypeFor, sanitizeFileName } from '@/lib/files'
import { getSupabase } from '@/lib/supabase'
import { cacheDocumentBlob, getDocumentBlob } from './documents-repository'

const BUCKET = 'documents'
const lastPullKey = (orgId: string) => `pharnos.lastPull.documents.${orgId}`
let syncing = false
let pinning = false

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
  if (syncing || !navigator.onLine || !isSyncEnabled(orgId)) return
  const supabase = await getSupabase()
  if (!supabase) return
  syncing = true
  try {
    // Retry borné (transitoires only) : une microcoupure ne repousse pas la sync au prochain déclencheur.
    await withRetry(() => pushDocuments(supabase, orgId))
    await withRetry(() => pullDocuments(supabase, orgId))
  } catch (error) {
    console.warn('[sync] documents :', error)
    reportError(error, { op: 'sync', entity: 'documents' })
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
        // sanitize au build du chemin : couvre aussi les enregistrements Dexie antérieurs à T5.
        const path = `${rec.orgId}/${rec.productId}/${rec.id}/${sanitizeFileName(rec.fileName)}`
        const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, blob, {
          upsert: true,
          contentType: contentTypeFor({ name: rec.fileName, type: rec.mimeType }),
        })
        if (upErr) throw upErr
        await db.documents.update(id, { filePath: path, uploaded: true })
        rec.filePath = path
        rec.uploaded = true
      }
    }

    const { error } = await supabase.from('documents').upsert(documentToRow(rec))
    if (error) {
      if (isPermanentSyncError(error)) continue // rejet permanent : drainé par le bulkDelete final (anti-boucle/Sentry)
      throw error
    }
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

  // Offline-first : épingle en local les fichiers des documents qui n'ont pas encore de blob
  // (tirés du serveur, ou cache local effacé). Best-effort, en arrière-plan, ne bloque pas la synchro.
  void pinMissingDocumentBlobs(orgId)
}

/**
 * Télécharge + met en cache local les blobs manquants (offline-first). Un document n'est lu qu'une
 * fois ; les accès suivants sont instantanés. Garde de ré-entrance + tolérant aux échecs réseau.
 */
async function pinMissingDocumentBlobs(orgId: string): Promise<void> {
  if (pinning || !navigator.onLine) return
  pinning = true
  try {
    const docs = await db.documents
      .where('orgId')
      .equals(orgId)
      .filter((d) => d.deletedAt === null && !!d.filePath)
      .toArray()
    for (const d of docs) {
      if (!d.filePath) continue
      if (await db.documentBlobs.get(d.id)) continue
      const blob = await downloadDocumentBlob(d.filePath)
      if (blob) await cacheDocumentBlob(d.id, blob)
    }
  } catch (error) {
    console.warn('[sync] épinglage blobs documents :', error)
  } finally {
    pinning = false
  }
}

/**
 * Télécharge un document depuis Storage via l'API `download` (RLS, encodage des chemins géré
 * par la lib). Remplace l'ancien couple URL signée + fetch : les chemins avec espaces/accents/
 * symboles y cassaient (bug recette : COPP invisible en navigation privée alors que l'Edge
 * lisait le même fichier avec `download`). `null` = hors-ligne ou introuvable.
 */
export async function downloadDocumentBlob(filePath: string): Promise<Blob | null> {
  const supabase = await getSupabase()
  if (!supabase) return null
  try {
    const { data, error } = await supabase.storage.from(BUCKET).download(filePath)
    return error || !data ? null : data
  } catch {
    return null // hors-ligne / transitoire
  }
}
