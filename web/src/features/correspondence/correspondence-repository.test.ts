import { beforeEach, describe, expect, it } from 'vitest'

import { db } from '@/lib/db'
import {
  appendSenderMessage,
  createCorrespondence,
  getShareLink,
  listByDossier,
  listCorrespondences,
  listMessages,
  revokeCorrespondence,
} from './correspondence-repository'

const ORG = 'org-1'

const input = {
  dossierId: 'd1',
  productName: 'Doliprane',
  country: 'CI',
  activity: 'new_ma',
  senderEmail: 'labo@ex.com',
  recipientEmail: 'agence@ex.com',
  note: 'Merci de déposer sous 15 jours.',
  pdfPath: `${ORG}/shares/x/module1.pdf`,
  pdfSize: 12345,
  tokenHash: 'a'.repeat(64),
  passwordHash: null,
  shareUrl: 'http://localhost:5173/r/tok',
}

beforeEach(async () => {
  await Promise.all([
    db.correspondences.clear(),
    db.correspondenceMessages.clear(),
    db.shareLinks.clear(),
    db.outbox.clear(),
  ])
})

describe('correspondence repository (offline-first)', () => {
  it('crée l’envoi : correspondance in_review + message note + lien local + outbox', async () => {
    const c = await createCorrespondence(ORG, input)

    expect(c.status).toBe('in_review')
    expect(await listCorrespondences(ORG)).toHaveLength(1)
    expect(await listByDossier('d1')).toHaveLength(1)

    const messages = await listMessages(c.id)
    expect(messages).toHaveLength(1)
    expect(messages[0]).toMatchObject({ kind: 'note', author: 'sender', body: input.note })

    // Le lien en clair ne vit QUE localement (jamais dans l'outbox → jamais sur le serveur).
    expect((await getShareLink(c.id))?.url).toBe(input.shareUrl)
    const outbox = await db.outbox.toArray()
    expect(outbox.map((o) => o.entity).sort()).toEqual([
      'audit',
      'correspondence',
      'correspondence_message',
    ])
    expect(JSON.stringify(outbox)).not.toContain('/r/tok')
  })

  it('sans note : aucun message créé', async () => {
    const c = await createCorrespondence(ORG, { ...input, note: '   ' })
    expect(await listMessages(c.id)).toHaveLength(0)
  })

  it('réponse du labo : message comment horodaté + outbox (offline-first)', async () => {
    const c = await createCorrespondence(ORG, { ...input, note: null })
    const m = await appendSenderMessage(c, 'labo@ex.com', '  Bien reçu, merci.  ')
    expect(m).toMatchObject({ kind: 'comment', author: 'sender', body: 'Bien reçu, merci.' })
    expect(await appendSenderMessage(c, 'labo@ex.com', '   ')).toBeNull()
    expect(await listMessages(c.id)).toHaveLength(1)
  })

  it('révocation : revokedAt posé + outbox update PARTIEL (jamais status)', async () => {
    const c = await createCorrespondence(ORG, input)
    await db.outbox.clear()
    await revokeCorrespondence(c.id)

    const updated = await db.correspondences.get(c.id)
    expect(updated?.revokedAt).toBeTruthy()
    const outbox = await db.outbox.where('entity').equals('correspondence').toArray()
    expect(outbox).toHaveLength(1)
    expect(outbox[0]?.op).toBe('update')
    // Payload partiel : ne contient PAS status → ne peut pas écraser une décision concurrente.
    expect(Object.keys(outbox[0]?.payload ?? {}).sort()).toEqual(['id', 'revokedAt', 'updatedAt'])

    // Idempotent : re-révoquer ne ré-émet rien.
    await db.outbox.clear()
    await revokeCorrespondence(c.id)
    expect(await db.outbox.count()).toBe(0)
  })

  it('messages triés chronologiquement par l’index composé', async () => {
    const c = await createCorrespondence(ORG, { ...input, note: null })
    await db.correspondenceMessages.bulkAdd([
      {
        id: 'm2',
        orgId: ORG,
        correspondenceId: c.id,
        author: 'recipient',
        authorLabel: 'agence@ex.com',
        kind: 'decision',
        decision: 'suspended',
        body: 'Échantillons manquants.',
        attachments: [],
        createdAt: '2026-06-13T10:00:00.000Z',
      },
      {
        id: 'm1',
        orgId: ORG,
        correspondenceId: c.id,
        author: 'sender',
        authorLabel: 'labo@ex.com',
        kind: 'comment',
        decision: null,
        body: 'Bonjour',
        attachments: [],
        createdAt: '2026-06-12T10:00:00.000Z',
      },
    ])
    const messages = await listMessages(c.id)
    expect(messages.map((m) => m.id)).toEqual(['m1', 'm2'])
  })
})
