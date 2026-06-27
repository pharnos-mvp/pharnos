import { describe, expect, it } from 'vitest'

import type { DocumentRecord, DossierRecord, ProductRecord } from '@/lib/db'

import { productCockpitVm } from './product-cockpit-data'

const NOW = new Date('2026-06-14T00:00:00Z')
const plus = (days: number) => {
  const d = new Date(NOW)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

const product = (o: Partial<ProductRecord> = {}): ProductRecord => ({
  id: 'p1',
  orgId: 'o1',
  nomCommercial: 'Amoxicilline',
  dci: '',
  dosage: '',
  forme: '',
  presentation: '',
  classeTherapeutique: '',
  codeAtc: '',
  titulaire: '',
  fabricant: '',
  createdAt: '2026-01-01',
  updatedAt: '2026-01-01',
  deletedAt: null,
  ...o,
})

const doc = (o: Partial<DocumentRecord> = {}): DocumentRecord => ({
  id: 'd1',
  orgId: 'o1',
  productId: 'p1',
  category: 'admin',
  docType: 'gmp',
  fileName: 'f.pdf',
  mimeType: 'application/pdf',
  size: 1,
  language: 'fr',
  expiryDate: null,
  status: 'ok',
  filePath: null,
  uploaded: false,
  createdAt: '2026-01-01',
  updatedAt: '2026-01-01',
  deletedAt: null,
  ...o,
})

const dossier = (o: Partial<DossierRecord> = {}): DossierRecord => ({
  id: 'dos1',
  orgId: 'o1',
  productId: 'p1',
  productName: 'Amoxicilline',
  format: 'ctd',
  activity: 'new_ma',
  country: 'CI',
  status: 'draft',
  tree: [],
  excludedDocIds: [],
  createdAt: '2026-01-01',
  updatedAt: '2026-01-01',
  deletedAt: null,
  ...o,
})

describe('productCockpitVm', () => {
  it('produit nu : aucun pays, aucune AMM, rien à renouveler', () => {
    const vm = productCockpitVm(product(), [], [], NOW)
    expect(vm.countries).toEqual([])
    expect(vm.hasAmm).toBe(false)
    expect(vm.ammActive).toBe(false)
    expect(vm.expiring).toEqual([])
  })

  it('pays distincts dérivés des dossiers', () => {
    const vm = productCockpitVm(
      product(),
      [],
      [
        dossier({ id: 'a', country: 'CI' }),
        dossier({ id: 'b', country: 'CI' }),
        dossier({ id: 'c', country: 'SN' }),
      ],
      NOW,
    )
    expect([...vm.countries].sort()).toEqual(['CI', 'SN'])
  })

  it("AMM sans date d'expiration = active", () => {
    const vm = productCockpitVm(product(), [doc({ docType: 'amm', expiryDate: null })], [], NOW)
    expect(vm.hasAmm).toBe(true)
    expect(vm.ammActive).toBe(true)
  })

  it('AMM expirée = présente mais non active', () => {
    const vm = productCockpitVm(product(), [doc({ docType: 'amm', expiryDate: plus(-1) })], [], NOW)
    expect(vm.hasAmm).toBe(true)
    expect(vm.ammActive).toBe(false)
  })

  it('GMP à 60 j entre dans la fenêtre de renouvellement', () => {
    const vm = productCockpitVm(product(), [doc({ docType: 'gmp', expiryDate: plus(60) })], [], NOW)
    expect(vm.expiring).toHaveLength(1)
  })
})
