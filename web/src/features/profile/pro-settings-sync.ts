import type { SupabaseClient } from '@supabase/supabase-js'

import { db, type ProSettingRecord } from '@/lib/db'
import { isPermanentSyncError, withRetry } from '@/lib/retry'
import { isSyncEnabled } from '@/lib/sync-prefs'
import { reportError } from '@/lib/sentry'
import { getSupabase } from '@/lib/supabase'

export interface ProSettingRow {
  id: string
  org_id: string
  kind: string
  entreprise: string | null
  poste: string | null
  signataire: string | null
  pays: string | null
  header_image: string | null
  footer_image: string | null
  logo_image: string | null
  signature_image: string | null
  updated_at: string
  deleted_at: string | null
}

function toRow(d: ProSettingRecord): ProSettingRow {
  return {
    id: d.id,
    org_id: d.orgId,
    kind: d.kind,
    entreprise: d.entreprise,
    poste: d.poste,
    signataire: d.signataire,
    pays: d.pays,
    header_image: d.headerImage,
    footer_image: d.footerImage,
    logo_image: d.logoImage,
    signature_image: d.signatureImage,
    updated_at: d.updatedAt,
    deleted_at: d.deletedAt,
  }
}

function rowTo(r: ProSettingRow): ProSettingRecord {
  return {
    id: r.id,
    orgId: r.org_id,
    kind: r.kind === 'userSignature' ? 'userSignature' : 'orgBranding',
    entreprise: r.entreprise ?? null,
    poste: r.poste ?? null,
    signataire: r.signataire ?? null,
    pays: r.pays ?? null,
    headerImage: r.header_image,
    footerImage: r.footer_image,
    logoImage: r.logo_image ?? null,
    signatureImage: r.signature_image,
    updatedAt: r.updated_at,
    deletedAt: r.deleted_at,
  }
}

const lastPullKey = (orgId: string) => `pharnos.lastPull.proSettings.${orgId}`
let syncing = false

/** Réconcilie le profil pro (Dexie ⇄ Postgres). No-op hors-ligne / Supabase non configuré. */
export async function syncProSettings(orgId: string): Promise<void> {
  if (syncing || !navigator.onLine || !isSyncEnabled(orgId)) return
  const supabase = await getSupabase()
  if (!supabase) return
  syncing = true
  try {
    // Retry borné (transitoires only) : une microcoupure ne repousse pas la sync au prochain déclencheur.
    await withRetry(() => pushProSettings(supabase, orgId))
    await withRetry(() => pullProSettings(supabase, orgId))
  } catch (error) {
    console.warn('[sync] proSettings :', error)
    reportError(error, { op: 'sync', entity: 'proSettings' })
  } finally {
    syncing = false
  }
}

async function pushProSettings(supabase: SupabaseClient, orgId: string): Promise<void> {
  const items = await db.outbox.where('entity').equals('pro_setting').toArray()
  if (items.length === 0) return
  const ids = [...new Set(items.map((i) => i.entityId))]
  for (const id of ids) {
    const rec = await db.proSettings.get(id)
    if (!rec || rec.orgId !== orgId) continue
    const { error } = await supabase.from('pro_settings').upsert(toRow(rec))
    if (error) {
      if (isPermanentSyncError(error)) continue // rejet permanent : drainé par le bulkDelete final (anti-boucle/Sentry)
      throw error
    }
  }
  await db.outbox.bulkDelete(items.map((i) => i.id))
}

async function pullProSettings(supabase: SupabaseClient, orgId: string): Promise<void> {
  const since = localStorage.getItem(lastPullKey(orgId)) ?? '1970-01-01T00:00:00.000Z'
  const { data, error } = await supabase
    .from('pro_settings')
    .select('*')
    .eq('org_id', orgId)
    .gt('updated_at', since)
    .order('updated_at', { ascending: true })
  if (error) throw error

  const rows = (data ?? []) as unknown as ProSettingRow[]
  let maxUpdated = since
  for (const row of rows) {
    const incoming = rowTo(row)
    const local = await db.proSettings.get(incoming.id)
    // >= : à timestamp égal, la version serveur l'emporte (cohérent avec dossiers/generatedDocs).
    if (!local || incoming.updatedAt >= local.updatedAt) {
      await db.proSettings.put(incoming)
    }
    if (incoming.updatedAt > maxUpdated) maxUpdated = incoming.updatedAt
  }
  if (rows.length > 0) localStorage.setItem(lastPullKey(orgId), maxUpdated)
}
