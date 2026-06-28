import { describe, expect, it } from 'vitest'

import type { PartyRecord } from '@/lib/db'
import { partyToRow, rowToParty } from './parties-sync'

const rec: PartyRecord = {
  id: 'party-1',
  orgId: 'org-1',
  nom: 'Synthia Labs GmbH',
  roles: ['fabricant', 'titulaire'],
  pays: 'DE',
  adresse: '5 Industriestrasse, Berlin',
  gmpCertificat: 'GMP-2024-001',
  gmpExpiry: '2027-01-01',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-02T00:00:00.000Z',
  deletedAt: null,
}

describe('sync mapping organisations (parties)', () => {
  it('round-trip PartyRecord <-> PartyRow', () => {
    expect(rowToParty(partyToRow(rec))).toEqual(rec)
  })

  it('mappe correctement les colonnes snake_case', () => {
    const row = partyToRow(rec)
    expect(row.org_id).toBe('org-1')
    expect(row.gmp_certificat).toBe('GMP-2024-001')
    expect(row.gmp_expiry).toBe('2027-01-01')
    expect(row.roles).toEqual(['fabricant', 'titulaire'])
  })
})
