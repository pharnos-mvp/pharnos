import { beforeEach, describe, expect, it, vi } from 'vitest'

import { db, type CorrespondenceMessageRecord, type CorrespondenceRecord } from '@/lib/db'
import { enqueueOutbox } from '@/lib/outbox'
import {
  correspondenceToRow,
  messageToRow,
  rowToCorrespondence,
  rowToMessage,
  syncCorrespondences,
  updatePayloadToPartial,
} from './correspondence-sync'

// --- Mock Supabase : upsert (push) tracé + chaîne select (pull) vide, quel que soit son shape ---
const upsertCalls: { table: string; row: Record<string, unknown> }[] = []

interface SelectChain {
  eq: () => SelectChain
  gt: () => SelectChain
  or: () => SelectChain
  order: () => SelectChain
  limit: () => SelectChain
  then: (onfulfilled: (value: { data: unknown[]; error: null }) => unknown) => Promise<unknown>
}
function selectChain(): SelectChain {
  const chain: SelectChain = {
    eq: () => chain,
    gt: () => chain,
    or: () => chain,
    order: () => chain,
    limit: () => chain,
    then: (onfulfilled) => Promise.resolve({ data: [], error: null }).then(onfulfilled),
  }
  return chain
}

const supabaseMock = {
  from: (table: string) => ({
    upsert: (row: Record<string, unknown>) => {
      upsertCalls.push({ table, row })
      return Promise.resolve({ error: null })
    },
    select: () => selectChain(),
  }),
}

vi.mock('@/lib/supabase', () => ({ getSupabase: vi.fn(async () => supabaseMock) }))
vi.mock('@/lib/sentry', () => ({ reportError: vi.fn() }))

const record: CorrespondenceRecord = {
  id: 'c1',
  orgId: 'org-1',
  dossierId: 'd1',
  productName: 'Doliprane',
  country: 'CI',
  activity: 'new_ma',
  senderEmail: 'labo@ex.com',
  recipientEmail: 'agence@ex.com',
  recipientLang: 'en',
  note: 'Note',
  pdfPath: 'org-1/shares/c1/module1.pdf',
  pdfSize: 42,
  tokenHash: 'a'.repeat(64),
  passwordHash: 'pbkdf2$600000$s$h',
  status: 'in_review',
  decidedAt: null,
  revokedAt: null,
  expiresAt: null,
  autoRevokeOnDecision: false,
  createdAt: '2026-06-12T00:00:00.000Z',
  updatedAt: '2026-06-12T00:00:00.000Z',
  deletedAt: null,
}

const message: CorrespondenceMessageRecord = {
  id: 'm1',
  orgId: 'org-1',
  correspondenceId: 'c1',
  author: 'recipient',
  authorLabel: 'agence@ex.com',
  kind: 'decision',
  decision: 'accepted',
  body: 'OK pour dépôt.',
  attachments: [{ path: 'p', name: 'recu.pdf', size: 10, mime: 'application/pdf' }],
  createdAt: '2026-06-12T01:00:00.000Z',
}

describe('mappers sync correspondance (round-trip sans perte)', () => {
  it('correspondence ⇄ row', () => {
    expect(rowToCorrespondence(correspondenceToRow(record))).toEqual(record)
  })

  it('message ⇄ row (pièces jointes incluses)', () => {
    expect(rowToMessage(messageToRow(message))).toEqual(message)
  })

  it('recipient_lang null côté serveur → null en local (le cron replie sur la langue du pays)', () => {
    const row = { ...correspondenceToRow(record), recipient_lang: null }
    expect(rowToCorrespondence(row).recipientLang).toBe(null)
  })

  it('recipientLang absent (ancien enregistrement local) → recipient_lang null poussé', () => {
    const legacy = { ...record }
    delete (legacy as { recipientLang?: unknown }).recipientLang
    expect(correspondenceToRow(legacy).recipient_lang).toBe(null)
  })

  it('tolère les colonnes optionnelles nulles côté serveur', () => {
    const row = { ...messageToRow(message), attachments: null, body: null }
    const back = rowToMessage(row as unknown as ReturnType<typeof messageToRow>)
    expect(back.attachments).toEqual([])
    expect(back.body).toBe('')
  })
})

describe('updatePayloadToPartial — mutation partielle (fail-safe statut)', () => {
  it('révocation / PDF : status et decided_at ABSENTS (jamais écrasés par accident)', () => {
    const partial = updatePayloadToPartial(
      { revokedAt: '2026-06-13T00:00:00.000Z', updatedAt: '2026-06-13T00:00:00.000Z' },
      record,
    )
    expect(partial).toEqual({
      updated_at: '2026-06-13T00:00:00.000Z',
      revoked_at: '2026-06-13T00:00:00.000Z',
    })
    expect('status' in partial).toBe(false)
    expect('decided_at' in partial).toBe(false)
  })

  it('renvoi en revue (M4) : status/decided_at/revoked_at explicites du payload partent', () => {
    const partial = updatePayloadToPartial(
      {
        status: 'in_review',
        decidedAt: null,
        revokedAt: null,
        updatedAt: '2026-06-14T00:00:00.000Z',
      },
      record,
    )
    expect(partial).toEqual({
      updated_at: '2026-06-14T00:00:00.000Z',
      status: 'in_review',
      decided_at: null,
      revoked_at: null,
    })
  })

  it('décision in-app (T3) : status décidé + decided_at datés partent ensemble', () => {
    const partial = updatePayloadToPartial(
      {
        status: 'suspended',
        decidedAt: '2026-06-15T00:00:00.000Z',
        updatedAt: '2026-06-15T00:00:00.000Z',
      },
      record,
    )
    expect(partial.status).toBe('suspended')
    expect(partial.decided_at).toBe('2026-06-15T00:00:00.000Z')
  })

  it('updated_at absent du payload → replie sur celui du record local', () => {
    expect(updatePayloadToPartial({ pdfPath: 'p2', pdfSize: 7 }, record)).toEqual({
      updated_at: record.updatedAt,
      pdf_path: 'p2',
      pdf_size: 7,
    })
  })

  it('édition destinataire (Slice 1b) : recipient_email/recipient_lang partent, statut jamais touché', () => {
    const partial = updatePayloadToPartial(
      {
        recipientEmail: 'neuf@ex.com',
        recipientLang: 'en',
        updatedAt: '2026-07-07T00:00:00.000Z',
      },
      record,
    )
    expect(partial).toEqual({
      updated_at: '2026-07-07T00:00:00.000Z',
      recipient_email: 'neuf@ex.com',
      recipient_lang: 'en',
    })
    expect('status' in partial).toBe(false)
    expect('decided_at' in partial).toBe(false)
  })

  it('édition destinataire : langue seule (adresse inchangée) → seul recipient_lang part', () => {
    const partial = updatePayloadToPartial(
      { recipientLang: 'fr', updatedAt: '2026-07-07T00:00:00.000Z' },
      record,
    )
    expect(partial).toEqual({
      updated_at: '2026-07-07T00:00:00.000Z',
      recipient_lang: 'fr',
    })
    expect('recipient_email' in partial).toBe(false)
  })
})

/** Exécute syncCorrespondences en avançant les backoffs de withRetry (timers factices, IDB réelle). */
async function runSync(orgId: string): Promise<void> {
  vi.useFakeTimers({ toFake: ['setTimeout'] })
  try {
    let settled = false
    const done = syncCorrespondences(orgId).finally(() => {
      settled = true
    })
    while (!settled) {
      // setImmediate RÉEL : laisse fake-indexeddb progresser entre deux avances d'horloge.
      await new Promise((r) => setImmediate(r))
      await vi.advanceTimersByTimeAsync(5000)
    }
    await done
  } finally {
    vi.useRealTimers()
  }
}

describe('syncCorrespondences — push (drainage multi-org)', () => {
  beforeEach(async () => {
    await db.correspondences.clear()
    await db.correspondenceMessages.clear()
    await db.outbox.clear()
    localStorage.clear()
    vi.clearAllMocks()
    upsertCalls.length = 0
  })

  it('pousse et draine correspondance + message de l’org active (nominal, ordre FK respecté)', async () => {
    await db.correspondences.add(record)
    await db.correspondenceMessages.add(message)
    await enqueueOutbox('correspondence', 'c1', 'create', {})
    await enqueueOutbox('correspondence_message', 'm1', 'create', {})

    await runSync('org-1')

    // FK correspondence_messages.correspondence_id → correspondences : le parent part en premier.
    expect(upsertCalls.map((c) => c.table)).toEqual(['correspondences', 'correspondence_messages'])
    expect(await db.outbox.count()).toBe(0)
  })

  it("ne draine PAS les ops d'une AUTRE org (régression : échange agence perdu en silence)", async () => {
    await db.correspondences.add({ ...record, id: 'c2', orgId: 'org-2' })
    await db.correspondenceMessages.add({
      ...message,
      id: 'm2',
      correspondenceId: 'c2',
      orgId: 'org-2',
    })
    await enqueueOutbox('correspondence', 'c2', 'create', {})
    await enqueueOutbox('correspondence_message', 'm2', 'create', {})

    await runSync('org-1')

    expect(upsertCalls).toHaveLength(0)
    expect(await db.outbox.count()).toBe(2)
  })

  it('draine les items orphelins (records locaux disparus) sans rien pousser', async () => {
    await enqueueOutbox('correspondence', 'fantome-c', 'create', {})
    await enqueueOutbox('correspondence_message', 'fantome-m', 'create', {})

    await runSync('org-1')

    expect(upsertCalls).toHaveLength(0)
    expect(await db.outbox.count()).toBe(0)
  })
})
