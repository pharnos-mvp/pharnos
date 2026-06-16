import { db } from '@/lib/db'
import { enqueueOutbox } from '@/lib/outbox'

export type AuditAction = 'create' | 'update' | 'delete' | 'archive' | 'restore'

/**
 * Acteur courant (qui agit) — alimenté par l'AuthProvider à chaque changement de session.
 * En mode local (sans Supabase), acteur générique.
 */
let actor: { id: string; email: string } = { id: 'local', email: 'local' }

export function setAuditActor(a: { id: string; email: string } | null): void {
  actor = a ?? { id: 'local', email: 'local' }
}

/**
 * Enregistre une entrée d'audit (qui / quoi / quand) — local (Dexie) + file de synchro.
 * Best-effort : un échec d'audit ne doit jamais casser la mutation métier.
 */
export async function recordAudit(
  orgId: string,
  entity: string,
  entityId: string,
  action: AuditAction,
  label: string,
): Promise<void> {
  try {
    const rec = {
      id: crypto.randomUUID(),
      orgId,
      actorId: actor.id,
      actorEmail: actor.email,
      entity,
      entityId,
      action,
      label,
      at: new Date().toISOString(),
    }
    await db.auditLog.add(rec)
    await enqueueOutbox('audit', rec.id, 'create', rec)
  } catch (error) {
    console.warn('[audit] échec d’enregistrement :', error)
  }
}
