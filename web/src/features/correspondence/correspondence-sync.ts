import type { SupabaseClient } from '@supabase/supabase-js'

import { db, type CorrespondenceMessageRecord, type CorrespondenceRecord } from '@/lib/db'
import { withRetry } from '@/lib/retry'
import { reportError } from '@/lib/sentry'
import { getSupabase } from '@/lib/supabase'

/**
 * Sync Correspondance (jalon H) — pattern outbox + pull incrémental (source de vérité ;
 * Realtime n'est qu'un accélérateur). Messages append-only → pull paginé par `created_at`.
 */

export interface CorrespondenceRow {
  id: string
  org_id: string
  dossier_id: string
  product_name: string
  country: string
  activity: string
  sender_email: string
  recipient_email: string
  note: string | null
  pdf_path: string
  pdf_size: number
  token_hash: string
  password_hash: string | null
  status: string
  decided_at: string | null
  revoked_at: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export interface CorrespondenceMessageRow {
  id: string
  org_id: string
  correspondence_id: string
  author: string
  author_label: string
  kind: string
  decision: string | null
  body: string
  attachments: { path: string; name: string; size: number; mime: string }[]
  created_at: string
}

export function correspondenceToRow(c: CorrespondenceRecord): CorrespondenceRow {
  return {
    id: c.id,
    org_id: c.orgId,
    dossier_id: c.dossierId,
    product_name: c.productName,
    country: c.country,
    activity: c.activity,
    sender_email: c.senderEmail,
    recipient_email: c.recipientEmail,
    note: c.note,
    pdf_path: c.pdfPath,
    pdf_size: c.pdfSize,
    token_hash: c.tokenHash,
    password_hash: c.passwordHash,
    status: c.status,
    decided_at: c.decidedAt,
    revoked_at: c.revokedAt,
    created_at: c.createdAt,
    updated_at: c.updatedAt,
    deleted_at: c.deletedAt,
  }
}

export function rowToCorrespondence(r: CorrespondenceRow): CorrespondenceRecord {
  return {
    id: r.id,
    orgId: r.org_id,
    dossierId: r.dossier_id,
    productName: r.product_name,
    country: r.country,
    activity: r.activity,
    senderEmail: r.sender_email,
    recipientEmail: r.recipient_email,
    note: r.note,
    pdfPath: r.pdf_path,
    pdfSize: r.pdf_size ?? 0,
    tokenHash: r.token_hash,
    passwordHash: r.password_hash,
    status: r.status as CorrespondenceRecord['status'],
    decidedAt: r.decided_at,
    revokedAt: r.revoked_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    deletedAt: r.deleted_at,
  }
}

export function messageToRow(m: CorrespondenceMessageRecord): CorrespondenceMessageRow {
  return {
    id: m.id,
    org_id: m.orgId,
    correspondence_id: m.correspondenceId,
    author: m.author,
    author_label: m.authorLabel,
    kind: m.kind,
    decision: m.decision,
    body: m.body,
    attachments: m.attachments ?? [],
    created_at: m.createdAt,
  }
}

export function rowToMessage(r: CorrespondenceMessageRow): CorrespondenceMessageRecord {
  return {
    id: r.id,
    orgId: r.org_id,
    correspondenceId: r.correspondence_id,
    author: r.author as CorrespondenceMessageRecord['author'],
    authorLabel: r.author_label,
    kind: r.kind as CorrespondenceMessageRecord['kind'],
    decision: r.decision as CorrespondenceMessageRecord['decision'],
    body: r.body ?? '',
    attachments: (r.attachments ?? []) as CorrespondenceMessageRecord['attachments'],
    createdAt: r.created_at,
  }
}

const lastPullKey = (orgId: string) => `pharnos.lastPull.correspondences.${orgId}`
const lastPullMsgKey = (orgId: string) => `pharnos.lastPull.correspondenceMessages.${orgId}`
const PAGE = 500
let syncing = false

/**
 * Curseur de pagination COMPOSITE `ts|id` : un curseur sur timestamp seul (.gt) boucle sans fin
 * si ≥ PAGE lignes partagent le même horodatage (inserts en rafale). Le tie-break par id rend
 * la progression strictement monotone. Rétro-compatible : un ancien curseur ISO pur = id vide.
 */
const EPOCH = '1970-01-01T00:00:00.000Z'
const TS_RE = /^[0-9T:.+-]+Z?$/
const ID_RE = /^[0-9a-fA-F-]*$/

function parseCursor(raw: string | null): { ts: string; id: string } {
  if (!raw) return { ts: EPOCH, id: '' }
  const i = raw.indexOf('|')
  const ts = i === -1 ? raw : raw.slice(0, i)
  const id = i === -1 ? '' : raw.slice(i + 1)
  // Valeurs interpolées dans le filtre PostgREST : un curseur corrompu (localStorage) est
  // ignoré plutôt que de casser la requête — on repart de l'époque (pull idempotent).
  return TS_RE.test(ts) && ID_RE.test(id) ? { ts, id } : { ts: EPOCH, id: '' }
}

/** Filtre PostgREST « strictement après (ts, id) » — appliqué en AND des autres filtres. */
const afterCursor = (column: string, c: { ts: string; id: string }) =>
  `${column}.gt.${c.ts},and(${column}.eq.${c.ts},id.gt.${c.id || '00000000-0000-0000-0000-000000000000'})`

/** Réconcilie correspondances + messages (Dexie ⇄ Postgres). No-op hors-ligne. */
export async function syncCorrespondences(orgId: string): Promise<void> {
  if (syncing || !navigator.onLine) return
  const supabase = await getSupabase()
  if (!supabase) return
  syncing = true
  try {
    await withRetry(() => pushCorrespondences(supabase, orgId))
    await withRetry(() => pushMessages(supabase, orgId))
    await withRetry(() => pullCorrespondences(supabase, orgId))
    await withRetry(() => pullMessages(supabase, orgId))
  } catch (error) {
    console.warn('[sync] correspondences :', error)
    reportError(error, { op: 'sync', entity: 'correspondences' })
  } finally {
    syncing = false
  }
}

async function pushCorrespondences(supabase: SupabaseClient, orgId: string): Promise<void> {
  const items = await db.outbox.where('entity').equals('correspondence').toArray()
  if (items.length === 0) return
  for (const item of items.sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
    const rec = await db.correspondences.get(item.entityId)
    if (!rec || rec.orgId !== orgId) continue
    if (item.op === 'create') {
      // Idempotent (retry après succès partiel) ; jamais ré-émis après création → un upsert
      // complet ne peut pas écraser une décision postérieure de l'Edge.
      const { error } = await supabase
        .from('correspondences')
        .upsert(correspondenceToRow(rec), { ignoreDuplicates: true })
      if (error) throw error
    } else if (item.op === 'update') {
      // Mutation PARTIELLE (révocation) : n'écrase JAMAIS `status`/`decided_at` écrits par
      // l'Edge entre-temps.
      const p = item.payload as { revokedAt?: string | null; updatedAt?: string }
      const { error } = await supabase
        .from('correspondences')
        .update({ revoked_at: p.revokedAt ?? null, updated_at: p.updatedAt ?? rec.updatedAt })
        .eq('id', rec.id)
      if (error) throw error
    }
  }
  await db.outbox.bulkDelete(items.map((i) => i.id))
}

async function pushMessages(supabase: SupabaseClient, orgId: string): Promise<void> {
  const items = await db.outbox.where('entity').equals('correspondence_message').toArray()
  if (items.length === 0) return
  for (const item of items.sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
    const rec = await db.correspondenceMessages.get(item.entityId)
    if (!rec || rec.orgId !== orgId) continue
    // Append-only : insert idempotent (ON CONFLICT DO NOTHING — pas de policy UPDATE, par design).
    const { error } = await supabase
      .from('correspondence_messages')
      .upsert(messageToRow(rec), { ignoreDuplicates: true })
    if (error) throw error
  }
  await db.outbox.bulkDelete(items.map((i) => i.id))
}

async function pullCorrespondences(supabase: SupabaseClient, orgId: string): Promise<void> {
  let cursor = parseCursor(localStorage.getItem(lastPullKey(orgId)))
  for (;;) {
    const { data, error } = await supabase
      .from('correspondences')
      .select('*')
      .eq('org_id', orgId)
      .or(afterCursor('updated_at', cursor))
      .order('updated_at', { ascending: true })
      .order('id', { ascending: true })
      .limit(PAGE)
    if (error) throw error
    const rows = (data ?? []) as unknown as CorrespondenceRow[]
    const last = rows.at(-1)
    if (!last) break
    for (const row of rows) {
      const incoming = rowToCorrespondence(row)
      const local = await db.correspondences.get(incoming.id)
      if (!local || incoming.updatedAt >= local.updatedAt) {
        await db.correspondences.put(incoming)
      }
    }
    cursor = { ts: last.updated_at, id: last.id }
    localStorage.setItem(lastPullKey(orgId), `${cursor.ts}|${cursor.id}`)
    if (rows.length < PAGE) break
  }
}

async function pullMessages(supabase: SupabaseClient, orgId: string): Promise<void> {
  let cursor = parseCursor(localStorage.getItem(lastPullMsgKey(orgId)))
  for (;;) {
    const { data, error } = await supabase
      .from('correspondence_messages')
      .select('*')
      .eq('org_id', orgId)
      .or(afterCursor('created_at', cursor))
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .limit(PAGE)
    if (error) throw error
    const rows = (data ?? []) as unknown as CorrespondenceMessageRow[]
    const last = rows.at(-1)
    if (!last) break
    // Append-only : put = idempotent (le local et le serveur portent le même contenu).
    await db.correspondenceMessages.bulkPut(rows.map(rowToMessage))
    cursor = { ts: last.created_at, id: last.id }
    localStorage.setItem(lastPullMsgKey(orgId), `${cursor.ts}|${cursor.id}`)
    if (rows.length < PAGE) break
  }
}
