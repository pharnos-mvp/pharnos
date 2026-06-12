import { describe, expect, it } from 'vitest'

import type { CorrespondenceRecord } from '@/lib/db'
import { dossierDisplayStatus, statusLabel } from './correspondence-constants'

const base = (over: Partial<CorrespondenceRecord>): CorrespondenceRecord => ({
  id: 'c1',
  orgId: 'org-1',
  dossierId: 'd1',
  productName: 'Doliprane',
  country: 'CI',
  activity: 'new_ma',
  senderEmail: 'labo@ex.com',
  recipientEmail: 'agence@ex.com',
  note: null,
  pdfPath: 'org/shares/c1/module1.pdf',
  pdfSize: 1000,
  tokenHash: 'h',
  passwordHash: null,
  status: 'in_review',
  decidedAt: null,
  revokedAt: null,
  createdAt: '2026-06-01T00:00:00.000Z',
  updatedAt: '2026-06-01T00:00:00.000Z',
  deletedAt: null,
  ...over,
})

describe('dossierDisplayStatus (état dérivé — zéro écriture serveur dans dossiers)', () => {
  it('draft sans aucune correspondance', () => {
    expect(dossierDisplayStatus('d1', [])).toBe('draft')
  })

  it('en review dès l’envoi, décision du reviewer ensuite', () => {
    const c = base({})
    expect(dossierDisplayStatus('d1', [c])).toBe('in_review')
    expect(dossierDisplayStatus('d1', [base({ status: 'accepted' })])).toBe('accepted')
  })

  it('la correspondance la plus récente l’emporte (renvoi après rejet)', () => {
    const oldRejected = base({ id: 'c1', status: 'rejected', createdAt: '2026-06-01T00:00:00Z' })
    const renvoi = base({ id: 'c2', status: 'in_review', createdAt: '2026-06-02T00:00:00Z' })
    expect(dossierDisplayStatus('d1', [oldRejected, renvoi])).toBe('in_review')
  })

  it('révoquée SANS décision → ne compte plus (retour draft)', () => {
    const revoked = base({ revokedAt: '2026-06-02T00:00:00Z' })
    expect(dossierDisplayStatus('d1', [revoked])).toBe('draft')
  })

  it('révoquée APRÈS décision → la décision reste acquise', () => {
    const c = base({ status: 'suspended', revokedAt: '2026-06-02T00:00:00Z' })
    expect(dossierDisplayStatus('d1', [c])).toBe('suspended')
  })

  it('ignore les correspondances d’autres dossiers et les supprimées', () => {
    const other = base({ dossierId: 'd2', status: 'accepted' })
    const deleted = base({ deletedAt: '2026-06-02T00:00:00Z', status: 'accepted' })
    expect(dossierDisplayStatus('d1', [other, deleted])).toBe('draft')
  })
})

describe('statusLabel (libellés CEO)', () => {
  it('couvre les 5 états + fallback', () => {
    expect(statusLabel('draft')).toBe('Draft')
    expect(statusLabel('in_review')).toBe('En review')
    expect(statusLabel('accepted')).toBe('Accepté')
    expect(statusLabel('suspended')).toBe('En suspens')
    expect(statusLabel('rejected')).toBe('Rejeté')
    expect(statusLabel('inconnu')).toBe('Draft')
  })
})
