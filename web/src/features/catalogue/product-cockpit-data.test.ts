import { describe, expect, it } from 'vitest'

import type { RegafyFinding } from '@/features/workspace/regafy'
import type {
  AuditLogRecord,
  DocAnalysisRecord,
  DocumentRecord,
  DossierRecord,
  ProductRecord,
} from '@/lib/db'

import { productCockpitVm, productConformity, productHistory } from './product-cockpit-data'

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

const audit = (o: Partial<AuditLogRecord> = {}): AuditLogRecord => ({
  id: 'a1',
  orgId: 'o1',
  actorId: 'u1',
  actorEmail: 'u@lab.com',
  entity: 'product',
  entityId: 'p1',
  action: 'update',
  label: 'Amoxicilline',
  at: '2026-06-01',
  ...o,
})

const analysis = (o: Partial<DocAnalysisRecord> = {}): DocAnalysisRecord => ({
  docId: 'd1',
  sig: '2026-01-01',
  findings: [],
  analyzedAt: '2026-06-01',
  ...o,
})

const finding = (o: Partial<RegafyFinding> = {}): RegafyFinding => ({
  id: 'f1',
  nodeNumber: '1.3.1',
  nodeLabel: 'RCP',
  severity: 'warning',
  message: 'msg',
  ...o,
})

describe('productHistory', () => {
  it('garde les entrées liées au produit/docs/dossiers, récentes d’abord', () => {
    const log = [
      audit({ id: 'a1', entityId: 'p1', at: '2026-06-01' }),
      audit({ id: 'a2', entityId: 'd1', at: '2026-06-03' }),
      audit({ id: 'a3', entityId: 'autre', at: '2026-06-05' }),
    ]
    const r = productHistory(log, new Set(['p1', 'd1']))
    expect(r.map((x) => x.id)).toEqual(['a2', 'a1'])
  })
})

describe('productConformity', () => {
  it('classe chaque document + calcule le taux', () => {
    const c = productConformity(
      [doc({ id: 'd1' }), doc({ id: 'd2' }), doc({ id: 'd3' })],
      [
        analysis({ docId: 'd1', findings: [finding({ upgrade: true })] }),
        analysis({ docId: 'd2', findings: [finding({ ok: true, severity: 'info' })] }),
      ],
    )
    expect(c.analyzed).toBe(2)
    expect(c.nonConform).toBe(1)
    expect(c.notAnalyzed).toBe(1)
    expect(c.pct).toBe(50)
    const byId = Object.fromEntries(c.perDoc.map((x) => [x.docId, x.status]))
    expect(byId.d1).toBe('nonconform')
    expect(byId.d2).toBe('conform')
    expect(byId.d3).toBe('unanalyzed')
  })
})
