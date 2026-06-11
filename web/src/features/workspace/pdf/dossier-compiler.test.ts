import { describe, expect, it } from 'vitest'

import type { DocumentRecord, DossierRecord } from '@/lib/db'
import { compileDossierToPdf } from './dossier-compiler'

function doc(id: string, fileName: string): DocumentRecord {
  return {
    id,
    orgId: 'o',
    productId: 'p',
    category: 'info',
    docType: 'rcp',
    fileName,
    mimeType: 'application/pdf',
    size: 1000,
    language: 'fr',
    expiryDate: null,
    status: 'active',
    filePath: null,
    uploaded: false,
    createdAt: '',
    updatedAt: '',
    deletedAt: null,
  }
}

function dossier(excludedDocIds: string[]): DossierRecord {
  return {
    id: 'd1',
    orgId: 'o',
    productId: 'p',
    productName: 'Produit Démo',
    format: 'ctd',
    activity: 'new_ma',
    country: 'BJ',
    status: 'draft',
    tree: [{ number: '1.3', label: 'Produit', children: [{ number: '1.3.1', label: 'RCP' }] }],
    excludedDocIds,
    createdAt: '',
    updatedAt: '',
    deletedAt: null,
  }
}

describe('compileDossierToPdf — exclusions du dossier', () => {
  it('un document produit RETIRÉ du dossier (excludedDocIds) est ignoré par la compilation', async () => {
    // Sans blob local ni Storage, chaque doc TRAITÉ finit dans `missing` — traceur parfait
    // du filtre : le doc exclu ne doit même pas y apparaître.
    const docs = [doc('doc-a', 'rcp-a.pdf'), doc('doc-b', 'rcp-b.pdf')]

    const both = await compileDossierToPdf({
      dossier: dossier([]),
      generatedDocs: [],
      docs,
      attachments: [],
      autoStructural: true,
    })
    expect(both.missing.sort()).toEqual(['rcp-a.pdf', 'rcp-b.pdf'])

    const filtered = await compileDossierToPdf({
      dossier: dossier(['doc-b']),
      generatedDocs: [],
      docs,
      attachments: [],
      autoStructural: true,
    })
    expect(filtered.missing).toEqual(['rcp-a.pdf'])
  })
})
