import { db, type CorrespondenceMessageRecord, type CorrespondenceRecord } from '@/lib/db'

/**
 * Non-lus de la Correspondance (v2) — marqueurs LOCAUX (par appareil, jamais synchronisés) :
 * un message du reviewer postérieur au `lastSeenAt` de sa conversation est « non lu ».
 */

/** Marque la conversation comme lue (appelé quand son fil est affiché). */
export async function markConversationRead(correspondenceId: string): Promise<void> {
  await db.correspondenceReads.put({ id: correspondenceId, lastSeenAt: new Date().toISOString() })
}

/** Nombre de messages reviewer non lus, par conversation. */
export function countUnread(
  messages: CorrespondenceMessageRecord[],
  lastSeenAt: string | undefined,
): number {
  const since = lastSeenAt ?? ''
  let n = 0
  for (const m of messages) {
    if (m.author === 'recipient' && m.createdAt > since) n++
  }
  return n
}

export interface UnreadIndex {
  /** Non-lus par conversation (correspondenceId → n). */
  byConversation: Map<string, number>
  /** Non-lus par dossier (dossierId → n) — pastilles home + bandeau. */
  byDossier: Map<string, number>
  total: number
}

/** Index complet des non-lus de l'org (une requête par table, agrégation en mémoire). */
export async function unreadIndex(orgId: string): Promise<UnreadIndex> {
  const [correspondences, messages, reads] = await Promise.all([
    db.correspondences.where('orgId').equals(orgId).toArray(),
    db.correspondenceMessages.where('orgId').equals(orgId).toArray(),
    db.correspondenceReads.toArray(),
  ])
  const lastSeen = new Map(reads.map((r) => [r.id, r.lastSeenAt]))
  const dossierOf = new Map<string, CorrespondenceRecord>()
  for (const c of correspondences) {
    if (c.deletedAt === null) dossierOf.set(c.id, c)
  }

  const byConversation = new Map<string, number>()
  const byDossier = new Map<string, number>()
  let total = 0
  for (const m of messages) {
    if (m.author !== 'recipient') continue
    const corr = dossierOf.get(m.correspondenceId)
    if (!corr) continue
    if (m.createdAt > (lastSeen.get(m.correspondenceId) ?? '')) {
      byConversation.set(m.correspondenceId, (byConversation.get(m.correspondenceId) ?? 0) + 1)
      byDossier.set(corr.dossierId, (byDossier.get(corr.dossierId) ?? 0) + 1)
      total++
    }
  }
  return { byConversation, byDossier, total }
}
