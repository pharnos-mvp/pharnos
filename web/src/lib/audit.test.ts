import { beforeEach, describe, expect, it } from 'vitest'

import { recordAudit, setAuditActor } from '@/lib/audit'
import { db } from '@/lib/db'

beforeEach(async () => {
  await db.auditLog.clear()
  await db.outbox.clear()
})

describe('audit (ALCOA++ — qui/quoi/quand)', () => {
  it('enregistre l’acteur, l’action, le libellé et l’horodatage (+ outbox)', async () => {
    setAuditActor({ id: 'u1', email: 'ra@labo.com' })
    await recordAudit('org-1', 'product', 'p1', 'create', 'Doliprane')

    const entries = await db.auditLog.where('orgId').equals('org-1').toArray()
    expect(entries).toHaveLength(1)
    expect(entries[0]?.actorEmail).toBe('ra@labo.com')
    expect(entries[0]?.action).toBe('create')
    expect(entries[0]?.entity).toBe('product')
    expect(entries[0]?.label).toBe('Doliprane')
    expect(entries[0]?.at).toBeTruthy()

    const outbox = await db.outbox.where('entity').equals('audit').toArray()
    expect(outbox).toHaveLength(1)
    expect(outbox[0]?.op).toBe('create')
  })

  it('utilise un acteur local par défaut (mode hors-ligne)', async () => {
    setAuditActor(null)
    await recordAudit('org-1', 'dossier', 'd1', 'delete', 'X')
    const e = (await db.auditLog.where('orgId').equals('org-1').toArray())[0]
    expect(e?.actorId).toBe('local')
  })
})
