import { describe, expect, it } from 'vitest'

import type { CorrespondenceMessageRecord, CorrespondenceRecord } from '@/lib/db'
import {
  correspondenceToRow,
  messageToRow,
  rowToCorrespondence,
  rowToMessage,
  updatePayloadToPartial,
} from './correspondence-sync'

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
