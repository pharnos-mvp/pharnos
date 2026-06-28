import { describe, expect, it } from 'vitest'

import type { CorrespondenceRecord } from '@/lib/db'
import { buildCorrespondenceFeed } from './correspondence-feed'

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
    expiresAt: null,
    autoRevokeOnDecision: false,
    createdAt: over.createdAt ?? '2026-01-01T00:00:00.000Z',
    updatedAt: over.updatedAt ?? '2026-01-01T00:00:00.000Z',
    deletedAt: over.deletedAt ?? null,
    ...over,
  }) as CorrespondenceRecord

describe('buildCorrespondenceFeed', () => {
  it('priorise message non lu > décision > review et trie par récence', () => {
    const items = buildCorrespondenceFeed(
      [
        corr({ id: 'a', dossierId: 'd1', status: 'in_review', createdAt: '2026-02-01T00:00:00Z' }),
        corr({
          id: 'b',
          dossierId: 'd2',
          status: 'accepted',
          decidedAt: '2026-03-01T00:00:00Z',
        }),
        corr({
          id: 'c',
          dossierId: 'd3',
          status: 'in_review',
          updatedAt: '2026-04-01T00:00:00Z',
        }),
      ],
      new Map([['c', 2]]), // c a 2 non lus
    )
    expect(items.map((i) => i.id)).toEqual(['c', 'b', 'a']) // récence : updatedAt c > decidedAt b > createdAt a
    expect(items[0]).toMatchObject({ kind: 'message', unread: 2 })
    expect(items[1]).toMatchObject({ kind: 'decision', status: 'accepted' })
    expect(items[2]).toMatchObject({ kind: 'review' })
  })

  it('exclut les correspondances supprimées et les in_review révoquées', () => {
    const items = buildCorrespondenceFeed(
      [
        corr({ id: 'del', deletedAt: '2026-02-01T00:00:00Z' }),
        corr({ id: 'rev', status: 'in_review', revokedAt: '2026-02-01T00:00:00Z' }),
        corr({ id: 'ok', status: 'in_review' }),
        // révoquée APRÈS décision → la décision reste une activité.
        corr({
          id: 'decided-rev',
          status: 'rejected',
          decidedAt: '2026-02-02T00:00:00Z',
          revokedAt: '2026-02-03T00:00:00Z',
        }),
      ],
      new Map(),
    )
    expect(items.map((i) => i.id).sort()).toEqual(['decided-rev', 'ok'])
  })
})
