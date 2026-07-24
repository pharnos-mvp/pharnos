import { beforeEach, describe, expect, it } from 'vitest'

import { db } from '@/lib/db'
import { addDocument, addPartyDocument, getDocumentBlob } from './documents-repository'
import { copyDocumentToProduct, listPartyDocs, sourcePartyIdsFor } from './documents-reuse'

const ORG = 'org-1'
const PRODUCT = 'prod-1'
const MAH = 'party-mah'
const FAB = 'party-fab'

function makeFile(name = 'rcp.pdf', type = 'application/pdf') {
  return new File([new Uint8Array([1, 2, 3, 4])], name, { type })
}

beforeEach(async () => {
  await db.documents.clear()
  await db.documentBlobs.clear()
  await db.outbox.clear()
})

describe('sourcePartyIdsFor — mapping CEO §2', () => {
  it('docs d’information + AMM → base du titulaire', () => {
    expect(sourcePartyIdsFor('rcp', MAH, FAB)).toEqual([MAH])
    expect(sourcePartyIdsFor('amm', MAH, FAB)).toEqual([MAH])
  })

  it('pièces admin → base du fabricant ; contrat → les deux', () => {
    expect(sourcePartyIdsFor('gmp', MAH, FAB)).toEqual([FAB])
    expect(sourcePartyIdsFor('coa', MAH, FAB)).toEqual([FAB])
    expect(sourcePartyIdsFor('contract', MAH, FAB)).toEqual([MAH, FAB])
  })

  it('rôles cumulés (même org) → dédupliqué ; partie absente → filtrée', () => {
    expect(sourcePartyIdsFor('contract', MAH, MAH)).toEqual([MAH])
    expect(sourcePartyIdsFor('gmp', MAH, null)).toEqual([])
    expect(sourcePartyIdsFor('rcp', null, FAB)).toEqual([])
  })
})

describe('listPartyDocs — base piochable', () => {
  it('ne retourne que les docs ORG-scopés actifs des parties demandées', async () => {
    await addPartyDocument(ORG, MAH, { category: 'info', docType: 'rcp', file: makeFile() })
    await addPartyDocument(ORG, FAB, {
      category: 'admin',
      docType: 'gmp',
      file: makeFile('gmp.pdf'),
      expiryDate: '2027-01-01',
    })
    // Doc PRODUIT (pas org-scopé) : jamais une source.
    await addDocument(ORG, PRODUCT, { category: 'info', docType: 'rcp', file: makeFile() })

    const mahDocs = await listPartyDocs(ORG, [MAH])
    expect(mahDocs).toHaveLength(1)
    expect(mahDocs[0]?.docType).toBe('rcp')
    expect(await listPartyDocs(ORG, [MAH, FAB])).toHaveLength(2)
    expect(await listPartyDocs(ORG, [])).toHaveLength(0)
  })
})

describe('copyDocumentToProduct — copie liée', () => {
  it('copie blob + métadonnées et pose la provenance sourceDocId', async () => {
    const src = await addPartyDocument(ORG, FAB, {
      category: 'admin',
      docType: 'gmp',
      file: makeFile('gmp.pdf'),
      expiryDate: '2027-01-01',
      issueDate: '2025-01-01',
      reference: 'GMP-42',
    })

    const copy = await copyDocumentToProduct(ORG, PRODUCT, src.id)

    expect(copy.id).not.toBe(src.id)
    expect(copy.productId).toBe(PRODUCT)
    expect(copy.partyId).toBeNull()
    expect(copy.sourceDocId).toBe(src.id)
    expect(copy.docType).toBe('gmp')
    expect(copy.expiryDate).toBe('2027-01-01')
    expect(copy.issueDate).toBe('2025-01-01')
    expect(copy.reference).toBe('GMP-42')
    expect(copy.fileName).toBe('gmp.pdf')
    expect(copy.uploaded).toBe(false) // le blob copié repart par l'outbox (chemin produit)
    // Blob DUPLIQUÉ : la copie a le sien, la source garde le sien.
    expect(await getDocumentBlob(copy.id)).toBeDefined()
    expect(await getDocumentBlob(src.id)).toBeDefined()
  })

  it('catégorie CANONIQUE du type : une COA legacy `info` redevient admin à la copie', async () => {
    const src = await addPartyDocument(ORG, FAB, {
      category: 'info', // legacy pré-#252
      docType: 'coa',
      file: makeFile('coa.pdf'),
      expiryDate: '2027-01-01',
    })
    const copy = await copyDocumentToProduct(ORG, PRODUCT, src.id)
    expect(copy.category).toBe('admin')
  })

  it('refuse une source supprimée ou d’une autre org', async () => {
    const src = await addPartyDocument(ORG, FAB, {
      category: 'admin',
      docType: 'gmp',
      file: makeFile(),
      expiryDate: '2027-01-01',
    })
    await expect(copyDocumentToProduct('org-2', PRODUCT, src.id)).rejects.toThrow()
    await db.documents.update(src.id, { deletedAt: new Date().toISOString() })
    await expect(copyDocumentToProduct(ORG, PRODUCT, src.id)).rejects.toThrow()
  })

  it('blob absent en local ET pas de filePath → erreur explicite (hors-ligne)', async () => {
    const src = await addPartyDocument(ORG, FAB, {
      category: 'admin',
      docType: 'gmp',
      file: makeFile(),
      expiryDate: '2027-01-01',
    })
    await db.documentBlobs.delete(src.id) // simule un cache purgé, doc jamais téléversé
    await expect(copyDocumentToProduct(ORG, PRODUCT, src.id)).rejects.toThrow()
  })
})
