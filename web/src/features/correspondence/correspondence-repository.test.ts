import { beforeEach, describe, expect, it } from 'vitest'

import { db } from '@/lib/db'
import {
  appendSenderMessage,
  createCorrespondence,
  decideCorrespondenceInApp,
  getShareLink,
  listByDossier,
  listCorrespondences,
  listMessages,
  listMessagesByDossier,
  reopenCorrespondenceForReview,
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

  it('reopen (M4) : status→in_review, décision levée, lien ré-armé + outbox EXPLICITE + note du fil', async () => {
    const c = await createCorrespondence(ORG, { ...input, note: null })
    // Décision rendue avec lien auto-révoqué (autoRevokeOnDecision) — le cul-de-sac d'avant M4.
    await db.correspondences.update(c.id, {
      status: 'suspended',
      decidedAt: '2026-06-05T00:00:00.000Z',
      revokedAt: '2026-06-05T00:00:00.000Z',
    })
    await db.outbox.clear()

    await reopenCorrespondenceForReview(c.id, 'labo@ex.com')

    const updated = await db.correspondences.get(c.id)
    expect(updated?.status).toBe('in_review')
    expect(updated?.decidedAt).toBeNull()
    expect(updated?.revokedAt).toBeNull()

    // Mutation partielle EXPLICITE : status/decidedAt/revokedAt embarqués (acte gestionnaire).
    const outbox = await db.outbox.where('entity').equals('correspondence').toArray()
    expect(outbox).toHaveLength(1)
    expect(outbox[0]?.op).toBe('update')
    expect(Object.keys(outbox[0]?.payload ?? {}).sort()).toEqual([
      'decidedAt',
      'id',
      'revokedAt',
      'status',
      'updatedAt',
    ])

    // Le renvoi est tracé dans le fil (append-only) ; la décision précédente y reste.
    const messages = await listMessages(c.id)
    expect(messages.at(-1)).toMatchObject({ kind: 'note', author: 'sender' })
  })

  it('reopen : no-op si déjà en revue ; withNote:false ne double pas la note (flux resend)', async () => {
    const c = await createCorrespondence(ORG, { ...input, note: null })
    await db.outbox.clear()
    await reopenCorrespondenceForReview(c.id, 'labo@ex.com') // déjà in_review → no-op
    expect(await db.outbox.count()).toBe(0)

    await db.correspondences.update(c.id, { status: 'rejected' })
    await reopenCorrespondenceForReview(c.id, 'labo@ex.com', { withNote: false })
    expect((await db.correspondences.get(c.id))?.status).toBe('in_review')
    expect(await listMessages(c.id)).toHaveLength(0)
  })

  it('décision in-app (M4-T3) : status + decidedAt + message decision author=sender + outbox', async () => {
    const c = await createCorrespondence(ORG, { ...input, note: null })
    await db.outbox.clear()

    await decideCorrespondenceInApp(c.id, 'labo@ex.com', 'suspended', ' Pièces manquantes. ')

    const updated = await db.correspondences.get(c.id)
    expect(updated?.status).toBe('suspended')
    expect(updated?.decidedAt).toBeTruthy()
    expect(updated?.revokedAt).toBeNull() // autoRevokeOnDecision false → lien intact

    // Miroir du chemin Edge : la décision vit dans le fil (append-only), author='sender' (RLS 0028).
    const messages = await listMessages(c.id)
    expect(messages.at(-1)).toMatchObject({
      kind: 'decision',
      decision: 'suspended',
      author: 'sender',
      body: 'Pièces manquantes.',
    })

    // Mutation partielle EXPLICITE (status/decidedAt présents ; revokedAt ABSENT sans auto-revoke).
    const outbox = await db.outbox.where('entity').equals('correspondence').toArray()
    expect(outbox).toHaveLength(1)
    expect(Object.keys(outbox[0]?.payload ?? {}).sort()).toEqual([
      'decidedAt',
      'id',
      'status',
      'updatedAt',
    ])
  })

  it('décision in-app : autoRevokeOnDecision → le lien tokenisé se révoque (comme l’Edge)', async () => {
    const c = await createCorrespondence(ORG, { ...input, autoRevokeOnDecision: true })
    await db.outbox.clear()

    await decideCorrespondenceInApp(c.id, 'labo@ex.com', 'accepted')

    expect((await db.correspondences.get(c.id))?.revokedAt).toBeTruthy()
    const outbox = await db.outbox.where('entity').equals('correspondence').toArray()
    expect((outbox[0]?.payload as Record<string, unknown>).revokedAt).toBeTruthy()
  })

  it('décision in-app : no-op si la correspondance est déjà décidée (réviser = reopen d’abord)', async () => {
    const c = await createCorrespondence(ORG, { ...input, note: null })
    await decideCorrespondenceInApp(c.id, 'labo@ex.com', 'rejected')
    await db.outbox.clear()

    await decideCorrespondenceInApp(c.id, 'labo@ex.com', 'accepted')

    expect((await db.correspondences.get(c.id))?.status).toBe('rejected')
    expect(await db.outbox.count()).toBe(0)
  })

  it('boucle complète : décision → reopen → nouvelle décision (chaque acte tracé au fil)', async () => {
    const c = await createCorrespondence(ORG, { ...input, note: null })
    await decideCorrespondenceInApp(c.id, 'labo@ex.com', 'suspended')
    await reopenCorrespondenceForReview(c.id, 'labo@ex.com')
    await decideCorrespondenceInApp(c.id, 'labo@ex.com', 'accepted')

    expect((await db.correspondences.get(c.id))?.status).toBe('accepted')
    const kinds = (await listMessages(c.id)).map(
      (m) => `${m.kind}${m.decision ? `:${m.decision}` : ''}`,
    )
    expect(kinds).toEqual(['decision:suspended', 'note', 'decision:accepted'])
  })

  it('listMessagesByDossier : agrège les fils de toutes les correspondances du dossier', async () => {
    const c1 = await createCorrespondence(ORG, { ...input, note: 'envoi 1' })
    const c2 = await createCorrespondence(ORG, { ...input, note: 'envoi 2' })
    const other = await createCorrespondence(ORG, { ...input, dossierId: 'd2', note: 'autre' })
    const all = await listMessagesByDossier('d1')
    expect(all.map((m) => m.correspondenceId).sort()).toEqual([c1.id, c2.id].sort())
    expect(all.some((m) => m.correspondenceId === other.id)).toBe(false)
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
