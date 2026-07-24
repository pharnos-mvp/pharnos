import { beforeEach, describe, expect, it } from 'vitest'

import { db } from '@/lib/db'
import {
  addDocument,
  addPartyDocument,
  deleteDocument,
  getDocumentBlob,
  listDocuments,
  updateDocumentDates,
} from './documents-repository'

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

  it('addPartyDocument : document ORG-scopé (partyId, productId vide) + blob + outbox', async () => {
    const d = await addPartyDocument(ORG, 'party-1', {
      category: 'admin',
      docType: 'gmp',
      file: makeFile(),
      expiryDate: '2027-01-01',
    })
    expect(d.partyId).toBe('party-1')
    expect(d.productId).toBe('')
    expect(await getDocumentBlob(d.id)).toBeDefined()
    expect(await db.outbox.where('entity').equals('document').count()).toBe(1)
    // Pas dans les documents d'un produit (propriétaire unique).
    expect(await listDocuments('party-1')).toHaveLength(0)
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

describe('updateDocumentDates', () => {
  it('corrige les dates, bumpe updatedAt et met un `update` en file', async () => {
    const d = await addDocument(ORG, PRODUCT, {
      category: 'admin',
      docType: 'gmp',
      file: makeFile(),
      expiryDate: '2027-01-01',
    })
    await db.outbox.clear() // isole l'op de correction du `create` initial

    await updateDocumentDates(d.id, { issueDate: '2026-01-15', expiryDate: '2028-06-30' })

    const after = await db.documents.get(d.id)
    expect(after?.issueDate).toBe('2026-01-15')
    expect(after?.expiryDate).toBe('2028-06-30')
    expect((after?.updatedAt ?? '') >= d.updatedAt).toBe(true)
    const outbox = await db.outbox.where('entity').equals('document').toArray()
    expect(outbox).toHaveLength(1)
    expect(outbox[0]?.op).toBe('update')
    expect(outbox[0]?.entityId).toBe(d.id)
  })

  it('vider une date la remet à null (et non chaîne vide)', async () => {
    const d = await addDocument(ORG, PRODUCT, {
      category: 'admin',
      docType: 'gmp',
      file: makeFile(),
      expiryDate: '2027-01-01',
      issueDate: '2026-01-01',
    })
    await updateDocumentDates(d.id, { issueDate: null, expiryDate: '2027-01-01' })
    expect((await db.documents.get(d.id))?.issueDate).toBeNull()
  })

  it('pièce SUPPRIMÉE : aucune écriture, aucune op en file', async () => {
    const d = await addDocument(ORG, PRODUCT, {
      category: 'admin',
      docType: 'gmp',
      file: makeFile(),
      expiryDate: '2027-01-01',
    })
    await deleteDocument(d.id)
    await db.outbox.clear()

    await updateDocumentDates(d.id, { issueDate: '2026-01-15', expiryDate: '2028-06-30' })

    expect((await db.documents.get(d.id))?.expiryDate).toBe('2027-01-01')
    expect(await db.outbox.where('entity').equals('document').count()).toBe(0)
  })

  it('AMM : édite le PAYS quand il est fourni (cartes AMM par pays)', async () => {
    const d = await addDocument(ORG, PRODUCT, {
      category: 'admin',
      docType: 'amm',
      file: makeFile(),
      expiryDate: '2028-01-01',
      country: null,
    })
    await updateDocumentDates(d.id, {
      issueDate: null,
      expiryDate: '2028-01-01',
      country: 'CI',
    })
    expect((await db.documents.get(d.id))?.country).toBe('CI')
  })

  it('pays INTACT quand il n’est pas fourni (édition d’un autre type de pièce)', async () => {
    const d = await addDocument(ORG, PRODUCT, {
      category: 'admin',
      docType: 'amm',
      file: makeFile(),
      expiryDate: '2028-01-01',
      country: 'SN',
    })
    // Pas de `country` dans le patch → le champ ne doit pas être touché.
    await updateDocumentDates(d.id, { issueDate: '2026-01-15', expiryDate: '2028-01-01' })
    expect((await db.documents.get(d.id))?.country).toBe('SN')
  })
})
