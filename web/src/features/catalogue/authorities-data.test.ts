import { describe, expect, it } from 'vitest'

import type { DocumentRecord, DossierRecord } from '@/lib/db'
import { authorityDetail, buildAuthorityRows, filterAuthorityRows } from './authorities-data'

const dossier = (over: Partial<DossierRecord>): DossierRecord =>
  ({
    id: over.id ?? 'd',
    orgId: 'org-1',
    productId: 'p1',
    productName: 'P',
    format: 'ctd',
    activity: 'new_ma',
    country: over.country ?? 'BJ',
    status: 'draft',
    tree: [],
    excludedDocIds: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    deletedAt: over.deletedAt ?? null,
    ...over,
  }) as DossierRecord

const ammDoc = (over: Partial<DocumentRecord>): DocumentRecord =>
  ({
    id: over.id ?? 'a',
    orgId: 'org-1',
    productId: 'p1',
    category: 'admin',
    docType: over.docType ?? 'amm',
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
    deletedAt: over.deletedAt ?? null,
    ...over,
  }) as DocumentRecord

describe('authorities-data (référentiel Autorités)', () => {
  it('liste les agences curées (UEMOA + NAFDAC) avec langue officielle et barème', () => {
    const rows = buildAuthorityRows([], [])
    const codes = rows.map((r) => r.code)
    expect(codes).toEqual(expect.arrayContaining(['BJ', 'BF', 'CI', 'ML', 'SN', 'TG', 'NG']))
    const bj = rows.find((r) => r.code === 'BJ')
    expect(bj?.agency.name).toBe('ABMed')
    expect(bj?.officialLang).toBe('fr')
    expect(bj?.hasProfile).toBe(true) // barème Bénin renseigné
    const ng = rows.find((r) => r.code === 'NG')
    expect(ng?.officialLang).toBe('en') // Nigeria anglophone
    expect(ng?.hasProfile).toBe(false)
  })

  it("compte les dossiers et AMM actifs de l'org par pays", () => {
    const dossiers = [
      dossier({ id: 'd1', country: 'BJ' }),
      dossier({ id: 'd2', country: 'BJ' }),
      dossier({ id: 'd3', country: 'CI' }),
      dossier({ id: 'd4', country: 'BJ', deletedAt: '2026-02-01T00:00:00.000Z' }), // supprimé → exclu
    ]
    const docs = [
      ammDoc({ id: 'a1', country: 'BJ' }),
      ammDoc({ id: 'a2', country: 'CI', docType: 'gmp' }), // pas une AMM → exclu
      ammDoc({ id: 'a3', country: 'BJ', deletedAt: '2026-02-01T00:00:00.000Z' }), // supprimé → exclu
    ]
    const rows = buildAuthorityRows(dossiers, docs)
    const bj = rows.find((r) => r.code === 'BJ')
    expect(bj?.dossierCount).toBe(2)
    expect(bj?.ammCount).toBe(1)
    expect(rows.find((r) => r.code === 'CI')?.dossierCount).toBe(1)
  })

  it('filtre par sigle / nom / code', () => {
    const rows = buildAuthorityRows([], [])
    expect(filterAuthorityRows(rows, 'ABMed').map((r) => r.code)).toEqual(['BJ'])
    expect(filterAuthorityRows(rows, 'nafdac').map((r) => r.code)).toEqual(['NG'])
    expect(filterAuthorityRows(rows, 'régulation').length).toBeGreaterThan(0)
  })

  it('détail : agence + civilité + langue + barème', () => {
    const bj = authorityDetail('BJ')
    expect(bj?.agency.full).toContain('Agence Béninoise')
    expect(bj?.civilite).toMatch(/Directeur|Directrice/)
    expect(bj?.profile?.currency).toBe('FCFA')
    expect(authorityDetail('ZZ')).toBeUndefined()
  })
})
