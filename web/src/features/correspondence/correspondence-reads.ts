import { db, type CorrespondenceMessageRecord } from '@/lib/db'

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
