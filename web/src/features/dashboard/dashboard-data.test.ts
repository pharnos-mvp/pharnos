import { describe, expect, it } from 'vitest'

import type { RegafyFinding } from '@/features/workspace/regafy'
import type {
  CorrespondenceMessageRecord,
  CorrespondenceRecord,
  DocAnalysisRecord,
  DocumentRecord,
  DossierRecord,
  ProductRecord,
} from '@/lib/db'

import {
  buildActions,
  expiryStatus,
  isNonConform,
  type DashboardInput,
} from './dashboard-data'

const NOW = new Date('2026-06-14T00:00:00Z')
const plus = (days: number) => {
  const d = new Date(NOW)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

const product = (over: Partial<ProductRecord> = {}): ProductRecord => ({
  id: 'p1',
  orgId: 'o1',
  nomCommercial: 'Gynoril',
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
  ...over,
})

const doc = (over: Partial<DocumentRecord> = {}): DocumentRecord => ({
  id: 'd1',
  orgId: 'o1',
  productId: 'p1',
  category: 'admin',
  docType: 'gmp',
  fileName: 'gmp.pdf',
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
  ...over,
})

const dossier = (over: Partial<DossierRecord> = {}): DossierRecord => ({
  id: 'dos1',
  orgId: 'o1',
  productId: 'p1',
  productName: 'Gynoril',
  format: 'ctd',
  activity: 'new_ma',
  country: 'CI',
  status: 'draft',
  tree: [],
  excludedDocIds: [],
  createdAt: '2026-01-01',
  updatedAt: '2026-01-01',
  deletedAt: null,
  ...over,
})

const corr = (over: Partial<CorrespondenceRecord> = {}): CorrespondenceRecord => ({
  id: 'c1',
  orgId: 'o1',
  dossierId: 'dos1',
  productName: 'Gynoril',
  country: 'CI',
  activity: 'new_ma',
  senderEmail: 's@lab.com',
  recipientEmail: 'a@agence.ci',
  note: null,
  pdfPath: 'o1/shares/c1/m1.pdf',
  pdfSize: 1,
  tokenHash: 'h',
  passwordHash: null,
  status: 'in_review',
  decidedAt: null,
  revokedAt: null,
  expiresAt: null,
  autoRevokeOnDecision: true,
  createdAt: '2026-06-01T10:00:00Z',
  updatedAt: '2026-06-01T10:00:00Z',
  deletedAt: null,
  ...over,
})

const msg = (over: Partial<CorrespondenceMessageRecord> = {}): CorrespondenceMessageRecord => ({
  id: 'm1',
  orgId: 'o1',
  correspondenceId: 'c1',
  author: 'recipient',
  authorLabel: 'a@agence.ci',
  kind: 'comment',
  decision: null,
  body: 'Bonjour',
  attachments: [],
  createdAt: '2026-06-10T10:00:00Z',
  ...over,
})

const analysis = (over: Partial<DocAnalysisRecord> = {}): DocAnalysisRecord => ({
  docId: 'd1',
  sig: '2026-01-01',
  findings: [],
  analyzedAt: '2026-06-01',
  ...over,
})

const finding = (over: Partial<RegafyFinding> = {}): RegafyFinding => ({
  id: 'f1',
  nodeNumber: '1.3.1',
  nodeLabel: 'RCP',
  severity: 'warning',
  message: 'msg',
  ...over,
})

const emptyInput = (over: Partial<DashboardInput> = {}): DashboardInput => ({
  products: [],
  documents: [],
  dossiers: [],
  correspondences: [],
  messages: [],
  reads: [],
  docAnalysis: [],
  ...over,
})

describe('expiryStatus', () => {
  it('classe expiré / bientôt (≤90 j) / valide', () => {
    expect(expiryStatus(plus(-1), NOW)).toBe('expired')
    expect(expiryStatus(plus(30), NOW)).toBe('soon')
    expect(expiryStatus(plus(89), NOW)).toBe('soon')
    expect(expiryStatus(plus(200), NOW)).toBe('ok')
  })
})

describe('isNonConform', () => {
  it('upgrade ou error = non conforme ; ok / warning seul / info = non', () => {
    expect(isNonConform(finding({ upgrade: true }))).toBe(true)
    expect(isNonConform(finding({ severity: 'error' }))).toBe(true)
    expect(isNonConform(finding({ severity: 'error', ok: true }))).toBe(false)
    expect(isNonConform(finding({ severity: 'warning' }))).toBe(false)
    expect(isNonConform(finding({ severity: 'info' }))).toBe(false)
  })
})

describe('buildActions', () => {
  it('aucune donnée → aucune action', () => {
    expect(buildActions(emptyInput(), NOW)).toEqual([])
  })

  it('pièce expirée et pièce expirante = actions ; pièce valide = aucune', () => {
    const items = buildActions(
      emptyInput({
        products: [product()],
        documents: [
          doc({ id: 'd1', expiryDate: plus(-5) }),
          doc({ id: 'd2', expiryDate: plus(40) }),
          doc({ id: 'd3', expiryDate: plus(300) }),
          doc({ id: 'd4', expiryDate: null }),
        ],
      }),
      NOW,
    )
    expect(items.map((i) => i.kind)).toEqual(['doc_expired', 'doc_expiring'])
    expect(items[0]?.label).toBe('Gynoril')
    expect(items[0]?.href).toBe('/catalogue/p1')
  })

  it('dossier en suspens (état dérivé) = action ; dossier sans correspondance = aucune', () => {
    const items = buildActions(
      emptyInput({
        dossiers: [dossier({ id: 'dos1' }), dossier({ id: 'dos2' })],
        correspondences: [corr({ id: 'c1', dossierId: 'dos1', status: 'suspended' })],
      }),
      NOW,
    )
    const suspended = items.filter((i) => i.kind === 'dossier_suspended')
    expect(suspended).toHaveLength(1)
    expect(suspended[0]?.href).toBe('/workspace/dos1')
    expect(suspended[0]?.country).toBe('CI')
  })

  it('message agence non lu = unread_reply (avec compteur) ; lu = agency_pending', () => {
    const base = emptyInput({
      correspondences: [corr({ id: 'c1', status: 'in_review' })],
      messages: [msg({ id: 'm1', createdAt: '2026-06-10T10:00:00Z' })],
    })
    const unread = buildActions(base, NOW)
    expect(unread.find((i) => i.kind === 'unread_reply')?.count).toBe(1)

    const seen = buildActions(
      { ...base, reads: [{ id: 'c1', lastSeenAt: '2026-06-11T00:00:00Z' }] },
      NOW,
    )
    expect(seen.some((i) => i.kind === 'unread_reply')).toBe(false)
    expect(seen.some((i) => i.kind === 'agency_pending')).toBe(true)
  })

  it('document non conforme (cache Regafy) = action non_conform', () => {
    const items = buildActions(
      emptyInput({
        products: [product()],
        documents: [doc({ id: 'd1', productId: 'p1' })],
        docAnalysis: [analysis({ docId: 'd1', findings: [finding({ upgrade: true })] })],
      }),
      NOW,
    )
    const nc = items.find((i) => i.kind === 'non_conform')
    expect(nc).toBeTruthy()
    expect(nc?.count).toBe(1)
    expect(nc?.href).toBe('/catalogue/p1')
  })

  it('tri par priorité : expiré avant en-suspens avant expirant', () => {
    const items = buildActions(
      emptyInput({
        products: [product()],
        documents: [doc({ id: 'd1', expiryDate: plus(-2) }), doc({ id: 'd2', expiryDate: plus(10) })],
        dossiers: [dossier({ id: 'dos1' })],
        correspondences: [corr({ id: 'c1', dossierId: 'dos1', status: 'suspended' })],
      }),
      NOW,
    )
    expect(items.map((i) => i.kind)).toEqual(['doc_expired', 'dossier_suspended', 'doc_expiring'])
  })

  it('exclut les enregistrements supprimés (soft-delete)', () => {
    const items = buildActions(
      emptyInput({
        products: [product()],
        documents: [doc({ id: 'd1', expiryDate: plus(-2), deletedAt: '2026-06-01' })],
      }),
      NOW,
    )
    expect(items).toEqual([])
  })
})
