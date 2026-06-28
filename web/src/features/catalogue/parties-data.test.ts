import { describe, expect, it } from 'vitest'

import type { DocumentRecord, PartyRecord, ProductRecord } from '@/lib/db'
import {
  buildOrgCockpitVm,
  buildOrgRows,
  filterOrgRows,
  productsForParty,
  sortRoles,
} from './parties-data'

const NOW = new Date('2026-06-28T00:00:00.000Z')
/** Date d'expiration relative à NOW (jours). */
const inDays = (n: number) => new Date(NOW.getTime() + n * 86_400_000).toISOString().slice(0, 10)

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
    const rows = buildOrgRows([holder, maker], products, [], NOW)
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
    const row = buildOrgRows([holder], products, docs, NOW)[0]
    expect(row?.docCount).toBe(3)
    expect(row?.countries).toEqual(['BEN', 'CIV'])
  })

  it('agrège la santé de validité (périmée / à renouveler) au niveau organisation', () => {
    const holder = party('holder')
    const products = [product('p1', { titulaireId: 'holder' })]
    const docs = [
      doc('expired', { productId: 'p1', docType: 'gmp', expiryDate: inDays(-5) }), // périmée
      doc('soon', { productId: 'p1', docType: 'amm', expiryDate: inDays(30) }), // fenêtre admin 180j
      doc('ok', { productId: 'p1', docType: 'amm', expiryDate: inDays(400) }), // hors fenêtre
    ]
    const row = buildOrgRows([holder], products, docs, NOW)[0]
    expect(row?.expiredCount).toBe(1)
    expect(row?.expiringCount).toBe(1)
    expect(row?.tone).toBe('poor') // une pièce périmée → rouge
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
      NOW,
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
      NOW,
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

describe('buildOrgCockpitVm (cockpit RA)', () => {
  it('portefeuille AMM par pays : total / active / à renouveler / périmée', () => {
    const holder = party('holder', { roles: ['titulaire'] })
    const products = [
      product('p1', { titulaireId: 'holder' }),
      product('p2', { titulaireId: 'holder' }),
    ]
    const docs = [
      doc('a1', { productId: 'p1', docType: 'amm', country: 'BEN', expiryDate: inDays(400) }), // active
      doc('a2', { productId: 'p1', docType: 'amm', country: 'BEN', expiryDate: inDays(30) }), // à renouveler
      doc('a3', { productId: 'p2', docType: 'amm', country: 'CIV', expiryDate: inDays(-10) }), // périmée
      doc('a4', { productId: 'p2', docType: 'amm', country: 'TGO' }), // sans date → active
    ]
    const vm = buildOrgCockpitVm(holder, products, docs, NOW)
    expect(vm.amm.total).toBe(4)
    expect(vm.amm.expired).toBe(1)
    expect(vm.amm.expiring).toBe(1)
    expect(vm.amm.active).toBe(3) // total - périmées (sans date = active)
    expect(vm.amm.byCountry.map((c) => c.code)).toEqual(['BEN', 'CIV', 'TGO'])
    expect(vm.amm.byCountry.find((c) => c.code === 'BEN')).toMatchObject({
      total: 2,
      active: 2,
      expiring: 1,
    })
  })

  it('validité par type de pièce, la plus urgente en tête', () => {
    const maker = party('maker', { roles: ['fabricant'] })
    const products = [product('p1', { fabricantId: 'maker' })]
    const docs = [
      doc('gmp', { productId: 'p1', docType: 'gmp', expiryDate: inDays(-3) }), // périmée → poor
      doc('coa', { productId: 'p1', docType: 'coa', expiryDate: inDays(900) }), // CoA 18 mois → valide
    ]
    const vm = buildOrgCockpitVm(maker, products, docs, NOW)
    expect(vm.pieces[0]?.docType).toBe('gmp') // la plus urgente d'abord
    expect(vm.pieces[0]?.expired).toBe(1)
    expect(vm.pieces[0]?.tone).toBe('poor')
    const coa = vm.pieces.find((p) => p.docType === 'coa')
    expect(coa?.valid).toBe(1)
    expect(coa?.expiring).toBe(0)
  })
})
