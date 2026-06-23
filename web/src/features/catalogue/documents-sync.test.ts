import { describe, expect, it } from 'vitest'

import type { DocumentRecord } from '@/lib/db'
import { documentToRow, rowToDocument } from './documents-sync'

const rec: DocumentRecord = {
  id: 'd1',
  orgId: 'org-1',
  productId: 'prod-1',
  category: 'admin',
  docType: 'gmp',
  fileName: 'gmp.pdf',
  mimeType: 'application/pdf',
  size: 10,
  language: 'fr',
  expiryDate: '2027-01-01',
  status: 'active',
  filePath: 'org-1/prod-1/d1/gmp.pdf',
  uploaded: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-02T00:00:00.000Z',
  deletedAt: null,
}

describe('documents sync mapping', () => {
  it('documentToRow → colonnes snake_case', () => {
    const row = documentToRow(rec)
    expect(row.org_id).toBe('org-1')
    expect(row.product_id).toBe('prod-1')
    expect(row.doc_type).toBe('gmp')
    expect(row.expiry_date).toBe('2027-01-01')
    expect(row.file_path).toBe('org-1/prod-1/d1/gmp.pdf')
  })

  it('rowToDocument dérive le fileName du file_path et marque uploaded', () => {
    const doc = rowToDocument(documentToRow(rec))
    expect(doc.fileName).toBe('gmp.pdf')
    expect(doc.uploaded).toBe(true)
    expect(doc.orgId).toBe('org-1')
    expect(doc.category).toBe('admin')
  })

  it('mappe issue_date / reference (pièce AMM, `0042`) en round-trip', () => {
    const amm: DocumentRecord = {
      ...rec,
      docType: 'amm',
      issueDate: '2021-03-17',
      reference: 'AMM_2015_7457',
    }
    const row = documentToRow(amm)
    expect(row.issue_date).toBe('2021-03-17')
    expect(row.reference).toBe('AMM_2015_7457')
    const back = rowToDocument(row)
    expect(back.issueDate).toBe('2021-03-17')
    expect(back.reference).toBe('AMM_2015_7457')
  })

  it('pièce sans AMM : issue_date / reference nuls côté row', () => {
    const row = documentToRow(rec)
    expect(row.issue_date).toBeNull()
    expect(row.reference).toBeNull()
  })
})
