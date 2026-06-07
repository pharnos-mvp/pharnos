import { beforeEach, describe, expect, it } from 'vitest'

import { db } from '@/lib/db'
import {
  addAttachment,
  deleteAttachment,
  getAttachmentBlob,
  listAttachments,
} from './dossier-attachments-repository'

const ORG = 'org-1'

function makeFile(name = 'preuve.pdf') {
  return new File(['contenu du fichier'], name, { type: 'application/pdf' })
}

beforeEach(async () => {
  await db.dossierAttachments.clear()
  await db.documentBlobs.clear()
  await db.outbox.clear()
})

describe('dossier attachments repository (offline-first)', () => {
  it('téléverse une pièce jointe sur un nœud (blob local + outbox)', async () => {
    const a = await addAttachment(ORG, 'd1', '1.1.1', makeFile())
    expect(a.nodeNumber).toBe('1.1.1')
    expect(a.uploaded).toBe(false)
    expect(await listAttachments('d1')).toHaveLength(1)
    expect(await getAttachmentBlob(a.id)).toBeDefined()
    const outbox = await db.outbox.where('entity').equals('dossier_attachment').toArray()
    expect(outbox[0]?.op).toBe('create')
  })

  it('supprime (soft delete)', async () => {
    const a = await addAttachment(ORG, 'd1', '1.1.1', makeFile())
    await deleteAttachment(a.id)
    expect(await listAttachments('d1')).toHaveLength(0)
  })
})
