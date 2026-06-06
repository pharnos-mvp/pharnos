import { db, type OutboxOp } from '@/lib/db'

/** Ajoute une mutation à la file de synchro (outbox), partagée par toutes les entités. */
export async function enqueueOutbox(
  entity: string,
  entityId: string,
  op: OutboxOp,
  payload: unknown,
): Promise<void> {
  await db.outbox.add({
    id: crypto.randomUUID(),
    entity,
    entityId,
    op,
    payload,
    createdAt: new Date().toISOString(),
  })
}
