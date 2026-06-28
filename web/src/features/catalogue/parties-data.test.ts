import { describe, expect, it } from 'vitest'

import type { DocumentRecord, PartyRecord, ProductRecord } from '@/lib/db'
import { buildOrgRows, filterOrgRows, productsForParty, sortRoles } from './parties-data'

const party = (id: string, over: Partial<PartyRecord> = {}): PartyRecord => ({
  id,
  orgId: 'org-1',
  nom: id,
  roles: ['titulaire'],
  pays: '',
  adresse: '',
  gmpCertificat: '',
  gmpExpiry: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  deletedAt: null,
  ...over,
})

const product = (id: string, over: Partial<ProductRecord> = {}): ProductRecord => ({
  id,
  orgId: 'org-1',
  nomCommercial: id,
  dci: 'x',
  dosage: '',
  forme: '',
  presentation: '',
  classeTherapeutique: '',
  codeAtc: '',
  titulaire: '',
  fabricant: '',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  deletedAt: null,
  ...over,
})

const doc = (id: string, over: Partial<DocumentRecord> = {}): DocumentRecord => ({
  id,
  orgId: 'org-1',
  productId: 'p1',
  category: 'admin',
  docType: 'amm',
  fileName: 'f',
  mimeType: '',
  size: 0,
  language: null,
  expiryDate: null,
  status: 'active',
  filePath: null,
  uploaded: false,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  deletedAt: null,
  ...over,
})

describe('parties-data (agrégations par organisation)', () => {
  it('compte les produits liés par titulaire OU fabricant, sans doublon', () => {
    const holder = party('holder', { nom: 'Holder' })
    const maker = party('maker', { nom: 'Maker', roles: ['fabricant'] })
    const products = [
      product('p1', { titulaireId: 'holder', fabricantId: 'maker' }),
      product('p2', { titulaireId: 'holder' }),
      product('p3', { deletedAt: '2026-02-01T00:00:00.000Z', titulaireId: 'holder' }), // supprimé
    ]
    const rows = buildOrgRows([holder, maker], products, [])
    expect(rows.find((r) => r.party.id === 'holder')?.productCount).toBe(2)
    expect(rows.find((r) => r.party.id === 'maker')?.productCount).toBe(1)
  })

  it('compte les documents des produits liés et agrège les pays (AMM), distincts', () => {
    const holder = party('holder')
    const products = [product('p1', { titulaireId: 'holder' })]
    const docs = [
      doc('d1', { productId: 'p1', country: 'BEN' }),
      doc('d2', { productId: 'p1', country: 'BEN' }),
      doc('d3', { productId: 'p1', country: 'CIV' }),
      doc('d4', { productId: 'p1', deletedAt: '2026-02-01T00:00:00.000Z' }), // supprimé → exclu
      doc('d5', { productId: 'other' }), // produit non lié → exclu
    ]
    const row = buildOrgRows([holder], products, docs)[0]
    expect(row?.docCount).toBe(3)
    expect(row?.countries).toEqual(['BEN', 'CIV'])
  })

  it('exclut les organisations supprimées et trie par nom', () => {
    const rows = buildOrgRows(
      [
        party('b', { nom: 'Beta' }),
        party('a', { nom: 'Alpha' }),
        party('z', { nom: 'Zeta', deletedAt: '2026-02-01T00:00:00.000Z' }),
      ],
      [],
      [],
    )
    expect(rows.map((r) => r.party.nom)).toEqual(['Alpha', 'Beta'])
  })

  it('productsForParty ignore les produits supprimés', () => {
    const products = [
      product('p1', { titulaireId: 'h' }),
      product('p2', { fabricantId: 'h' }),
      product('p3', { titulaireId: 'h', deletedAt: '2026-02-01T00:00:00.000Z' }),
    ]
    expect(productsForParty('h', products).map((p) => p.id)).toEqual(['p1', 'p2'])
  })

  it('filtre par nom / pays / rôle', () => {
    const rows = buildOrgRows(
      [
        party('h', { nom: 'Synthia Labs', pays: 'DE', roles: ['titulaire'] }),
        party('m', { nom: 'Aura Lifecare', pays: 'IN', roles: ['fabricant'] }),
      ],
      [],
      [],
    )
    expect(filterOrgRows(rows, 'synthia').map((r) => r.party.id)).toEqual(['h'])
    expect(filterOrgRows(rows, 'fabricant').map((r) => r.party.id)).toEqual(['m'])
    expect(filterOrgRows(rows, 'IN').map((r) => r.party.id)).toEqual(['m'])
    expect(filterOrgRows(rows, '')).toHaveLength(2)
  })

  it('sortRoles : titulaire avant fabricant avant distributeur', () => {
    expect(sortRoles(['distributeur', 'fabricant', 'titulaire'])).toEqual([
      'titulaire',
      'fabricant',
      'distributeur',
    ])
  })
})
