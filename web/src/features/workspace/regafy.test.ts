import { describe, expect, it } from 'vitest'

import type { DocumentRecord, GeneratedDocRecord } from '@/lib/db'
import type { CtdNodeDef } from './module1-tree'
import { runRegafy } from './regafy'

const tree: CtdNodeDef[] = [
  {
    id: 'a',
    number: '1.1',
    label: 'Correspondance',
    children: [{ id: 'b', number: '1.1.1', label: 'Lettre' }],
  },
]
const treeSaved: CtdNodeDef[] = [
  {
    id: 'a',
    number: '1.1',
    label: 'Correspondance',
    children: [{ id: 'b', number: '1.1.1', label: 'Lettre', savedAt: '2026-01-01T00:00:00Z' }],
  },
]

function gen(nodeNumber: string, text: string): GeneratedDocRecord {
  return {
    id: `g-${nodeNumber}`,
    orgId: 'o',
    dossierId: 'd',
    nodeNumber,
    templateKey: 'cover',
    title: 'Lettre',
    content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] },
    status: 'draft',
    createdAt: '',
    updatedAt: '',
    deletedAt: null,
  }
}

const empty = {
  docsByNode: new Map(),
  genByNode: new Map<string, GeneratedDocRecord>(),
  attachByNode: new Map(),
}

describe('regafy (vérifications déterministes, progressif)', () => {
  it("rien tant qu'aucune section n'est validée", () => {
    const genByNode = new Map([['1.1.1', gen('1.1.1', 'Bonjour')]])
    const f = runRegafy({
      tree,
      titulaire: 'Labo',
      docsByNode: new Map(),
      genByNode,
      attachByNode: new Map(),
    })
    expect(f).toHaveLength(0)
  })

  it('section validée sans document → avertissement + dossier vide', () => {
    const f = runRegafy({ tree: treeSaved, titulaire: 'Labo', ...empty })
    expect(f.some((x) => x.severity === 'warning' && x.nodeNumber === '1.1.1')).toBe(true)
    expect(f.some((x) => x.severity === 'error' && x.message.includes('vide'))).toBe(true)
  })

  it('titulaire manquant (après validation) → avertissement', () => {
    const f = runRegafy({ tree: treeSaved, titulaire: '  ', ...empty })
    expect(f.some((x) => x.message.includes('Titulaire'))).toBe(true)
  })

  it('placeholder restant → « à compléter »', () => {
    const genByNode = new Map([['1.1.1', gen('1.1.1', '[Ville] à compléter')]])
    const f = runRegafy({
      tree: treeSaved,
      titulaire: 'Labo',
      docsByNode: new Map(),
      genByNode,
      attachByNode: new Map(),
    })
    expect(f.some((x) => x.message.includes('compléter'))).toBe(true)
  })
})

function doc(partial: Partial<DocumentRecord>): DocumentRecord {
  return {
    id: 'doc-' + Math.random().toString(36).slice(2),
    orgId: 'o',
    productId: 'p',
    category: 'admin',
    docType: 'gmp',
    fileName: 'f.pdf',
    mimeType: 'application/pdf',
    size: 1,
    language: null,
    expiryDate: null,
    status: 'active',
    filePath: null,
    uploaded: false,
    createdAt: '',
    updatedAt: '',
    deletedAt: null,
    ...partial,
  }
}

function plusMonths(n: number): string {
  const d = new Date()
  d.setMonth(d.getMonth() + n)
  return d.toISOString().slice(0, 10)
}

describe('regafy — validité des pièces & contrat (copilote)', () => {
  it('pièce administrative à < 6 mois → avertissement', () => {
    const docsByNode = new Map([
      ['1.1.1', [doc({ category: 'admin', docType: 'gmp', expiryDate: plusMonths(3) })]],
    ])
    const f = runRegafy({ tree, titulaire: 'Labo', docsByNode, ...emptyGenAtt })
    expect(f.some((x) => x.severity === 'warning' && x.message.includes('6 mois'))).toBe(true)
  })

  it('COA à < 18 mois → avertissement', () => {
    const docsByNode = new Map([
      ['1.1.1', [doc({ category: 'info', docType: 'coa', expiryDate: plusMonths(12) })]],
    ])
    const f = runRegafy({ tree, titulaire: 'Labo', docsByNode, ...emptyGenAtt })
    expect(f.some((x) => x.message.includes('18 mois'))).toBe(true)
  })

  it('COA valide > 18 mois → aucun constat de validité', () => {
    const docsByNode = new Map([
      ['1.1.1', [doc({ category: 'info', docType: 'coa', expiryDate: plusMonths(24) })]],
    ])
    const f = runRegafy({ tree, titulaire: 'Labo', docsByNode, ...emptyGenAtt })
    expect(f.some((x) => x.message.includes('18 mois'))).toBe(false)
  })

  it('pièce expirée → erreur', () => {
    const docsByNode = new Map([['1.1.1', [doc({ expiryDate: plusMonths(-1) })]]])
    const f = runRegafy({ tree, titulaire: 'Labo', docsByNode, ...emptyGenAtt })
    expect(f.some((x) => x.severity === 'error' && x.message.includes('expirée'))).toBe(true)
  })

  it('titulaire ≠ fabricant sans contrat → avertissement', () => {
    const f = runRegafy({
      tree,
      titulaire: 'Labo A',
      fabricant: 'Usine B',
      docsByNode: new Map(),
      ...emptyGenAtt,
    })
    expect(f.some((x) => x.id === 'contract')).toBe(true)
  })

  it('titulaire ≠ fabricant AVEC contrat fourni → pas d’avertissement', () => {
    const docsByNode = new Map([['1.1.1', [doc({ docType: 'contract' })]]])
    const f = runRegafy({
      tree,
      titulaire: 'Labo A',
      fabricant: 'Usine B',
      docsByNode,
      ...emptyGenAtt,
    })
    expect(f.some((x) => x.id === 'contract')).toBe(false)
  })
})

const emptyGenAtt = {
  genByNode: new Map<string, GeneratedDocRecord>(),
  attachByNode: new Map(),
}
