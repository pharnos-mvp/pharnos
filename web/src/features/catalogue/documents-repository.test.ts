import { beforeEach, describe, expect, it } from 'vitest'

import { db } from '@/lib/db'
import { addDocument, deleteDocument, getDocumentBlob, listDocuments } from './documents-repository'

const ORG = 'org-1'
const PRODUCT = 'prod-1'

function makeFile(name = 'rcp.pdf', type = 'application/pdf') {
  return new File([new Uint8Array([1, 2, 3, 4])], name, { type })
}

beforeEach(async () => {
  await db.documents.clear()
  await db.documentBlobs.clear()
  await db.outbox.clear()
})

describe('documents repository (offline-first)', () => {
  it('ajoute un document : métadonnées + blob local + outbox', async () => {
    const d = await addDocument(ORG, PRODUCT, {
      category: 'admin',
      docType: 'gmp',
      file: makeFile(),
      expiryDate: '2027-01-01',
    })

    expect(d.id).toBeTruthy()
    expect(d.uploaded).toBe(false)
    expect(d.expiryDate).toBe('2027-01-01')
    expect(await listDocuments(PRODUCT)).toHaveLength(1)
    // Le blob est stocké/restituable. (Le type Blob exact n'est garanti que dans un vrai
    // navigateur ; fake-indexeddb ne préserve pas l'instance Blob via structured clone.)
    expect(await getDocumentBlob(d.id)).toBeDefined()

    const outbox = await db.outbox.where('entity').equals('document').toArray()
    expect(outbox).toHaveLength(1)
    expect(outbox[0]?.op).toBe('create')
  })

  it('filtre les documents par catégorie', async () => {
    await addDocument(ORG, PRODUCT, { category: 'info', docType: 'rcp', file: makeFile() })
    await addDocument(ORG, PRODUCT, { category: 'admin', docType: 'amm', file: makeFile() })

    expect(await listDocuments(PRODUCT, 'info')).toHaveLength(1)
    expect(await listDocuments(PRODUCT, 'admin')).toHaveLength(1)
    expect(await listDocuments(PRODUCT)).toHaveLength(2)
  })

  it('supprime (soft delete) un document', async () => {
    const d = await addDocument(ORG, PRODUCT, {
      category: 'info',
      docType: 'notice',
      file: makeFile(),
    })
    await deleteDocument(d.id)
    expect(await listDocuments(PRODUCT)).toHaveLength(0)
  })
})
