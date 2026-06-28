import { describe, expect, it } from 'vitest'

import type { CorrespondenceRecord } from '@/lib/db'
import { buildInbox, inboxUnreadTotal } from './correspondence-feed'

const NOW = new Date('2026-06-28T00:00:00.000Z')
const inDays = (n: number) => new Date(NOW.getTime() + n * 86_400_000).toISOString()

const corr = (over: Partial<CorrespondenceRecord>): CorrespondenceRecord =>
  ({
    id: over.id ?? 'c',
    orgId: 'org-1',
    dossierId: over.dossierId ?? 'd',
    productName: over.productName ?? 'P',
    country: over.country ?? 'BJ',
    activity: 'new_ma',
    senderEmail: 's',
    recipientEmail: 'r',
    note: null,
    pdfPath: 'p',
    pdfSize: 0,
    tokenHash: 'h',
    passwordHash: null,
    status: over.status ?? 'in_review',
    decidedAt: over.decidedAt ?? null,
    revokedAt: over.revokedAt ?? null,
    expiresAt: over.expiresAt ?? null,
    autoRevokeOnDecision: false,
    createdAt: over.createdAt ?? '2026-01-01T00:00:00.000Z',
    updatedAt: over.updatedAt ?? '2026-01-01T00:00:00.000Z',
    deletedAt: over.deletedAt ?? null,
    ...over,
  }) as CorrespondenceRecord

describe('buildInbox', () => {
  it('type les entrées : décision / complément / message / échéance', () => {
    const items = buildInbox(
      [
        corr({ id: 'oct', status: 'accepted', decidedAt: inDays(-1) }),
        corr({ id: 'rej', status: 'rejected', decidedAt: inDays(-2) }),
        corr({ id: 'comp', status: 'suspended', decidedAt: inDays(-3) }),
        corr({ id: 'msg', status: 'in_review', updatedAt: inDays(-1) }),
        corr({ id: 'ech', status: 'in_review', expiresAt: inDays(5) }),
      ],
      new Map([['msg', 2]]),
      NOW,
    )
    const byId = Object.fromEntries(items.map((i) => [i.id, i]))
    expect(byId['oct']?.kind).toBe('decision')
    expect(byId['rej']?.kind).toBe('decision')
    expect(byId['comp']?.kind).toBe('complement')
    expect(byId['msg']).toMatchObject({ kind: 'message', unread: 2 })
    expect(byId['ech']).toMatchObject({ kind: 'echeance', deadlineDays: 5 })
  })

  it('ignore in_review sans message ni échéance proche, et les révoquées/supprimées', () => {
    const items = buildInbox(
      [
        corr({ id: 'silent', status: 'in_review' }), // rien de l'agence → exclu
        corr({ id: 'far', status: 'in_review', expiresAt: inDays(30) }), // échéance lointaine → exclu
        corr({ id: 'rev', status: 'in_review', revokedAt: inDays(-1) }), // révoquée → exclu
        corr({ id: 'del', status: 'accepted', deletedAt: inDays(-1) }), // supprimée → exclu
      ],
      new Map(),
      NOW,
    )
    expect(items).toHaveLength(0)
  })

  it('inboxUnreadTotal compte les entrées avec messages non lus', () => {
    const items = buildInbox(
      [corr({ id: 'a', status: 'in_review' }), corr({ id: 'b', status: 'in_review' })],
      new Map([
        ['a', 3],
        ['b', 1],
      ]),
      NOW,
    )
    expect(inboxUnreadTotal(items)).toBe(2)
  })
})
