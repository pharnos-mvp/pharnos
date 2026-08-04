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

describe('compileDossierToPdf — déterminisme des octets', () => {
  // Le métrage (migration 0082) identifie un paquet par le SHA-256 de ses octets, pour offrir la
  // RÉCUPÉRATION d'un livrable déjà payé. Si la compilation n'est pas une fonction pure de son
  // contenu, cette règle est inerte et le client repaie pour retélécharger ce qu'il possède.
  //
  // Le piège n'est pas théorique : `PDFDocument.create()` estampille /CreationDate et /ModDate
  // À LA SECONDE, dans le dictionnaire Info compressé — invisible à l'inspection du fichier.
  // Sans le gel des métadonnées, ce test échoue dès que les deux compilations tombent sur deux
  // secondes différentes.
  const input = () => ({
    dossier: dossier([]),
    generatedDocs: [],
    docs: [],
    attachments: [],
    autoStructural: true,
  })

  it('deux compilations du MÊME dossier produisent exactement les mêmes octets', async () => {
    const a = await compileDossierToPdf(input())
    // Franchir une frontière de seconde : c'est la granularité de l'horodatage de pdf-lib.
    await new Promise((r) => setTimeout(r, 1100))
    const b = await compileDossierToPdf(input())
    expect(Array.from(b.bytes)).toEqual(Array.from(a.bytes))
  })

  it('un contenu différent produit des octets différents — la récupération n’avale pas tout', async () => {
    const a = await compileDossierToPdf(input())
    const b = await compileDossierToPdf({
      ...input(),
      dossier: { ...dossier([]), productName: 'Un autre produit' },
    })
    expect(Array.from(b.bytes)).not.toEqual(Array.from(a.bytes))
  })
})
