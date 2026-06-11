import type { SupabaseClient } from '@supabase/supabase-js'

import { db, type DossierAttachmentRecord } from '@/lib/db'
import { withRetry } from '@/lib/retry'
import { reportError } from '@/lib/sentry'
import { sanitizeFileName } from '@/lib/files'
import { getSupabase } from '@/lib/supabase'
import { cacheAttachmentBlob, getAttachmentBlob } from './dossier-attachments-repository'

const BUCKET = 'documents'
const lastPullKey = (orgId: string) => `pharnos.lastPull.dossierAttachments.${orgId}`
let syncing = false
let pinning = false

export interface DossierAttachmentRow {
  id: string
  org_id: string
  dossier_id: string
  node_number: string
  file_path: string | null
  status: string
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export function attachmentToRow(a: DossierAttachmentRecord): DossierAttachmentRow {
  return {
    id: a.id,
    org_id: a.orgId,
    dossier_id: a.dossierId,
    node_number: a.nodeNumber,
    file_path: a.filePath,
    status: 'active',
    created_at: a.createdAt,
    updated_at: a.updatedAt,
    deleted_at: a.deletedAt,
  }
}

export function rowToAttachment(r: DossierAttachmentRow): DossierAttachmentRecord {
  const fileName = r.file_path?.split('/').pop() ?? 'fichier'
  return {
    id: r.id,
    orgId: r.org_id,
    dossierId: r.dossier_id,
    nodeNumber: r.node_number,
    fileName,
    mimeType: '',
    size: 0,
    filePath: r.file_path,
    uploaded: true,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    deletedAt: r.deleted_at,
  }
}

/** Réconcilie les pièces jointes : upload des blobs en attente + upsert métadonnées, puis pull. */
export async function syncDossierAttachments(orgId: string): Promise<void> {
  if (syncing || !navigator.onLine) return
  const supabase = await getSupabase()
  if (!supabase) return
  syncing = true
  try {
    // Retry borné (transitoires only) : une microcoupure ne repousse pas la sync au prochain déclencheur.
    await withRetry(() => pushAttachments(supabase, orgId))
    await withRetry(() => pullAttachments(supabase, orgId))
  } catch (error) {
    console.warn('[sync] dossierAttachments :', error)
    reportError(error, { op: 'sync', entity: 'dossierAttachments' })
  } finally {
    syncing = false
  }
}

async function pushAttachments(supabase: SupabaseClient, orgId: string): Promise<void> {
  const items = await db.outbox.where('entity').equals('dossier_attachment').toArray()
  if (items.length === 0) return
  const ids = [...new Set(items.map((i) => i.entityId))]
  for (const id of ids) {
    const rec = await db.dossierAttachments.get(id)
    if (!rec || rec.orgId !== orgId) continue

    if (!rec.uploaded && rec.deletedAt === null) {
      const blob = await getAttachmentBlob(id)
      if (blob) {
        // sanitize au build du chemin : couvre aussi les enregistrements Dexie antérieurs à T5.
        const path = `${rec.orgId}/dossiers/${rec.dossierId}/${rec.id}/${sanitizeFileName(rec.fileName)}`
        const { error: upErr } = await supabase.storage
          .from(BUCKET)
          .upload(path, blob, { upsert: true, contentType: rec.mimeType || undefined })
        if (upErr) throw upErr
        await db.dossierAttachments.update(id, { filePath: path, uploaded: true })
        rec.filePath = path
        rec.uploaded = true
      }
    }

    // Supprimé → retire aussi l'objet Storage (best-effort ; fichiers potentiellement volumineux).
    if (rec.deletedAt !== null && rec.filePath) {
      await supabase.storage.from(BUCKET).remove([rec.filePath])
    }

    const { error } = await supabase.from('dossier_attachments').upsert(attachmentToRow(rec))
    if (error) throw error
  }
  await db.outbox.bulkDelete(items.map((i) => i.id))
}

async function pullAttachments(supabase: SupabaseClient, orgId: string): Promise<void> {
  const since = localStorage.getItem(lastPullKey(orgId)) ?? '1970-01-01T00:00:00.000Z'
  const { data, error } = await supabase
    .from('dossier_attachments')
    .select('*')
    .eq('org_id', orgId)
    .gt('updated_at', since)
    .order('updated_at', { ascending: true })
  if (error) throw error

  const rows = (data ?? []) as unknown as DossierAttachmentRow[]
  let maxUpdated = since
  for (const row of rows) {
    const incoming = rowToAttachment(row)
    const local = await db.dossierAttachments.get(incoming.id)
    // Strictement plus récent → préserve les métadonnées locales riches (taille, mime, blob).
    if (!local || incoming.updatedAt > local.updatedAt) {
      await db.dossierAttachments.put(incoming)
    }
    if (incoming.updatedAt > maxUpdated) maxUpdated = incoming.updatedAt
  }
  if (rows.length > 0) localStorage.setItem(lastPullKey(orgId), maxUpdated)

  // Offline-first : épingle en local les fichiers des pièces jointes sans blob (best-effort, async).
  void pinMissingAttachmentBlobs(orgId)
}

/** Télécharge + met en cache local les blobs de pièces jointes manquants (offline-first, best-effort). */
async function pinMissingAttachmentBlobs(orgId: string): Promise<void> {
  if (pinning || !navigator.onLine) return
  pinning = true
  try {
    const items = await db.dossierAttachments
      .where('orgId')
      .equals(orgId)
      .filter((a) => a.deletedAt === null && !!a.filePath)
      .toArray()
    for (const a of items) {
      if (!a.filePath) continue
      if (await db.documentBlobs.get(a.id)) continue
      const url = await getAttachmentDownloadUrl(a.filePath)
      if (!url) continue
      try {
        const res = await fetch(url)
        if (res.ok) await cacheAttachmentBlob(a.id, await res.blob())
      } catch {
        /* hors-ligne / transitoire */
      }
    }
  } catch (error) {
    console.warn('[sync] épinglage blobs pièces jointes :', error)
  } finally {
    pinning = false
  }
}

/** URL signée (courte durée) pour télécharger une pièce jointe depuis Storage. */
export async function getAttachmentDownloadUrl(filePath: string): Promise<string | null> {
  const supabase = await getSupabase()
  if (!supabase) return null
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(filePath, 300)
  if (error) return null
  return data.signedUrl
}
