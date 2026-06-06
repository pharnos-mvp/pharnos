import { describe, expect, it } from 'vitest'

import type { DossierRecord } from '@/lib/db'
import { dossierToRow, rowToDossier } from './dossier-sync'

const rec: DossierRecord = {
  id: 'd1',
  orgId: 'org-1',
  productId: 'p1',
  productName: 'Doliprane',
  format: 'ctd',
  activity: 'new_ma',
  country: 'CI',
  status: 'draft',
  tree: [{ id: 'n1', number: '1.0', label: 'TdM' }],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-02T00:00:00.000Z',
  deletedAt: null,
}

describe('dossier sync mapping', () => {
  it('round-trip DossierRecord <-> row (arbre préservé)', () => {
    const back = rowToDossier(dossierToRow(rec))
    expect(back).toEqual(rec)
    expect(back.tree[0]?.label).toBe('TdM')
  })

  it('mappe en snake_case', () => {
    const row = dossierToRow(rec)
    expect(row.org_id).toBe('org-1')
    expect(row.product_name).toBe('Doliprane')
    expect(row.product_id).toBe('p1')
  })
})
