import { describe, expect, it } from 'vitest'

import type { DocAnalysisRecord, DocumentRecord, DossierRecord, ProductRecord } from '@/lib/db'
import {
  buildCatalogueRows,
  catalogueCountries,
  filterCatalogueRows,
  type CatalogueRow,
} from './catalogue-list-data'

const NOW = new Date('2026-06-27T00:00:00Z')

/** Premier élément non-undefined (satisfait `noUncheckedIndexedAccess`). */
function firstRow(rows: CatalogueRow[]): CatalogueRow {
  const r = rows[0]
  if (!r) throw new Error('expected at least one row')
  return r
}

function product(over: Partial<ProductRecord> & { id: string }): ProductRecord {
  return {
    orgId: 'org',
    nomCommercial: '',
    dci: '',
    dosage: '',
    forme: '',
    presentation: '',
    classeTherapeutique: '',
    codeAtc: '',
    titulaire: '',
    fabricant: '',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    deletedAt: null,
    ...over,
  }
}

function doc(over: Partial<DocumentRecord> & { id: string; productId: string }): DocumentRecord {
  return {
    orgId: 'org',
    category: 'admin',
    docType: 'amm',
    fileName: 'f.pdf',
    mimeType: 'application/pdf',
    size: 1,
    language: 'fr',
    expiryDate: null,
    status: 'ready',
    filePath: null,
    uploaded: false,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    deletedAt: null,
    ...over,
  }
}

function dossier(
  over: Partial<DossierRecord> & { id: string; productId: string; country: string },
): DossierRecord {
  return {
    orgId: 'org',
    productName: 'P',
    format: 'ectd',
    activity: 'new_ma',
    status: 'draft',
    tree: [],
    excludedDocIds: [],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    deletedAt: null,
    ...over,
  } as DossierRecord
}

function analysis(docId: string, nonConform: number): DocAnalysisRecord {
  const findings = Array.from({ length: nonConform }, (_, i) => ({
    id: `f${i}`,
    ok: false,
    severity: 'error' as const,
  }))
  return { docId, findings, analyzedAt: '2026-06-01T00:00:00Z' } as unknown as DocAnalysisRecord
}

describe('buildCatalogueRows', () => {
  it('agrège pays, AMM, échéances et conformité par produit', () => {
    const p = product({ id: 'p1', nomCommercial: 'Amoxil', updatedAt: '2026-06-20T00:00:00Z' })
    const documents = [
      // AMM expirée → ammStatus 'expired'
      doc({ id: 'd1', productId: 'p1', docType: 'amm', expiryDate: '2026-01-01' }),
      // COA dans sa fenêtre (≤ 18 mois) → expiring
      doc({ id: 'd2', productId: 'p1', docType: 'coa', expiryDate: '2026-09-01' }),
    ]
    const dossiers = [
      dossier({ id: 'do1', productId: 'p1', country: 'BJ' }),
      dossier({ id: 'do2', productId: 'p1', country: 'CI' }),
      dossier({ id: 'do3', productId: 'p1', country: 'BJ' }), // doublon pays
    ]
    const docAnalysis = [analysis('d1', 2)] // 1 doc analysé, non conforme

    const row = firstRow(buildCatalogueRows([p], documents, dossiers, docAnalysis, NOW))
    expect(row.countries.sort()).toEqual(['BJ', 'CI'])
    expect(row.ammStatus).toBe('expired')
    expect(row.hasExpiring).toBe(true)
    expect(row.expiringCount).toBeGreaterThan(0)
    expect(row.hasNonConform).toBe(true)
    expect(row.nonConformCount).toBe(1)
    expect(row.conformityPct).toBe(0) // 1 analysé, 1 non conforme
  })

  it('AMM active sans date = active ; aucune AMM = none', () => {
    const active = buildCatalogueRows(
      [product({ id: 'a' })],
      [doc({ id: 'da', productId: 'a', docType: 'amm', expiryDate: null })],
      [],
      [],
      NOW,
    )
    expect(firstRow(active).ammStatus).toBe('active')

    const none = buildCatalogueRows([product({ id: 'b' })], [], [], [], NOW)
    expect(firstRow(none).ammStatus).toBe('none')
    expect(firstRow(none).countries).toEqual([])
    expect(firstRow(none).conformityPct).toBeNull()
  })

  it('exclut les produits supprimés et trie par updatedAt décroissant', () => {
    const rows = buildCatalogueRows(
      [
        product({ id: 'old', updatedAt: '2026-01-01T00:00:00Z' }),
        product({ id: 'new', updatedAt: '2026-06-01T00:00:00Z' }),
        product({ id: 'gone', deletedAt: '2026-02-01T00:00:00Z' }),
      ],
      [],
      [],
      [],
      NOW,
    )
    expect(rows.map((r) => r.product.id)).toEqual(['new', 'old'])
  })
})

describe('filterCatalogueRows', () => {
  const rows: CatalogueRow[] = buildCatalogueRows(
    [
      product({ id: 'p1', nomCommercial: 'Amoxil', dci: 'Amoxicilline', codeAtc: 'J01CA04' }),
      product({ id: 'p2', nomCommercial: 'Doliprane', dci: 'Paracétamol' }),
    ],
    [
      doc({ id: 'd2', productId: 'p2', docType: 'coa', expiryDate: '2026-09-01' }), // p2 expiring
    ],
    [dossier({ id: 'do1', productId: 'p1', country: 'BJ' })], // p1 only in BJ
    [],
    NOW,
  )

  it('recherche par nom / DCI / ATC (insensible à la casse)', () => {
    expect(
      filterCatalogueRows(rows, { q: 'amox', country: '', status: 'all' }).map((r) => r.product.id),
    ).toEqual(['p1'])
    expect(
      filterCatalogueRows(rows, { q: 'PARACÉTAMOL', country: '', status: 'all' }).map(
        (r) => r.product.id,
      ),
    ).toEqual(['p2'])
    expect(
      filterCatalogueRows(rows, { q: 'j01', country: '', status: 'all' }).map((r) => r.product.id),
    ).toEqual(['p1'])
  })

  it('filtre par pays', () => {
    expect(
      filterCatalogueRows(rows, { q: '', country: 'BJ', status: 'all' }).map((r) => r.product.id),
    ).toEqual(['p1'])
    expect(filterCatalogueRows(rows, { q: '', country: 'CI', status: 'all' })).toEqual([])
  })

  it('filtre par statut échéance / conformité', () => {
    expect(
      filterCatalogueRows(rows, { q: '', country: '', status: 'expiring' }).map(
        (r) => r.product.id,
      ),
    ).toEqual(['p2'])
    expect(filterCatalogueRows(rows, { q: '', country: '', status: 'nonconform' })).toEqual([])
  })

  it('catalogueCountries renvoie les pays distincts', () => {
    expect(catalogueCountries(rows)).toEqual(['BJ'])
  })
})
