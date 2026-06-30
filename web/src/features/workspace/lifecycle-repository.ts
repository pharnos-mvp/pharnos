import { recordAudit } from '@/lib/audit'
import { db, type LifecycleEventRecord, type LifecycleEventType } from '@/lib/db'
import { enqueueOutbox } from '@/lib/outbox'

/**
 * Écritures du journal du cycle de vie (« la spine ») — offline-first : Dexie + outbox, poussé à la
 * reconnexion. Append-only : on n'édite/ne supprime JAMAIS un événement (une correction = un nouvel
 * événement). L'étape courante reste DÉRIVÉE (`deriveLifecycle`), jamais stockée.
 */

const now = () => new Date().toISOString()
const newId = () => crypto.randomUUID()

export interface AppendLifecycleEventInput {
  dossierId: string
  type: LifecycleEventType
  /** Acteur : user_id ('system' pour les relances auto). */
  actorId: string
  /** Libellé d'affichage (e-mail) ; '' pour 'system'. */
  actorEmail?: string
  /** Quand l'événement réglementaire a réellement eu lieu (défaut : maintenant). */
  occurredAt?: string
  payload?: Record<string, unknown>
  docRefs?: LifecycleEventRecord['docRefs']
}

/** Journalise un événement du cycle de vie. */
export async function appendLifecycleEvent(
  orgId: string,
  input: AppendLifecycleEventInput,
): Promise<LifecycleEventRecord> {
  const ts = now()
  const event: LifecycleEventRecord = {
    id: newId(),
    orgId,
    dossierId: input.dossierId,
    type: input.type,
    actorId: input.actorId,
    actorEmail: input.actorEmail ?? '',
    occurredAt: input.occurredAt ?? ts,
    payload: input.payload ?? {},
    docRefs: input.docRefs ?? [],
    createdAt: ts,
  }
  await db.transaction('rw', db.lifecycleEvents, db.outbox, async () => {
    await db.lifecycleEvents.add(event)
    await enqueueOutbox('lifecycle_event', event.id, 'create', event)
  })
  await recordAudit(orgId, 'lifecycle_event', event.id, 'create', input.type)
  return event
}

/** Journal d'un dossier, trié par occurrence réelle (timeline). */
export async function listLifecycleEvents(dossierId: string): Promise<LifecycleEventRecord[]> {
  return db.lifecycleEvents
    .where('[dossierId+occurredAt]')
    .between([dossierId, ''], [dossierId, '￿'])
    .toArray()
}
