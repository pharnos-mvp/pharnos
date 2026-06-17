import type { SupabaseClient } from '@supabase/supabase-js'

import { db, type GeneratedDocRecord } from '@/lib/db'
import { isPermanentSyncError, withRetry } from '@/lib/retry'
import { isSyncEnabled } from '@/lib/sync-prefs'
import { reportError } from '@/lib/sentry'
import { getSupabase } from '@/lib/supabase'
import { EMPTY_DOC, parseTiptapContent } from './tiptap-schema'

export interface GeneratedDocRow {
  id: string
  org_id: string
  dossier_id: string
  node_number: string
  template_key: string
  source_doc_id: string | null
  title: string
  content: unknown
  status: string
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export function generatedDocToRow(d: GeneratedDocRecord): GeneratedDocRow {
  return {
    id: d.id,
    org_id: d.orgId,
    dossier_id: d.dossierId,
    node_number: d.nodeNumber,
    template_key: d.templateKey,
    source_doc_id: d.sourceDocId ?? null,
    title: d.title,
    content: d.content,
    status: d.status,
    created_at: d.createdAt,
    updated_at: d.updatedAt,
    deleted_at: d.deletedAt,
  }
}

export function rowToGeneratedDoc(r: GeneratedDocRow): GeneratedDocRecord {
  return {
    id: r.id,
    orgId: r.org_id,
    dossierId: r.dossier_id,
    nodeNumber: r.node_number,
    templateKey: r.template_key,
    sourceDocId: r.source_doc_id ?? undefined,
    title: r.title,
    content: r.content,
    status: r.status,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    deletedAt: r.deleted_at,
  }
}

const lastPullKey = (orgId: string) => `pharnos.lastPull.generatedDocs.${orgId}`
let syncing = false

/** Réconcilie les documents générés (Dexie ⇄ Postgres). No-op hors-ligne / Supabase non configuré. */
export async function syncGeneratedDocs(orgId: string): Promise<void> {
  if (syncing || !navigator.onLine || !isSyncEnabled(orgId)) return
  const supabase = await getSupabase()
  if (!supabase) return
  syncing = true
  try {
    // Retry borné (transitoires only) : une microcoupure ne repousse pas la sync au prochain déclencheur.
    await withRetry(() => pushGeneratedDocs(supabase, orgId))
    await withRetry(() => pullGeneratedDocs(supabase, orgId))
  } catch (error) {
    console.warn('[sync] generatedDocs :', error)
    reportError(error, { op: 'sync', entity: 'generatedDocs' })
  } finally {
    syncing = false
  }
}

async function pushGeneratedDocs(supabase: SupabaseClient, orgId: string): Promise<void> {
  const items = await db.outbox.where('entity').equals('generated_doc').toArray()
  if (items.length === 0) return
  const ids = [...new Set(items.map((i) => i.entityId))]
  for (const id of ids) {
    const rec = await db.generatedDocs.get(id)
    if (!rec || rec.orgId !== orgId) continue
    const { error } = await supabase.from('generated_docs').upsert(generatedDocToRow(rec))
    if (error) {
      if (isPermanentSyncError(error)) continue // rejet permanent : drainé par le bulkDelete final (anti-boucle/Sentry)
      throw error
    }
  }
  await db.outbox.bulkDelete(items.map((i) => i.id))
}

async function pullGeneratedDocs(supabase: SupabaseClient, orgId: string): Promise<void> {
  const since = localStorage.getItem(lastPullKey(orgId)) ?? '1970-01-01T00:00:00.000Z'
  const { data, error } = await supabase
    .from('generated_docs')
    .select('*')
    .eq('org_id', orgId)
    .gt('updated_at', since)
    .order('updated_at', { ascending: true })
  if (error) throw error

  const rows = (data ?? []) as unknown as GeneratedDocRow[]
  let maxUpdated = since
  for (const row of rows) {
    const incoming = rowToGeneratedDoc(row)
    // Le contenu vient d'un autre client du tenant : validé avant d'entrer en Dexie. Invalide →
    // on ne remplace JAMAIS une version locale par du corrompu ; sans version locale, quarantaine
    // douce (doc vide) pour que l'éditeur et la compilation ne plantent pas.
    const safeContent = parseTiptapContent(incoming.content)
    if (safeContent === null) {
      reportError(new Error('Contenu TipTap invalide au pull'), {
        op: 'pull-generated-doc',
        id: incoming.id,
      })
    }
    const local = await db.generatedDocs.get(incoming.id)
    if (!local || incoming.updatedAt >= local.updatedAt) {
      if (safeContent !== null) {
        await db.generatedDocs.put({ ...incoming, content: safeContent })
      } else if (!local) {
        await db.generatedDocs.put({ ...incoming, content: EMPTY_DOC })
      }
      // local présent + contenu entrant invalide → on garde la version locale.
    }
    if (incoming.updatedAt > maxUpdated) maxUpdated = incoming.updatedAt
  }
  if (rows.length > 0) localStorage.setItem(lastPullKey(orgId), maxUpdated)
}
